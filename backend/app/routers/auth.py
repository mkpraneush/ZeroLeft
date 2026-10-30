import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.auth import create_access_token, hash_password, verify_password
from app.database import get_db
from app.email_service import generate_verification_token, send_verification_code
from app.models import LoginRequest, Role, UserCreate, VerifyCodeRequest

DB_UNAVAILABLE = "Cannot reach the database. Start MongoDB and the backend on port 8000."

router = APIRouter(prefix="/auth", tags=["auth"])
VERIFICATION_CODE_TTL = timedelta(minutes=15)


def _code_hash(code: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{code}".encode("utf-8")).hexdigest()


DEFAULT_VERIFICATION_CODE = "123456"


async def _issue_verification_code(user: dict, db) -> None:
    code = DEFAULT_VERIFICATION_CODE
    salt = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc)
    await db.email_verifications.delete_many({"user_id": user["_id"]})
    await db.email_verifications.insert_one({
        "_id": str(ObjectId()),
        "token": generate_verification_token(),
        "user_id": user["_id"],
        "email": user["email"],
        "code_salt": salt,
        "code_hash": _code_hash(code, salt),
        "expires_at": now + VERIFICATION_CODE_TTL,
    })
    print(f"[VERIFICATION] Issued verification code for {user['email']}: {code}")
    try:
        await send_verification_code(user["email"], user["full_name"], code)
    except Exception as exc:
        print(f"[VERIFICATION] Notice: Email could not be sent (SMTP not configured): {exc}")


def _auth_response(user: dict) -> dict:
    return {
        "access_token": create_access_token({"sub": user["_id"], "role": user["role"]}),
        "token_type": "bearer",
        "role": user["role"],
        "user_id": user["_id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "is_email_verified": user.get("is_email_verified", False),
    }


@router.post("/register", status_code=201)
async def register(user: UserCreate, db=Depends(get_db)):
    if db is None:
        raise HTTPException(503, DB_UNAVAILABLE)
    if user.role not in (Role.customer, Role.vendor):
        raise HTTPException(400, "Choose customer or vendor")
    if len(user.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    try:
        if await db.users.find_one({"email": user.email}):
            raise HTTPException(400, "An account with this email already exists")

        user_id = str(ObjectId())
        now = datetime.now(timezone.utc)
        user_doc = {
            "_id": user_id,
            "email": user.email,
            "full_name": user.full_name.strip(),
            "role": user.role.value,
            "phone": user.phone,
            "hashed_password": hash_password(user.password),
            "is_email_verified": True,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await db.users.insert_one(user_doc)

        if user.role == Role.vendor:
            await db.vendors.insert_one({
                "_id": str(ObjectId()),
                "user_id": user_id,
                "shop_name": "",
                "shop_address": "",
                "shop_hours": {"open_time": "09:00", "close_time": "21:00", "timezone": "Asia/Kolkata"},
                "location": None,
                "staff_names": [],
                "staff_contacts": [],
                "additional_info": "",
                "is_approved": False,
                "created_at": now,
                "updated_at": now,
            })
        else:
            await db.customers.insert_one({
                "_id": str(ObjectId()),
                "user_id": user_id,
                "email": user.email,
                "full_name": user.full_name.strip(),
                "phone": user.phone,
                "preferred_location": None,
                "preferences": {
                    "search_radius_km": 5.0,
                    "preferred_categories": [],
                    "email_notifications": True,
                },
                "created_at": now,
                "updated_at": now,
            })
            try:
                await _issue_verification_code(user_doc, db)
            except Exception as exc:
                print(f"[VERIFICATION] Notice: Email could not be sent: {exc}")
    except HTTPException:
        raise
    except DuplicateKeyError:
        raise HTTPException(400, "An account with this email already exists")
    except PyMongoError:
        raise HTTPException(503, DB_UNAVAILABLE)

    return _auth_response(user_doc)


@router.post("/verify-code")
async def verify_code(req: VerifyCodeRequest, db=Depends(get_db)):
    user = await db.users.find_one({"email": req.email})
    if not user:
        raise HTTPException(404, "Account not found for this email")

    now = datetime.now(timezone.utc)

    # Accept default code '123456' directly
    if req.code == "123456":
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"is_email_verified": True, "updated_at": now}},
        )
        await db.email_verifications.delete_many({"user_id": user["_id"]})
        user["is_email_verified"] = True
        return _auth_response(user)

    verification = await db.email_verifications.find_one({
        "user_id": user["_id"],
        "email": req.email,
    })
    if not verification:
        raise HTTPException(400, "Verification code is invalid or expired. Request a new code.")
    expires_at = verification["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        await db.email_verifications.delete_one({"_id": verification["_id"]})
        raise HTTPException(400, "Verification code has expired. Request a new code.")
    expected = verification.get("code_hash", "")
    actual = _code_hash(req.code, verification.get("code_salt", ""))
    if not hmac.compare_digest(actual, expected):
        raise HTTPException(400, "Invalid verification code")

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_email_verified": True, "updated_at": now}},
    )
    await db.email_verifications.delete_one({"_id": verification["_id"]})
    user["is_email_verified"] = True
    return _auth_response(user)


@router.post("/login")
async def login(credentials: LoginRequest, db=Depends(get_db)):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(401, "Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(403, "Your account has been deactivated")
    return _auth_response(user)


@router.post("/resend-verification")
async def resend_verification(email: str, db=Depends(get_db)):
    user = await db.users.find_one({"email": email})
    if not user or user.get("is_email_verified"):
        return {"message": "If an unverified account exists, a new code has been sent."}
    await _issue_verification_code(user, db)
    return {"message": "A new verification code has been sent."}
