from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class Role(str, Enum):
    customer = "customer"
    vendor = "vendor"
    admin = "admin"


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: Role
    phone: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserInDB(UserBase):
    id: str
    hashed_password: str
    is_email_verified: bool = False
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class UserOut(UserBase):
    id: str
    is_email_verified: bool
    is_active: bool
    created_at: datetime


# ─── Vendor Models ────────────────────────────────────────────


class ShopLocation(BaseModel):
    type: str = "Point"
    coordinates: List[float]  # [longitude, latitude]
    address: Optional[str] = None


class ShopHours(BaseModel):
    open_time: str  # HH:MM format
    close_time: str
    timezone: str = "Asia/Kolkata"


class VendorCreate(BaseModel):
    user_id: str
    shop_name: str
    shop_address: str
    shop_hours: ShopHours
    location: Optional[ShopLocation] = None
    staff_names: List[str] = Field(default_factory=list)
    staff_contacts: List[str] = Field(default_factory=list)
    additional_info: Optional[str] = None


class VendorProfileUpdate(BaseModel):
    shop_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    shop_address: Optional[str] = Field(default=None, min_length=4, max_length=300)
    shop_hours: Optional[ShopHours] = None
    staff_names: Optional[List[str]] = None
    staff_contacts: Optional[List[str]] = None
    additional_info: Optional[str] = Field(default=None, max_length=1000)


class VendorProfile(VendorCreate):
    id: str
    is_approved: bool = False
    created_at: datetime
    updated_at: datetime


# ─── Customer Models ──────────────────────────────────────────


class CustomerLocation(BaseModel):
    type: str = "Point"
    coordinates: List[float]  # [longitude, latitude]
    address: Optional[str] = None


class CustomerPreferences(BaseModel):
    search_radius_km: float = Field(default=5.0, ge=0.5, le=50)
    preferred_categories: List[str] = Field(default_factory=list)
    email_notifications: bool = True


class CustomerCreate(BaseModel):
    user_id: str
    preferred_location: Optional[CustomerLocation] = None
    preferences: CustomerPreferences = Field(default_factory=CustomerPreferences)


class CustomerProfileUpdate(BaseModel):
    preferred_location: Optional[CustomerLocation] = None
    preferences: Optional[CustomerPreferences] = None


class CustomerProfile(CustomerCreate):
    id: str
    created_at: datetime
    updated_at: datetime


# ─── Product / Offer Models ───────────────────────────────────


class ProductCategory(str, Enum):
    vegetables = "vegetables"
    fruits = "fruits"
    flowers = "flowers"
    other = "other"


class SessionStatus(str, Enum):
    scheduled = "scheduled"
    active = "active"
    expired = "expired"
    cancelled = "cancelled"


class StockStatus(str, Enum):
    available = "available"
    limited = "limited"
    sold_out = "sold_out"
    offer_expired = "offer_expired"


class ProductCreate(BaseModel):
    product_name: str = Field(min_length=2, max_length=120)
    category: ProductCategory
    initial_quantity: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=20)
    price_per_unit: float = Field(gt=0)
    discount_percent: float = Field(default=0, ge=0, le=100)
    session_start: datetime
    session_end: datetime
    image_url: Optional[str] = None
    description: Optional[str] = None


class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    category: Optional[ProductCategory] = None
    price_per_unit: Optional[float] = Field(default=None, gt=0)
    discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    session_start: Optional[datetime] = None
    session_end: Optional[datetime] = None
    image_url: Optional[str] = None
    description: Optional[str] = None


class ProductOut(BaseModel):
    id: str
    vendor_id: str
    vendor_name: str
    shop_name: str
    shop_address: str
    shop_location: Optional[ShopLocation] = None
    product_name: str
    category: str
    initial_quantity: float
    available_quantity: float
    reserved_quantity: float
    collected_quantity: float
    unit: str
    price_per_unit: float
    original_price_per_unit: float
    discount_percent: float
    session_start: datetime
    session_end: datetime
    session_status: SessionStatus
    stock_status: StockStatus
    image_url: Optional[str] = None
    description: Optional[str] = None
    distance_km: Optional[float] = None
    active_reservations_count: int = 0
    created_at: datetime
    updated_at: datetime


# ─── Reservation Models ───────────────────────────────────────


class OrderStatus(str, Enum):
    reserved = "reserved"
    confirmed = "confirmed"
    packed = "packed"
    ready = "ready"
    collected = "collected"
    cancelled = "cancelled"
    expired = "expired"


class ReservationCreate(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)


class ReservationOut(BaseModel):
    id: str
    order_reference: str
    product_id: str
    customer_id: str
    vendor_id: str
    product_name: str
    shop_name: str
    quantity: float
    unit: str
    price_per_unit: float
    total_price: float
    status: OrderStatus
    reserved_at: datetime
    updated_at: datetime
    image_url: Optional[str] = None


# ─── Auth Models ──────────────────────────────────────────────


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    verification_code: Optional[str] = None


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    user_id: str
    full_name: str
    is_email_verified: bool
