import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Navbar from '../components/Navbar';
import { useAuthStore } from '../store/authStore';
import type { Product, SessionStatus } from '../types';

function liveSessionStatus(product: Product): SessionStatus {
  if (product.session_status === 'cancelled') return 'cancelled';
  const now = Date.now();
  const start = new Date(product.session_start).getTime();
  const end = new Date(product.session_end).getTime();
  if (Number.isFinite(start) && now < start) return 'scheduled';
  if (Number.isFinite(end) && now > end) return 'expired';
  return product.session_status === 'expired' ? 'expired' : 'active';
}

export default function OfferPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [quantity, setQuantity] = useState(1);
  const productQuery = useQuery<Product>({
    queryKey: ['product', productId],
    enabled: Boolean(productId),
    queryFn: () => api.get(`/products/${productId}`).then((response) => response.data),
  });
  const reserveMutation = useMutation({
    mutationFn: () => api.post('/reservations/', { product_id: productId, quantity }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['nearby-products'] });
      await queryClient.invalidateQueries({ queryKey: ['customer-reservations'] });
      toast.success('Order reserved. The vendor will confirm it shortly.');
      navigate('/customer/dashboard');
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      toast.error(error.response?.data?.detail || 'Could not reserve this offer.');
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
  });

  const customerProfileQuery = useQuery({
    queryKey: ['customer-profile'],
    queryFn: () => api.get('/customer/profile').then((response) => response.data),
    enabled: user?.role === 'customer',
  });

  const product = productQuery.data;
  const sessionStatus = product ? liveSessionStatus(product) : undefined;
  const isAvailable = Boolean(
    product
    && sessionStatus === 'active'
    && product.available_quantity > 0,
  );
  const step = product && ['kg', 'g', 'litre'].includes(product.unit.toLowerCase()) ? 0.1 : 1;
  const total = product ? (quantity * product.price_per_unit).toFixed(2) : '0.00';
  const coords = product?.shop_location?.coordinates;
  const custCoords = customerProfileQuery.data?.preferred_location?.coordinates;
  const directions = coords?.length === 2
    ? custCoords?.length === 2
      ? `https://www.google.com/maps/dir/?api=1&origin=${custCoords[1]},${custCoords[0]}&destination=${coords[1]},${coords[0]}`
      : `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`
    : undefined;

  return (
    <div className="page">
      <Navbar />
      <main className="page-content">
        <div className="container" style={{ maxWidth: 900 }}>
          <Link to="/customer/dashboard" className="btn btn-ghost btn-sm">← Back to offers</Link>
          {productQuery.isLoading && <div className="loading-center"><div className="spinner spinner-lg" /><p>Loading latest offer details…</p></div>}
          {productQuery.isError && <div className="alert alert-warning">Could not load this offer. The link may be invalid or unavailable.</div>}
          {product && (
            <article className="card card-body" style={{ marginTop: 16 }}>
              <div className="form-row">
                <div>
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.product_name} style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 16 }} />
                  ) : (
                    <div className="empty-state" aria-label="No product image">No product photo available</div>
                  )}
                </div>
                <div>
                  <span className="badge badge-gray">{product.category}</span>
                  <h1 className="section-title">{product.product_name}</h1>
                  <p>{product.description}</p>
                  <p><strong>{product.shop_name}</strong></p>
                  <p>{product.shop_address}</p>
                  <p>
                    <strong>₹{product.price_per_unit}</strong> / {product.unit}
                    {product.discount_percent > 0 && (
                      <> <del>₹{product.original_price_per_unit}</del> <span className="badge badge-orange">{product.discount_percent}% off</span></>
                    )}
                  </p>
                  <p><Package size={15} /> {product.available_quantity} {product.unit} available</p>
                  <p>Start session: {new Date(product.session_start).toLocaleString()}</p>
                  <p>End session: {new Date(product.session_end).toLocaleString()}</p>
                  {directions && (
                    <div style={{ marginTop: 12 }}>
                      {custCoords?.length === 2 && (
                        <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 8, marginBottom: 8, fontSize: '0.85rem', border: '1px solid #e2e8f0' }}>
                          <div style={{ color: '#0369a1', fontWeight: 600 }}>📍 From (Your Location): <span style={{ color: '#334155', fontWeight: 400 }}>{customerProfileQuery.data?.preferred_location?.address || `${custCoords[1].toFixed(4)}, ${custCoords[0].toFixed(4)}`}</span></div>
                          <div style={{ color: '#15803d', fontWeight: 600, marginTop: 4 }}>🏪 To (Vendor Shop): <span style={{ color: '#334155', fontWeight: 400 }}>{product.shop_address || product.shop_name}</span></div>
                        </div>
                      )}
                      <a className="btn btn-outline btn-sm" href={directions} target="_blank" rel="noreferrer">
                        <MapPin size={14} /> Directions from your location to shop
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <hr />
              {user?.role === 'customer' && isAvailable ? (
                <div>
                  <label className="form-label" htmlFor="reserve-quantity">Quantity ({product.unit})</label>
                  <input
                    id="reserve-quantity"
                    className="form-input"
                    type="number"
                    min={step}
                    step={step}
                    max={product.available_quantity}
                    value={quantity}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setQuantity(Number.isFinite(next) ? next : 0);
                    }}
                  />
                  <p>Total due at collection: <strong>₹{total}</strong></p>
                  <button
                    className="btn btn-primary btn-lg"
                    type="button"
                    disabled={reserveMutation.isPending || !Number.isFinite(quantity) || quantity <= 0 || quantity > product.available_quantity}
                    onClick={() => reserveMutation.mutate()}
                  >
                    {reserveMutation.isPending ? 'Reserving…' : `Confirm order for ${user?.full_name || 'you'}`}
                  </button>
                </div>
              ) : user?.role === 'vendor' ? (
                <div className="alert alert-info">You are viewing the customer offer page. Reservations are available only from a customer account.</div>
              ) : sessionStatus === 'scheduled' ? (
                <div className="alert alert-info" role="status">
                  This selling session has not started yet. Orders open at {new Date(product.session_start).toLocaleString()}.
                </div>
              ) : sessionStatus === 'expired' || sessionStatus === 'cancelled' ? (
                <div className="alert alert-warning" role="status">
                  {sessionStatus === 'cancelled'
                    ? 'This offer has been cancelled. You cannot place an order.'
                    : 'This offer has expired. End session is complete, so you cannot place an order.'}
                </div>
              ) : product.available_quantity <= 0 ? (
                <div className="alert alert-warning" role="status">This offer is sold out.</div>
              ) : (
                <div className="alert alert-warning" role="status">
                  This offer is no longer available for reservation.
                </div>
              )}
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
