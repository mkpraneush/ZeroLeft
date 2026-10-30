from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings

settings = get_settings()

client: AsyncIOMotorClient = None
db = None

async def connect_db():
    global client, db
    client = AsyncIOMotorClient(settings.mongodb_url, tz_aware=True)
    db = client[settings.mongodb_db_name]
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.vendors.create_index("user_id", unique=True)
    await db.customers.create_index("user_id", unique=True)
    await db.vendors.create_index([("location", "2dsphere")])
    await db.products.create_index("vendor_id")
    await db.products.create_index("session_end")
    await db.reservations.create_index("customer_id")
    await db.reservations.create_index("product_id")
    await db.reservations.create_index("vendor_id")
    await db.reservations.create_index("order_reference", unique=True)
    await db.reservations.create_index("active_key", unique=True, sparse=True)
    await db.email_verifications.create_index("token", unique=True)
    await db.email_verifications.create_index("expires_at", expireAfterSeconds=0)
    await db.email_verifications.create_index("user_id")
    await db.email_notifications_sent.create_index(
        [("product_id", 1), ("customer_id", 1)], unique=True
    )
    print("[SUCCESS] Connected to MongoDB and indexes created")

async def close_db():
    global client
    if client:
        client.close()
        print("[INFO] MongoDB connection closed")

def get_db():
    return db
