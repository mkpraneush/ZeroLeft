from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from app.database import get_db
from app.auth import get_current_customer, get_current_user
from app.models import CustomerProfileUpdate

router = APIRouter(prefix="/customer", tags=["customer"])
ALLOWED_CATEGORIES = {"vegetables", "fruits", "flowers", "other"}


def _validate_location(location):
    if location is None:
        return
    if len(location.coordinates) != 2:
        raise HTTPException(400, "Coordinates must be [longitude, latitude]")
    longitude, latitude = location.coordinates
    if not (-180 <= longitude <= 180) or not (-90 <= latitude <= 90):
        raise HTTPException(400, "Invalid coordinates")


@router.get("/profile")
async def get_customer_profile(current_user=Depends(get_current_customer), db=Depends(get_db)):
    customer = await db.customers.find_one({"user_id": current_user["_id"]})
    if not customer:
        raise HTTPException(404, "Customer profile not found")
    customer["id"] = customer.pop("_id")
    customer["email"] = current_user["email"]
    customer["full_name"] = current_user["full_name"]
    customer["phone"] = current_user.get("phone")
    return customer


@router.put("/profile")
async def update_customer_profile(
    data: CustomerProfileUpdate,
    current_user=Depends(get_current_customer),
    db=Depends(get_db),
):
    # Allowed fields for customer profile update
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(400, "Provide a location or preference to update")
    if "preferred_location" in update_data:
        _validate_location(data.preferred_location)
    if data.preferences and any(
        category not in ALLOWED_CATEGORIES
        for category in data.preferences.preferred_categories
    ):
        raise HTTPException(400, "One or more preferred categories are invalid")
    update_data = {
        key: value.model_dump() if hasattr(value, "model_dump") else value
        for key, value in update_data.items()
    }
    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.customers.update_one(
        {"user_id": current_user["_id"]},
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Customer profile not found")

    customer = await db.customers.find_one({"user_id": current_user["_id"]})
    customer["id"] = customer.pop("_id")
    return customer


@router.put("/user-info")
async def update_user_info(
    data: dict,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Update basic user fields like full_name and phone."""
    allowed = {"full_name", "phone"}
    update_data = {k: v for k, v in data.items() if k in allowed}
    if not update_data:
        raise HTTPException(400, "No valid fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc)

    await db.users.update_one({"_id": current_user["_id"]}, {"$set": update_data})
    return {"message": "User info updated"}


@router.post("/unsubscribe")
async def unsubscribe(current_user=Depends(get_current_customer), db=Depends(get_db)):
    await db.customers.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {"preferences.email_notifications": False, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "You have been unsubscribed from email notifications"}
