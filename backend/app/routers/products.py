from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime, timezone
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from app.database import get_db
from app.auth import get_current_vendor
from app.models import ProductCreate, ProductUpdate, SessionStatus
from app.email_service import send_offer_notification_email, _safe_log
import math

router = APIRouter(prefix="/products", tags=["products"])


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
    if avail / max(initial, 0.001) <= 0.25:
        return "limited"
    return "available"


def _haversine(lat1, lon1, lat2, lon2) -> float:
    """Return distance in km between two GPS points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    a = min(1.0, max(0.0, a))
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _product_out(p: dict, vendor: dict = None, distance_km: float = None, active_res: int = 0) -> dict:
    now = datetime.now(timezone.utc)
    p_id = str(p.get("_id", p.get("id", "")))
    session_status = _compute_session_status(p, now)
    stock_status = _compute_stock_status(p, session_status)

    result = {
        "id": p_id,
        "vendor_id": p.get("vendor_id", ""),
        "vendor_name": vendor.get("user_full_name", vendor.get("shop_name", "")) if vendor else p.get("vendor_name", ""),
        "shop_name": vendor.get("shop_name", "") if vendor else p.get("shop_name", ""),
        "shop_address": vendor.get("shop_address", "") if vendor else p.get("shop_address", ""),
        "shop_location": vendor.get("location") if vendor else p.get("shop_location"),
        "product_name": p["product_name"],
        "category": p["category"],
        "initial_quantity": p["initial_quantity"],
        "available_quantity": p["available_quantity"],
        "reserved_quantity": p.get("reserved_quantity", 0),
        "collected_quantity": p.get("collected_quantity", 0),
        "unit": p["unit"],
        "price_per_unit": p["price_per_unit"],
        "original_price_per_unit": p.get("original_price_per_unit", p["price_per_unit"]),
        "discount_percent": p.get("discount_percent", 0),
        "session_start": p["session_start"],
        "session_end": p["session_end"],
        "session_status": session_status,
        "stock_status": stock_status,
        "image_url": p.get("image_url"),
        "description": p.get("description"),
        "distance_km": distance_km,
        "active_reservations_count": active_res,
        "created_at": p["created_at"],
        "updated_at": p["updated_at"],
    }
    return result


@router.post("/", status_code=201)
async def create_product(
    product: ProductCreate,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_vendor),
    db=Depends(get_db),
):
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    if not vendor:
        raise HTTPException(404, "Vendor profile not found")

    if not vendor.get("location") or not vendor["location"].get("coordinates"):
        raise HTTPException(400, "Save your shop coordinates before publishing an offer")

    now = datetime.now(timezone.utc)
    if product.session_start.tzinfo is None or product.session_end.tzinfo is None:
        raise HTTPException(400, "Session times must include a timezone")
    if product.session_end <= product.session_start:
        raise HTTPException(400, "Session end must be after session start")
    if product.session_end < now:
        raise HTTPException(400, "Session end time is in the past")
    if product.initial_quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    if product.price_per_unit <= 0:
        raise HTTPException(400, "Price must be positive")

    product_id = str(ObjectId())
    product_doc = {
        "_id": product_id,
        "vendor_id": vendor["_id"],
        "product_name": product.product_name,
        "category": product.category,
        "initial_quantity": product.initial_quantity,
        "available_quantity": product.initial_quantity,
        "reserved_quantity": 0.0,
        "collected_quantity": 0.0,
        "unit": product.unit,
        "original_price_per_unit": product.price_per_unit,
        "discount_percent": product.discount_percent,
        "price_per_unit": round(
            product.price_per_unit * (1 - product.discount_percent / 100), 2
        ),
        "session_start": product.session_start,
        "session_end": product.session_end,
        "session_status": "scheduled",
        "image_url": product.image_url,
        "description": product.description,
        "created_at": now,
        "updated_at": now,
    }
    await db.products.insert_one(product_doc)

    # Notification status is persisted separately and visible to the vendor.
    background_tasks.add_task(
        _notify_customers_on_product, product_id, vendor, product_doc, db, is_update=False
    )

    return _product_out(product_doc, vendor=vendor)


async def _notify_customers_on_product(product_id: str, vendor: dict, product_doc: dict, db, is_update: bool = False):
    """
    Find registered customers (emails gathered from registration phase)
    and dispatch the product email alert.
    """
    vendor_lng, vendor_lat = None, None
    if vendor and vendor.get("location") and vendor["location"].get("coordinates"):
        coords = vendor["location"]["coordinates"]
        if len(coords) == 2:
            vendor_lng, vendor_lat = coords

    # 1. Fetch all customer accounts from users collection (registered during sign up)
    customers_cursor = db.users.find({
        "role": "customer",
        "is_active": {"$ne": False},
    })

    async for user in customers_cursor:
        user_id = user["_id"]
        to_email = user.get("email")
        customer_name = user.get("full_name") or "Valued Customer"

        if not to_email:
            continue

        # 2. Check customer preferences
        customer = await db.customers.find_one({"user_id": user_id})
        cust_id = customer["_id"] if customer else user_id
        preferences = customer.get("preferences", {}) if customer else {}

        if preferences.get("email_notifications") is False:
            continue

        # Optional category filtering if customer set specific preferences
        prefs_cat = preferences.get("preferred_categories", [])
        if prefs_cat and product_doc.get("category") and product_doc["category"] not in prefs_cat:
            continue

        # Distance is included in the email when both locations exist.
        # Customers who registered with an email still get the alert even without a saved location.
        distance_km = None
        if vendor_lat is not None and vendor_lng is not None and customer:
            loc = customer.get("preferred_location")
            if loc and loc.get("coordinates") and len(loc["coordinates"]) == 2:
                cust_lng, cust_lat = loc["coordinates"]
                distance_km = round(_haversine(cust_lat, cust_lng, vendor_lat, vendor_lng), 1)

        # 4. Upsert notification tracking record
        now = datetime.now(timezone.utc)
        await db.email_notifications_sent.update_one(
            {"product_id": product_id, "customer_id": cust_id},
            {"$set": {
                "status": "pending",
                "sent_at": now,
                "is_update": is_update,
            }},
            upsert=True,
        )

        try:
            await send_offer_notification_email(
                to_email=to_email,
                customer_name=customer_name,
                product=product_doc,
                shop=vendor,
                distance_km=distance_km,
                offer_id=product_id,
                is_update=is_update,
            )
            await db.email_notifications_sent.update_one(
                {"product_id": product_id, "customer_id": cust_id},
                {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc)}},
                upsert=True,
            )
            _safe_log(f"[PRODUCT EMAIL NOTIFICATION] Successfully sent to customer {to_email} ({'Updated' if is_update else 'New'} {product_doc.get('product_name')})")
        except Exception as exc:
            _safe_log(f"[PRODUCT EMAIL NOTIFICATION ERROR] Could not send to {to_email}: {exc}")
            await db.email_notifications_sent.update_one(
                {"product_id": product_id, "customer_id": cust_id},
                {"$set": {"status": "failed", "failed_at": datetime.now(timezone.utc), "error": str(exc)}},
                upsert=True,
            )


@router.get("/{product_id}")
async def get_product(product_id: str, db=Depends(get_db)):
    product = await db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(404, "Offer not found")

    vendor = await db.vendors.find_one({"_id": product["vendor_id"]})
    if vendor:
        user = await db.users.find_one({"_id": vendor["user_id"]})
        vendor["user_full_name"] = user["full_name"] if user else "Unknown"

    active_res = await db.reservations.count_documents({
        "product_id": product_id,
        "status": {"$in": ["reserved", "confirmed", "packed", "ready"]},
    })

    out = _product_out(product, vendor=vendor, active_res=active_res)
    if out["session_status"] == "expired" and product.get("session_status") not in ("expired", "cancelled"):
        await db.products.update_one(
            {"_id": product_id, "session_status": {"$nin": ["cancelled", "expired"]}},
            {"$set": {"session_status": "expired", "updated_at": datetime.now(timezone.utc)}},
        )
    return out


@router.put("/{product_id}")
async def update_product(
    product_id: str,
    data: ProductUpdate,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_vendor),
    db=Depends(get_db),
):
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    product = await db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(404, "Offer not found")
    if product["vendor_id"] != vendor["_id"]:
        raise HTTPException(403, "Not authorized to edit this offer")

    update_data = data.model_dump(exclude_none=True)
    if "session_start" in update_data or "session_end" in update_data:
        start = update_data.get("session_start", product["session_start"])
        end = update_data.get("session_end", product["session_end"])
        if "session_start" in update_data and start.tzinfo is None:
            raise HTTPException(400, "Session start must include a timezone")
        if "session_end" in update_data and end.tzinfo is None:
            raise HTTPException(400, "Session end must include a timezone")
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if end <= start or end <= datetime.now(timezone.utc):
            raise HTTPException(400, "Session end must be after the start and in the future; include a timezone")

    if "price_per_unit" in update_data or "discount_percent" in update_data:
        original_price = update_data.pop(
            "price_per_unit",
            product.get("original_price_per_unit", product["price_per_unit"]),
        )
        discount = update_data.get("discount_percent", product.get("discount_percent", 0))
        update_data["original_price_per_unit"] = original_price
        update_data["discount_percent"] = discount
        update_data["price_per_unit"] = round(original_price * (1 - discount / 100), 2)
    update_data["updated_at"] = datetime.now(timezone.utc)
    # Never allow location override through product edit
    update_data.pop("shop_location", None)

    await db.products.update_one({"_id": product_id}, {"$set": update_data})
    updated = await db.products.find_one({"_id": product_id})

    # Whenever a shopkeeper updates the product, send email to registered customers
    background_tasks.add_task(
        _notify_customers_on_product, product_id, vendor, updated, db, is_update=True
    )

    return _product_out(updated, vendor=vendor)


@router.get("/{product_id}/notifications")
async def product_notification_status(
    product_id: str,
    current_user=Depends(get_current_vendor),
    db=Depends(get_db),
):
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    product = await db.products.find_one({"_id": product_id, "vendor_id": vendor["_id"]})
    if not product:
        raise HTTPException(404, "Offer not found")

    records = await db.email_notifications_sent.find(
        {"product_id": product_id},
        {"status": 1, "sent_at": 1, "failed_at": 1},
    ).to_list(10000)
    counts = {"pending": 0, "sent": 0, "failed": 0}
    for record in records:
        status = record.get("status", "sent")
        if status in counts:
            counts[status] += 1
    return {"product_id": product_id, "eligible": len(records), **counts}


@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    current_user=Depends(get_current_vendor),
    db=Depends(get_db),
):
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    product = await db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(404, "Offer not found")
    if product["vendor_id"] != vendor["_id"]:
        raise HTTPException(403, "Not authorized")

    # Mark cancelled instead of hard delete (preserve order history)
    await db.products.update_one(
        {"_id": product_id},
        {"$set": {"session_status": "cancelled", "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Offer cancelled"}


@router.post("/{product_id}/end-session")
async def end_selling_session(
    product_id: str,
    current_user=Depends(get_current_vendor),
    db=Depends(get_db),
):
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    product = await db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(404, "Offer not found")
    if not vendor or product["vendor_id"] != vendor["_id"]:
        raise HTTPException(403, "Not authorized to end this session")
    if product.get("session_status") == "cancelled":
        raise HTTPException(400, "This offer is already cancelled")

    now = datetime.now(timezone.utc)
    computed = _compute_session_status(product, now)
    if computed == "expired":
        await db.products.update_one(
            {"_id": product_id},
            {"$set": {"session_status": "expired", "updated_at": now}},
        )
        return {"message": "This selling session has already ended"}

    await db.products.update_one(
        {"_id": product_id},
        {"$set": {"session_end": now, "session_status": "expired", "updated_at": now}},
    )
    return {"message": "Session ended. The offer is expired and customers cannot place new orders."}


@router.get("/nearby/search")
async def nearby_products(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    category: str = None,
    db=Depends(get_db),
):
    """Return active offers within the requested distance."""
    if not math.isfinite(lat) or not -90 <= lat <= 90:
        raise HTTPException(400, "Latitude must be between -90 and 90")
    if not math.isfinite(lng) or not -180 <= lng <= 180:
        raise HTTPException(400, "Longitude must be between -180 and 180")
    if not math.isfinite(radius_km) or not 0.5 <= radius_km <= 50:
        raise HTTPException(400, "Radius must be between 0.5 and 50 km")
    if category and category not in ("vegetables", "fruits", "flowers", "other"):
        raise HTTPException(400, "Invalid product category")
    now = datetime.now(timezone.utc)

    # Use MongoDB geospatial query via vendor location
    pipeline = [
        {
            "$lookup": {
                "from": "vendors",
                "localField": "vendor_id",
                "foreignField": "_id",
                "as": "vendor_info",
            }
        },
        {"$unwind": "$vendor_info"},
        {
            "$match": {
                "session_start": {"$lte": now},
                "session_end": {"$gte": now},
                "available_quantity": {"$gt": 0},
                "session_status": {"$nin": ["cancelled", "expired"]},
                "vendor_info.location": {"$ne": None},
                **({"category": category} if category else {}),
            }
        },
    ]

    products = await db.products.aggregate(pipeline).to_list(500)

    results = []
    for p in products:
        vendor = p.pop("vendor_info", {})
        loc = vendor.get("location", {})
        if not loc or not loc.get("coordinates"):
            continue

        v_lng, v_lat = loc["coordinates"]
        distance = _haversine(lat, lng, v_lat, v_lng)
        if distance > radius_km:
            continue

        user = await db.users.find_one({"_id": vendor.get("user_id", "")})
        vendor["user_full_name"] = user["full_name"] if user else "Vendor"

        active_res = await db.reservations.count_documents({
            "product_id": str(p["_id"]),
            "status": {"$in": ["reserved", "confirmed", "packed", "ready"]},
        })

        out = _product_out(p, vendor=vendor, distance_km=round(distance, 2), active_res=active_res)
        # Only include active sessions with available stock
        if out["session_status"] == "active" and out["available_quantity"] > 0:
            results.append(out)

    results.sort(key=lambda x: x.get("distance_km", 9999))
    return {"results": results, "total": len(results)}
