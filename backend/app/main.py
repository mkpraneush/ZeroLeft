from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from app.database import connect_db, close_db
from app.config import get_settings
from app.routers import auth, vendor, products, reservations, customer, websockets

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="ZeroLeft API",
    description="Nearby Surplus Produce Marketplace — Backend API",
    version="1.0.0",
    lifespan=lifespan,
)
uploads_dir = Path(__file__).resolve().parent.parent / settings.uploads_dir
app.mount("/media", StaticFiles(directory=str(uploads_dir), check_dir=False), name="media")

# CORS
allowed_origins = [
    settings.frontend_url,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if settings.environment == "production":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=r"^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Routers
app.include_router(auth.router)
app.include_router(vendor.router)
app.include_router(products.router)
app.include_router(reservations.router)
app.include_router(customer.router)
app.include_router(websockets.router)


@app.get("/")
async def root():
    return {
        "app": "ZeroLeft API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
