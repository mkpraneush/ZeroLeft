from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from bson import ObjectId
from app.database import get_db
from app.auth import get_current_vendor
from app.models import ShopLocation, VendorProfileUpdate
from app.config import get_settings
import cloudinary
import cloudinary.uploader
from PIL import Image, UnidentifiedImageError

settings = get_settings()
router = APIRouter(prefix="/vendor", tags=["vendor"])


def _configure_cloudinary():
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
    )


def _vendor_out(v: dict) -> dict:
    v["id"] = v.pop("_id")
    return v


@router.get("/profile")
async def get_vendor_profile(current_user=Depends(get_current_vendor), db=Depends(get_db)):
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    if not vendor:
        raise HTTPException(404, "Vendor profile not found")
    return _vendor_out(vendor)


@router.put("/profile")
async def update_vendor_profile(
    data: VendorProfileUpdate,
    current_user=Depends(get_current_vendor),
    db=Depends(get_db),
):
    # Prevent overwriting confirmed shop location via this route
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(400, "Provide at least one profile field to update")
    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.vendors.update_one(
        {"user_id": current_user["_id"]},
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Vendor profile not found")

    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    return _vendor_out(vendor)


@router.put("/location")
async def save_shop_location(
    location: ShopLocation,
    current_user=Depends(get_current_vendor),
    db=Depends(get_db),
):
    """Dedicated endpoint to save/update confirmed shop coordinates."""
    if len(location.coordinates) != 2:
        raise HTTPException(400, "Coordinates must be [longitude, latitude]")

    lng, lat = location.coordinates
    if not (-180 <= lng <= 180) or not (-90 <= lat <= 90):
        raise HTTPException(400, "Invalid coordinates")

    now = datetime.now(timezone.utc)
    result = await db.vendors.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {
            "location": {
                "type": "Point",
                "coordinates": [lng, lat],
                "address": location.address,
            },
            "updated_at": now,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Vendor profile not found")

    return {"message": "Shop location saved", "coordinates": [lng, lat], "address": location.address}


@router.post("/upload-image")
async def upload_product_image(
    file: UploadFile = File(...),
    current_user=Depends(get_current_vendor),
):
    """Store an image in Cloudinary or the backend's persistent media directory."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Upload an image file")

    contents = await file.read(10 * 1024 * 1024 + 1)
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image must be 10 MB or smaller")
    try:
        with Image.open(BytesIO(contents)) as image:
            image.verify()
            image_format = image.format
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(400, "The uploaded file is not a valid supported image") from exc

    extensions = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
    extension = extensions.get(image_format or "")
    if not extension:
        raise HTTPException(400, "Use a JPEG, PNG, or WebP image")

    if settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret:
        _configure_cloudinary()
        try:
            result = cloudinary.uploader.upload(
                contents,
                folder="zeroleft/products",
                resource_type="image",
                transformation=[{"width": 800, "crop": "limit", "quality": "auto"}],
            )
        except Exception as exc:
            raise HTTPException(502, "Image upload failed. Please try again.") from exc
        return {"image_url": result["secure_url"], "public_id": result["public_id"]}

    uploads_dir = Path(__file__).resolve().parents[2] / settings.uploads_dir
    filename = f"{uuid4().hex}.{extension}"
    try:
        uploads_dir.mkdir(parents=True, exist_ok=True)
        (uploads_dir / filename).write_bytes(contents)
    except Exception as exc:
        raise HTTPException(500, "Image could not be saved to local media storage") from exc
    return {
        "image_url": f"{settings.backend_url.rstrip('/')}/media/{filename}",
        "public_id": filename.rsplit(".", 1)[0],
    }


@router.get("/dashboard")
async def vendor_dashboard(current_user=Depends(get_current_vendor), db=Depends(get_db)):
    """Return aggregated dashboard data for the vendor."""
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    if not vendor:
        raise HTTPException(404, "Vendor profile not found")
    vendor_id = vendor["_id"]

    now = datetime.now(timezone.utc)

    # Fetch all products for this vendor
    products = await db.products.find({"vendor_id": vendor_id}).to_list(200)

    # Classify products
    active, scheduled, expired, sold_out = [], [], [], []
    newly_expired_ids = []
    for p in products:
        original_status = p.get("session_status")
        p["id"] = p.pop("_id")
        status = _compute_session_status(p, now)
        p["session_status"] = status
        p["stock_status"] = _compute_stock_status(p, status)
        if status == "expired" and original_status not in ("expired", "cancelled"):
            newly_expired_ids.append(p["id"])

        if p["available_quantity"] <= 0:
            sold_out.append(p)
        elif status == "scheduled":
            scheduled.append(p)
        elif status == "active":
            active.append(p)
        else:
            expired.append(p)

    if newly_expired_ids:
        await db.products.update_many(
            {"_id": {"$in": newly_expired_ids}, "session_status": {"$nin": ["cancelled", "expired"]}},
            {"$set": {"session_status": "expired", "updated_at": now}},
        )

    product_ids = [product["id"] for product in products]
    notification_records = await db.email_notifications_sent.find(
        {"product_id": {"$in": product_ids}},
        {"product_id": 1, "status": 1},
    ).to_list(10000) if product_ids else []
    notification_counts = {}
    for record in notification_records:
        counts = notification_counts.setdefault(
            record["product_id"], {"eligible": 0, "sent": 0, "failed": 0, "pending": 0}
        )
        counts["eligible"] += 1
        state = record.get("status", "sent")
        if state in ("sent", "failed", "pending"):
            counts[state] += 1
    for product in products:
        product["notification_status"] = notification_counts.get(
            product["id"], {"eligible": 0, "sent": 0, "failed": 0, "pending": 0}
        )

    # Fetch reservations
    reservations = await db.reservations.find({"vendor_id": vendor_id}).sort("reserved_at", -1).to_list(200)
    for r in reservations:
        r.pop("active_key", None)
        r.pop("email_status_for", None)
        r["id"] = r.pop("_id")

    incoming = [r for r in reservations if r["status"] == "reserved"]
    packing = [r for r in reservations if r["status"] in ("confirmed", "packed", "ready")]
    completed = [r for r in reservations if r["status"] == "collected"]
    cancelled = [r for r in reservations if r["status"] in ("cancelled", "expired")]

    return {
        "vendor": _vendor_out(vendor),
        "active_offers": active,
        "scheduled_offers": scheduled,
        "expired_offers": expired,
        "sold_out_offers": sold_out,
        "incoming_reservations": incoming,
        "packing_queue": packing,
        "completed_collections": completed,
        "cancelled_reservations": cancelled,
    }


def _compute_session_status(product: dict, now: datetime) -> str:
    start = product.get("session_start")
    end = product.get("session_end")
    if product.get("session_status") == "cancelled":
        return "cancelled"
    if not start or not end:
        return "scheduled"
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if now < start:
        return "scheduled"
    if start <= now <= end:
        return "active"
    return "expired"


def _compute_stock_status(product: dict, session_status: str) -> str:
    if session_status in ("expired", "cancelled"):
        return "offer_expired"
    avail = product.get("available_quantity", 0)
    initial = product.get("initial_quantity", 1)
    if avail <= 0:
        return "sold_out"
    if avail / initial <= 0.25:
        return "limited"
    return "available"
