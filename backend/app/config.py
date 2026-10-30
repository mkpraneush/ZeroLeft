from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # MongoDB
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "zeroleft"

    # JWT
    jwt_secret_key: str = "change-this-secret-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # SMTP
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    email_from: str = "ZeroLeft <noreply@zeroleft.com>"

    # Cloudinary
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    uploads_dir: str = "uploads"

    # Google Maps
    google_maps_api_key: str = ""

    # App
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    app_name: str = "ZeroLeft"
    environment: str = "development"

    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
