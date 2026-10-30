from datetime import datetime, timezone
import random
import string

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.auth import get_current_customer, get_current_vendor
from app.database import get_db
from app.email_service import send_order_status_email
from app.models import ReservationCreate

router = APIRouter(prefix="/reservations", tags=["reservations"])
ACTIVE_STATUSES = ["reserved", "confirmed", "packed", "ready"]


def _generate_order_ref() -> str:
    chars = string.ascii_uppercase + string.digits
    return "ZL-" + "".join(random.choices(chars, k=7))


def _reservation_out(reservation: dict) -> dict:
    reservation.pop("active_key", None)
    reservation.pop("email_status_for", None)
    reservation["id"] = str(reservation.pop("_id"))
    return reservation


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def _deliver_order_email(db, customer: dict, order: dict, status: str) -> None:
    reservation_id = order.get("_id", order.get("id"))
    try:
        await send_order_status_email(
            customer["email"], customer["full_name"], order, status
        )
    except Exception:
        await db.reservations.update_one(
            {"_id": reservation_id, "email_status_for": status},
            {"$set": {"email_status": "failed"}},
        )
        return
    await db.reservations.update_one(
        {"_id": reservation_id, "email_status_for": status},
        {"$set": {"email_status": "sent", "email_sent_at": datetime.now(timezone.utc)}},
    )


