import aiosmtplib
from html import escape
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.config import get_settings
import secrets
from datetime import datetime, timedelta, timezone

settings = get_settings()


def get_product_emoji(product_name: str, category: str = "") -> str:
    name = (product_name or "").lower()
    cat = (category or "").lower()
    if "tomato" in name:
        return "🍅"
    elif "apple" in name:
        return "🍎"
    elif "banana" in name:
        return "🍌"
    elif "mango" in name:
        return "🥭"
    elif "orange" in name or "lemon" in name or "citrus" in name:
        return "🍊"
    elif "potato" in name:
        return "🥔"
    elif "onion" in name:
        return "🧅"
    elif "carrot" in name:
        return "🥕"
    elif "corn" in name:
        return "🌽"
    elif "chilli" in name or "pepper" in name:
        return "🌶️"
    elif "grape" in name:
        return "🍇"
    elif "flower" in name or "rose" in name or "marigold" in name:
        return "🌸"
    elif "leaf" in name or "spinach" in name or "greens" in name or "cabbage" in name or "broccoli" in name:
        return "🥬"
    elif "fruit" in cat:
        return "🍎"
    elif "flower" in cat:
        return "🌸"
    elif "vegetable" in cat:
        return "🥬"
    return "🍅"


from email.header import Header
import sys


def _safe_log(msg: str):
    """Safely print strings that may contain emojis on Windows console."""
    try:
        print(msg)
    except UnicodeEncodeError:
        encoding = sys.stdout.encoding or "utf-8"
        print(msg.encode(encoding, errors="replace").decode(encoding))


async def send_email(to_email: str, subject: str, html_body: str):
    """Send an email via Gmail SMTP or log simulated delivery in development."""
    from_addr = settings.email_from
    if settings.smtp_username and "@" in settings.smtp_username:
        from_addr = f"ZeroLeft <{settings.smtp_username}>"

    msg = MIMEMultipart("alternative")
    # Encode subject with UTF-8 so emojis render perfectly in Gmail/mail clients
    msg["Subject"] = Header(subject, "utf-8").encode()
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    smtp_user = (settings.smtp_username or "").strip()
    smtp_pass = (settings.smtp_password or "").strip()
    placeholder = smtp_user.startswith("your_gmail") or smtp_pass in ("", "your_16char_app_password")
    if not smtp_user or not smtp_pass or "@" not in smtp_user or placeholder:
        _safe_log(f"[EMAIL DEV MODE] SMTP not configured — email logged only (not delivered):")
        _safe_log(f"  From: {from_addr}")
        _safe_log(f"  To: {to_email}")
        _safe_log(f"  Subject: {subject}")
        _safe_log("  Add SMTP_USERNAME and SMTP_PASSWORD (Gmail App Password) in backend/.env to send real mail.")
        return True

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password,
        start_tls=True,
    )
    _safe_log(f"[EMAIL SENT] From {from_addr} to {to_email} | Subject: {subject}")
    return True


def generate_verification_token() -> str:
    return secrets.token_urlsafe(32)


async def send_verification_code(to_email: str, full_name: str, code: str):
    safe_name = full_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    html = f"""
    <html><body style="font-family:Arial,sans-serif;color:#243b2f">
      <h1>ZeroLeft email verification</h1>
      <p>Hello {safe_name},</p>
      <p>Enter this one-time code to verify your account. It expires in 15 minutes.</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:8px">{code}</p>
      <p>We saved this email so we can notify you when a shopkeeper uploads a new product near you.</p>
    </body></html>
    """
    await send_email(to_email, "Your ZeroLeft verification code", html)


