import { Link } from 'react-router-dom';
import { MapPin, Clock, Package, Tag, Zap } from 'lucide-react';
import type { Product } from '../types';
import { formatDistanceToNow, format } from 'date-fns';
import './ProductCard.css';

interface Props {
  product: Product;
  showDistance?: boolean;
}

const STATUS_CONFIG = {
  available:    { label: 'Available',    cls: 'badge-green',  icon: '✅' },
  limited:      { label: 'Limited Stock', cls: 'badge-orange', icon: '⚡' },
  sold_out:     { label: 'Sold Out',      cls: 'badge-red',    icon: '❌' },
  offer_expired:{ label: 'Expired',       cls: 'badge-gray',   icon: '⏰' },
};

const SESSION_CONFIG = {
  scheduled: { label: 'Scheduled', cls: 'badge-blue' },
  active:    { label: 'Live Now',   cls: 'badge-green' },
  expired:   { label: 'Ended',     cls: 'badge-gray' },
  cancelled: { label: 'Cancelled', cls: 'badge-red' },
};

export default function ProductCard({ product, showDistance = true }: Props) {
  const stockCfg = STATUS_CONFIG[product.stock_status] || STATUS_CONFIG.available;
  const now = Date.now();
  const startMs = new Date(product.session_start).getTime();
  const endMs = new Date(product.session_end).getTime();
  const liveStatus = product.session_status === 'cancelled'
    ? 'cancelled'
    : now < startMs
      ? 'scheduled'
      : now > endMs
        ? 'expired'
        : 'active';
  const sessionCfg = SESSION_CONFIG[liveStatus] || SESSION_CONFIG.scheduled;
  const isActive = liveStatus === 'active' && product.available_quantity > 0;

  const endDate = new Date(product.session_end);
  const timeLeft = endDate > new Date()
    ? `Ends ${formatDistanceToNow(endDate, { addSuffix: true })}`
    : `Ended ${format(endDate, 'dd MMM, h:mm a')}`;

  return (
    <article className={`product-card card animate-fade-in ${!isActive ? 'product-card--inactive' : ''}`}>
      {/* Image */}
      <div className="product-card-image-wrap">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.product_name}
            className="product-card-image"
            loading="lazy"
          />
        ) : (
          <div className="product-card-image-placeholder">
            {product.category === 'fruits' ? '🍊' :
             product.category === 'vegetables' ? '🥬' :
             product.category === 'flowers' ? '🌸' : '🛍️'}
          </div>
        )}
        {/* Stock badge overlay */}
        <div className={`product-card-stock-badge badge ${stockCfg.cls}`}>
          {stockCfg.icon} {stockCfg.label}
        </div>
        {/* Live indicator */}
        {liveStatus === 'active' && (
          <div className="product-card-live-dot">
            <span className="live-pulse" /> Live
          </div>
        )}
      </div>

      {/* Body */}
      <div className="card-body product-card-body">
        {/* Category + Session status */}
        <div className="product-card-meta">
          <span className="badge badge-gray product-card-category">
            {product.category}
          </span>
          <span className={`badge ${sessionCfg.cls}`}>{sessionCfg.label}</span>
        </div>

        {/* Name */}
        <h3 className="product-card-name">{product.product_name}</h3>

        {/* Shop */}
        <p className="product-card-shop">
          <Tag size={13} /> {product.shop_name}
        </p>

        {/* Price */}
        <div className="product-card-price-row">
          <div className="product-card-price">
            <span className="price-currency">₹</span>
            <span className="price-amount">{product.price_per_unit}</span>
            <span className="price-unit">/{product.unit}</span>
          </div>
          {showDistance && product.distance_km !== undefined && (
            <div className="product-card-distance">
              <MapPin size={13} />
              {product.distance_km < 1
                ? `${(product.distance_km * 1000).toFixed(0)}m`
                : `${product.distance_km.toFixed(1)} km`}
            </div>
          )}
        </div>

        {/* Stock info */}
        <div className="product-card-stock">
          <div className="stock-row">
            <Package size={13} />
            <span>
              <strong>{product.available_quantity}</strong>
              <span className="stock-detail">/{product.initial_quantity} {product.unit} left</span>
            </span>
          </div>
          {product.reserved_quantity > 0 && (
            <span className="stock-reserved">
              {product.reserved_quantity} {product.unit} reserved
            </span>
          )}
        </div>

        {/* Stock progress bar */}
        <div className="product-card-progress" aria-label="Stock remaining">
          <div
            className={`product-card-progress-bar ${
              product.available_quantity / product.initial_quantity <= 0.25 ? 'low' : ''
            }`}
            style={{
              width: `${Math.max(0, Math.min(100, (product.available_quantity / product.initial_quantity) * 100))}%`
            }}
          />
        </div>

        {/* Time */}
        <p className="product-card-time">
          <Clock size={13} /> {timeLeft}
        </p>

        {/* Action */}
        <Link
          to={`/offer/${product.id}`}
          className={`btn btn-full ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ marginTop: '12px' }}
        >
          {isActive ? <><Zap size={15} /> Reserve Now</> : 'View Details'}
        </Link>
      </div>
    </article>
  );
}