@router.post("/", status_code=201)
async def create_reservation(
    data: ReservationCreate,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_customer),
    db=Depends(get_db),
):
    product = await db.products.find_one({"_id": data.product_id})
    if not product:
        raise HTTPException(404, "Offer not found")

    customer_profile = await db.customers.find_one({"user_id": current_user["_id"]})
    vendor = await db.vendors.find_one({"_id": product["vendor_id"]})
    if not customer_profile or not vendor:
        raise HTTPException(409, "Customer or shop profile is unavailable")

    now = datetime.now(timezone.utc)
    stored_status = product.get("session_status")
    if stored_status == "cancelled":
        raise HTTPException(400, "This offer has been cancelled")
    if stored_status == "expired" or now > _as_utc(product["session_end"]):
        raise HTTPException(400, "This offer has expired. You cannot place an order.")
    if now < _as_utc(product["session_start"]):
        raise HTTPException(400, "This selling session has not started yet")

    active_key = f'{current_user["_id"]}:{data.product_id}'
    existing = await db.reservations.find_one({
        "product_id": data.product_id,
        "customer_id": current_user["_id"],
        "status": {"$in": ACTIVE_STATUSES},
    })
    if existing:
        raise HTTPException(409, "You already have an active order for this offer")

    location = vendor.get("location")
    coordinates = location.get("coordinates") if location else None
    shop_location = {
        "type": "Point",
        "coordinates": coordinates,
        "address": location.get("address", vendor.get("shop_address", "")),
    } if coordinates else None

    updated_product = await db.products.find_one_and_update(
        {
            "_id": data.product_id,
            "available_quantity": {"$gte": data.quantity},
            "session_start": {"$lte": now},
            "session_end": {"$gte": now},
            "session_status": {"$nin": ["cancelled", "expired"]},
        },
        {
            "$inc": {
                "available_quantity": -data.quantity,
                "reserved_quantity": data.quantity,
            },
            "$set": {"updated_at": now},
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated_product:
        raise HTTPException(409, "Offer is unavailable or there is not enough stock")

    reservation_id = str(ObjectId())
    reservation_doc = {
        "_id": reservation_id,
        "order_reference": _generate_order_ref(),
        "product_id": data.product_id,
        "customer_id": current_user["_id"],
        "vendor_id": product["vendor_id"],
        "active_key": active_key,
        "product_name": product["product_name"],
        "shop_name": vendor.get("shop_name", ""),
        "shop_address": vendor.get("shop_address", ""),
        "shop_location": shop_location,
        "quantity": data.quantity,
        "unit": product["unit"],
        "price_per_unit": product["price_per_unit"],
        "total_price": round(data.quantity * product["price_per_unit"], 2),
        "image_url": product.get("image_url"),
        "status": "reserved",
        "email_status": "pending",
        "email_status_for": "reserved",
        "reserved_at": now,
        "updated_at": now,
    }

    try:
        await db.reservations.insert_one(reservation_doc)
    except DuplicateKeyError as exc:
        await db.products.update_one(
            {"_id": data.product_id},
            {"$inc": {
                "available_quantity": data.quantity,
                "reserved_quantity": -data.quantity,
            }},
        )
        raise HTTPException(409, "You already have an active order for this offer") from exc
    except Exception:
        await db.products.update_one(
            {"_id": data.product_id},
            {"$inc": {
                "available_quantity": data.quantity,
                "reserved_quantity": -data.quantity,
            }},
        )
        raise

    background_tasks.add_task(_deliver_order_email, db, current_user, reservation_doc, "reserved")
    return _reservation_out(reservation_doc)


@router.get("/my-orders")
async def my_orders(current_user=Depends(get_current_customer), db=Depends(get_db)):
    reservations = await db.reservations.find(
        {"customer_id": current_user["_id"]}
    ).sort("reserved_at", -1).to_list(500)
    return [_reservation_out(reservation) for reservation in reservations]


@router.get("/vendor-orders")
async def vendor_orders(current_user=Depends(get_current_vendor), db=Depends(get_db)):
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    reservations = await db.reservations.find(
        {"vendor_id": vendor["_id"]}
    ).sort("reserved_at", -1).to_list(500)
    return [_reservation_out(reservation) for reservation in reservations]


async def _transition_reservation(
    reservation: dict,
    new_status: str,
    db,
) -> None:
    now = datetime.now(timezone.utc)
    terminal = new_status in ("cancelled", "collected")
    update = {"$set": {"status": new_status, "updated_at": now}}
    if terminal:
        update["$unset"] = {"active_key": ""}
    result = await db.reservations.update_one(
        {"_id": reservation["_id"], "status": reservation["status"]},
        update,
    )
    if result.matched_count == 0:
        raise HTTPException(409, "Order status changed. Refresh and try again.")

    if new_status in ("cancelled", "collected"):
        increments = (
            {"available_quantity": reservation["quantity"], "reserved_quantity": -reservation["quantity"]}
            if new_status == "cancelled"
            else {"reserved_quantity": -reservation["quantity"], "collected_quantity": reservation["quantity"]}
        )
        stock_result = await db.products.update_one(
            {
                "_id": reservation["product_id"],
                "reserved_quantity": {"$gte": reservation["quantity"]},
            },
            {"$inc": increments, "$set": {"updated_at": now}},
        )
        if stock_result.matched_count == 0:
            await db.reservations.update_one(
                {"_id": reservation["_id"], "status": new_status},
                {"$set": {
                    "status": reservation["status"],
                    "active_key": f'{reservation["customer_id"]}:{reservation["product_id"]}',
                    "updated_at": now,
                }},
            )
            raise HTTPException(409, "Inventory could not be updated; order status was not changed")


@router.put("/{reservation_id}/status")
async def update_reservation_status(
    reservation_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_vendor),
    db=Depends(get_db),
):
    new_status = body.get("status")
    valid_transitions = {
        "reserved": ["confirmed", "cancelled"],
        "confirmed": ["packed", "cancelled"],
        "packed": ["ready", "cancelled"],
        "ready": ["collected", "cancelled"],
    }
    reservation = await db.reservations.find_one({"_id": reservation_id})
    if not reservation:
        raise HTTPException(404, "Order not found")
    vendor = await db.vendors.find_one({"user_id": current_user["_id"]})
    if not vendor or reservation["vendor_id"] != vendor["_id"]:
        raise HTTPException(403, "Not authorized")
    if new_status not in valid_transitions.get(reservation["status"], []):
        raise HTTPException(400, f"Cannot transition from {reservation['status']} to {new_status}")

    await _transition_reservation(reservation, new_status, db)
    updated = await db.reservations.find_one({"_id": reservation_id})
    if new_status in ("confirmed", "packed", "ready", "cancelled", "collected"):
        customer = await db.users.find_one({"_id": reservation["customer_id"]})
        if customer:
            await db.reservations.update_one(
                {"_id": reservation_id},
                {"$set": {"email_status": "pending", "email_status_for": new_status}},
            )
            background_tasks.add_task(
                _deliver_order_email, db, customer, {**reservation, "id": reservation_id}, new_status
            )
    return _reservation_out(updated)


@router.delete("/{reservation_id}")
async def cancel_reservation_by_customer(
    reservation_id: str,
    current_user=Depends(get_current_customer),
    db=Depends(get_db),
):
    reservation = await db.reservations.find_one({"_id": reservation_id})
    if not reservation:
        raise HTTPException(404, "Order not found")
    if reservation["customer_id"] != current_user["_id"]:
        raise HTTPException(403, "Not authorized")
    if reservation["status"] != "reserved":
        raise HTTPException(400, "Only pending reservations can be cancelled")
    await _transition_reservation(reservation, "cancelled", db)
    return {"message": "Reservation cancelled and stock released"}