async def send_verification_email(to_email: str, full_name: str, token: str):
    verify_url = f"{settings.frontend_url}/verify-email?token={token}"
    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f9f5ee; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #2d6a4f, #52b788); padding:32px; text-align:center;">
          <h1 style="color:white; margin:0; font-size:28px;">🍋 ZeroLeft</h1>
          <p style="color:rgba(255,255,255,0.85); margin:8px 0 0;">Surplus Produce Marketplace</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#2d6a4f;">Hello, {full_name}! 👋</h2>
          <p style="color:#555; font-size:16px; line-height:1.6;">
            Thank you for joining ZeroLeft. Please verify your email address to get started.
          </p>
          <div style="text-align:center; margin:32px 0;">
            <a href="{verify_url}"
               style="background: linear-gradient(135deg, #f77f00, #fcbf49); color:white; padding:14px 32px;
                      border-radius:50px; text-decoration:none; font-weight:700; font-size:16px;">
              ✅ Verify Email Address
            </a>
          </div>
          <p style="color:#999; font-size:14px;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
    """
    await send_email(to_email, f"Verify your ZeroLeft account", html)


async def send_offer_notification_email(
    to_email: str,
    customer_name: str,
    product: dict,
    shop: dict,
    distance_km: float = None,
    offer_id: str = "",
    is_update: bool = False,
):
    prod_name_raw = product.get("product_name", "Produce")
    prod_title = prod_name_raw.strip().title()
    category = product.get("category", "")
    emoji = get_product_emoji(prod_name_raw, category)
    
    # Subject matching user requirement: 🍅 New Fresh Tomatoes Available Near You!
    subject = f"{emoji} New Fresh {prod_title} Available Near You!"
    
    offer_url = f"{settings.frontend_url}/offer/{offer_id}" if offer_id else settings.frontend_url
    distance_text = f"{distance_km:.1f} km away" if distance_km is not None else f"Near your area"
    shop_name = shop.get("shop_name") or "Local Fresh Shop"
    shop_address = shop.get("shop_address") or "Visit shop on ZeroLeft"
    
    # Format dates
    session_end = product.get("session_end")
    if hasattr(session_end, "strftime"):
        end_time_str = session_end.strftime("%d %b %Y, %I:%M %p")
    else:
        end_time_str = "Today before closing"

    image_tag = ""
    if product.get("image_url"):
        img_src = product["image_url"]
        if not img_src.startswith("http"):
            img_src = f"{settings.backend_url}{img_src}" if img_src.startswith("/") else f"{settings.backend_url}/{img_src}"
        image_tag = f'<img src="{escape(img_src, quote=True)}" alt="{escape(prod_title, quote=True)}" style="width:100%; max-height:240px; object-fit:cover; border-radius:12px; margin-bottom:16px; border:1px solid #e5e7eb;">'

    discount_badge = ""
    if product.get("discount_percent") and product["discount_percent"] > 0:
        discount_badge = f'<span style="background:#fee2e2; color:#dc2626; font-size:12px; font-weight:700; padding:3px 8px; border-radius:6px; margin-left:8px;">{product["discount_percent"]}% OFF</span>'

    action_text = "A shopkeeper has updated product availability on ZeroLeft!" if is_update else "A shopkeeper has just listed fresh surplus produce on ZeroLeft!"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>{escape(subject)}</title>
    </head>
    <body style="font-family:'Segoe UI',Arial,sans-serif; background:#f9f5ee; margin:0; padding:20px; color:#1f2937;">
      <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,0.08); border:1px solid #e5e7eb;">
        
        <!-- Header with ZeroLeft identity -->
        <div style="background:linear-gradient(135deg, #166534, #22c55e); padding:24px 32px; text-align:center;">
          <div style="display:inline-block; background:white; border-radius:12px; padding:6px 14px; margin-bottom:8px;">
            <strong style="color:#166534; font-size:18px; letter-spacing:0.5px;">🌱 ZeroLeft</strong>
          </div>
          <h1 style="color:white; margin:8px 0 0; font-size:22px; font-weight:700;">{emoji} New Fresh {escape(prod_title)} Available Near You!</h1>
          <p style="color:rgba(255,255,255,0.9); margin:4px 0 0; font-size:14px;">Surplus Fresh Produce Marketplace</p>
        </div>

        <div style="padding:28px 32px;">
          <p style="font-size:16px; color:#374151; margin-top:0;">
            Hello <strong>{escape(customer_name)}</strong> 👋,
          </p>
          <p style="font-size:15px; color:#4b5563; line-height:1.6; margin-bottom:20px;">
            {action_text} Enjoy top-quality fruits, vegetables, and farm harvest at discounted surplus prices before the day ends.
          </p>

          {image_tag}

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin:20px 0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h2 style="color:#166534; margin:0; font-size:20px; font-weight:700;">
                {emoji} {escape(prod_title)}
              </h2>
              {discount_badge}
            </div>

            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <tr>
                <td style="color:#6b7280; padding:6px 0; width:120px;">🏪 <strong>Shop:</strong></td>
                <td style="color:#111827; font-weight:600;">{escape(shop_name)}</td>
              </tr>
              <tr>
                <td style="color:#6b7280; padding:6px 0;">📍 <strong>Address:</strong></td>
                <td style="color:#374151;">{escape(shop_address)} ({distance_text})</td>
              </tr>
              <tr>
                <td style="color:#6b7280; padding:6px 0;">💰 <strong>Price:</strong></td>
                <td style="color:#ea580c; font-weight:700; font-size:18px;">
                  ₹{product.get('price_per_unit', 0)} / {escape(product.get('unit', 'kg'))}
                </td>
              </tr>
              <tr>
                <td style="color:#6b7280; padding:6px 0;">📦 <strong>Available:</strong></td>
                <td style="color:#111827; font-weight:600;">
                  {product.get('available_quantity', 0)} {escape(product.get('unit', 'kg'))}
                </td>
              </tr>
              <tr>
                <td style="color:#6b7280; padding:6px 0;">⏰ <strong>Available Until:</strong></td>
                <td style="color:#dc2626; font-weight:600;">{end_time_str}</td>
              </tr>
            </table>
          </div>

          <!-- Call to action button -->
          <div style="text-align:center; margin:28px 0 20px 0;">
            <a href="{offer_url}"
               style="background:linear-gradient(135deg, #166534, #22c55e); color:#ffffff; padding:14px 36px;
                      border-radius:50px; text-decoration:none; font-weight:700; font-size:16px; display:inline-block; box-shadow:0 4px 14px rgba(22,101,52,0.3);">
              🛒 View Offer &amp; Reserve
            </a>
          </div>

          <div style="text-align:center; margin-top:20px; padding-top:20px; border-top:1px solid #f1f5f9;">
            <p style="color:#9ca3af; font-size:12px; margin:0 0 4px 0;">
              You are receiving this alert because your email (<strong>{escape(to_email)}</strong>) is registered as a customer on ZeroLeft.
            </p>
            <p style="color:#9ca3af; font-size:12px; margin:0;">
              Zero produce wasted in our communities 🌱
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    await send_email(to_email, subject, html)


async def send_order_status_email(
    to_email: str, customer_name: str, order: dict, new_status: str
):
    status_messages = {
        "reserved": ("🛒 Order Received", "#2d6a4f", "Your reservation is saved. The vendor will confirm it shortly."),
        "confirmed": ("✅ Order Confirmed!", "#2d6a4f", "Your order has been confirmed by the vendor. Head over to pick it up!"),
        "packed": ("📦 Order Packed", "#f77f00", "Your order has been packed and is being prepared for collection."),
        "ready": ("📦 Ready for Collection", "#f77f00", "Your order is ready for collection. Please come to the shop."),
        "collected": ("✅ Order Collected", "#2d6a4f", "Your order has been marked as collected."),
        "cancelled": ("❌ Order Cancelled", "#e63946", "Unfortunately your order was cancelled. Any reserved stock has been released."),
    }
    emoji, color, message = status_messages.get(
        new_status, ("🔔 Order Update", "#2d6a4f", "Your order status has been updated.")
    )

    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family:'Segoe UI',Arial,sans-serif; background:#f9f5ee; margin:0; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background:white; border-radius:16px; overflow:hidden;">
        <div style="background:{color}; padding:24px; text-align:center;">
          <h1 style="color:white; margin:0; font-size:22px;">{emoji} {order['product_name']}</h1>
          <p style="color:rgba(255,255,255,0.9); margin:8px 0 0; font-size:16px;">{message}</p>
        </div>
        <div style="padding:32px;">
          <p>Hi <strong>{customer_name}</strong>,</p>
          <div style="background:#f9f5ee; border-radius:12px; padding:16px; margin:16px 0;">
            <table style="width:100%; border-collapse:collapse;">
              <tr><td style="color:#666;">Order Ref</td><td style="font-weight:700; color:#2d6a4f;">#{order['order_reference']}</td></tr>
              <tr><td style="color:#666;">Product</td><td>{order['product_name']}</td></tr>
              <tr><td style="color:#666;">Quantity</td><td>{order['quantity']} {order['unit']}</td></tr>
              <tr><td style="color:#666;">Total</td><td style="font-weight:700; color:#f77f00;">₹{order['total_price']}</td></tr>
              <tr><td style="color:#666;">Shop</td><td>{order['shop_name']}</td></tr>
            </table>
          </div>
          <div style="text-align:center; margin-top:24px;">
            <a href="{settings.frontend_url}/orders/{order['id']}"
               style="background:linear-gradient(135deg,#2d6a4f,#52b788); color:white; padding:12px 28px;
                      border-radius:50px; text-decoration:none; font-weight:700;">
              View Order Details
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    await send_email(to_email, f"{emoji} ZeroLeft Order Update — {order['product_name']}", html)


async def send_product_arrival_email(to_email: str, website_url: str = None):
    """
    Sends a short email notification informing the customer that new products have arrived.
    Subject: New Products Have Arrived!
    Body:
    Hello Customer,

    New products are now available in our shop! Visit our website to explore the latest arrivals.

    Visit Our Website: [Insert the actual website link]

    Thank you!
    """
    target_url = website_url or settings.frontend_url
    subject = "New Products Have Arrived!"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Products Have Arrived!</title>
    </head>
    <body style="font-family:'Segoe UI',Arial,sans-serif; background:#f9f5ee; margin:0; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:white; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08); border:1px solid #e9ecef;">
        <div style="background:linear-gradient(135deg, #166534, #22c55e); padding:24px 32px; text-align:center;">
          <h1 style="color:white; margin:0; font-size:24px; font-weight:700;">ZeroLeft</h1>
          <p style="color:rgba(255,255,255,0.9); margin:6px 0 0; font-size:14px;">Nearby Surplus Fruits, Vegetables & Flowers</p>
        </div>
        <div style="padding:32px;">
          <p style="font-size:16px; color:#2d3748; margin-top:0;">Hello Customer,</p>
          <p style="font-size:15px; color:#4a5568; line-height:1.6;">
            New products are now available in our shop! Visit our website to explore the latest arrivals.
          </p>
          <div style="margin:24px 0; text-align:center;">
            <a href="{target_url}"
               style="background:linear-gradient(135deg, #f97316, #ea580c); color:white; padding:12px 32px;
                      border-radius:50px; text-decoration:none; font-weight:700; font-size:15px; display:inline-block; box-shadow:0 4px 12px rgba(249,115,22,0.3);">
              Visit Our Website
            </a>
          </div>
          <p style="font-size:14px; color:#4a5568; margin-bottom:24px;">
            <strong>Visit Our Website:</strong> <a href="{target_url}" style="color:#166534; font-weight:600;">{target_url}</a>
          </p>
          <p style="font-size:15px; color:#2d3748; margin-bottom:0;">
            Thank you!
          </p>
        </div>
      </div>
    </body>
    </html>
    """
    await send_email(to_email=to_email, subject=subject, html_body=html)
