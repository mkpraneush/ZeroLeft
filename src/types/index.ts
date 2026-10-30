// Shared TypeScript types matching the backend Pydantic models

export type Role = 'customer' | 'vendor' | 'admin';

export type SessionStatus = 'scheduled' | 'active' | 'expired' | 'cancelled';
export type StockStatus = 'available' | 'limited' | 'sold_out' | 'offer_expired';
export type OrderStatus = 'reserved' | 'confirmed' | 'packed' | 'ready' | 'collected' | 'cancelled' | 'expired';
export type ProductCategory = 'vegetables' | 'fruits' | 'flowers' | 'other';

export interface ShopLocation {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
  address?: string;
}

export interface VendorProfile {
  id: string;
  user_id: string;
  shop_name: string;
  shop_address: string;
  shop_hours: { open_time: string; close_time: string; timezone: string };
  location?: ShopLocation;
  staff_names: string[];
  staff_contacts: string[];
  additional_info?: string;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerPreferences {
  search_radius_km: number;
  preferred_categories: string[];
  email_notifications: boolean;
}

export interface CustomerProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone?: string;
  preferred_location?: ShopLocation;
  preferences: CustomerPreferences;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  vendor_id: string;
  vendor_name: string;
  shop_name: string;
  shop_address: string;
  shop_location?: ShopLocation | null;
  product_name: string;
  category: ProductCategory;
  initial_quantity: number;
  available_quantity: number;
  reserved_quantity: number;
  collected_quantity: number;
  unit: string;
  price_per_unit: number;
  original_price_per_unit: number;
  discount_percent: number;
  session_start: string;
  session_end: string;
  session_status: SessionStatus;
  stock_status: StockStatus;
  image_url?: string;
  description?: string;
  distance_km?: number;
  active_reservations_count: number;
  notification_status?: { eligible: number; sent: number; failed: number; pending: number };
  created_at: string;
  updated_at: string;
}

export interface Reservation {
  id: string;
  order_reference: string;
  product_id: string;
  customer_id: string;
  vendor_id: string;
  product_name: string;
  shop_name: string;
  shop_address?: string;
  shop_location?: ShopLocation;
  quantity: number;
  unit: string;
  price_per_unit: number;
  total_price: number;
  status: OrderStatus;
  email_status?: 'pending' | 'sent' | 'failed';
  image_url?: string;
  reserved_at: string;
  updated_at: string;
}
