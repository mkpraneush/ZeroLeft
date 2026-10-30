import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus, Package, Clock, CheckCircle, XCircle, MapPin,
  Edit3, Trash2, Eye, TrendingUp, ShoppingBag, Zap, TimerOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Navbar from '../components/Navbar';
import type { Product, Reservation } from '../types';
import { format } from 'date-fns';
import './VendorDashboard.css';

type DashboardData = {
  vendor: any;
  active_offers: Product[];
  scheduled_offers: Product[];
  expired_offers: Product[];
  sold_out_offers: Product[];
  incoming_reservations: Reservation[];
  packing_queue: Reservation[];
  completed_collections: Reservation[];
  cancelled_reservations: Reservation[];
};

const ORDER_TRANSITIONS: Record<string, string> = {
  reserved: 'confirmed',
  confirmed: 'packed',
  packed: 'ready',
  ready: 'collected',
};

const STATUS_LABELS: Record<string, string> = {
  reserved: 'Confirm',
  confirmed: 'Pack order',
  packed: 'Mark ready for collection',
  ready: 'Mark Collected',
};

export default function VendorDashboard() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'offers' | 'orders'>('offers');

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['vendor-dashboard'],
    queryFn: () => api.get('/vendor/dashboard').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const transitionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/reservations/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-dashboard'] });
      toast.success('Order updated!');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Update failed'),
  });

  const cancelProductMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-dashboard'] });
      toast.success('Offer cancelled');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Could not cancel this offer.'),
  });

  const endSessionMutation = useMutation({
    mutationFn: (id: string) => api.post(`/products/${id}/end-session`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['vendor-dashboard'] });
      toast.success(res.data?.message || 'Session ended. Offer expired.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Could not end this session.'),
  });

  if (isLoading) {
    return (
      <div className="page">
        <Navbar />
        <div className="loading-center"><div className="spinner spinner-lg" /><p>Loading dashboard…</p></div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page">
        <Navbar />
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <h3>Failed to load dashboard</h3>
          <p>Please refresh the page or try again later.</p>
        </div>
      </div>
    );
  }

  const { vendor, active_offers, scheduled_offers, expired_offers, sold_out_offers,
    incoming_reservations, packing_queue, completed_collections, cancelled_reservations } = data;

  const allOrders = [...incoming_reservations, ...packing_queue, ...completed_collections, ...cancelled_reservations];
  const totalRevenue = completed_collections.reduce((sum, r) => sum + r.total_price, 0);

  return (
    <div className="page vendor-dashboard">
      <Navbar />
      <div className="page-content">
        <div className="container">
          {/* Header */}
          <div className="dashboard-header animate-fade-in">
            <div>
              <h1 className="section-title" style={{ marginBottom: 4 }}>
                👋 {vendor.shop_name || 'Your Shop'}
              </h1>
              {vendor.location ? (
                <p className="vendor-location">
                  <MapPin size={14} /> {vendor.location.address || 'Location set'}
                </p>
              ) : (
                <Link to="/vendor/profile" className="alert alert-warning" style={{ display: 'inline-flex', marginTop: 8, fontSize: '0.82rem' }}>
                  ⚠️ Add your shop location to receive customer notifications
                </Link>
              )}
            </div>
            <div className="dashboard-header-actions">
              <Link to="/vendor/profile" className="btn btn-outline btn-sm">Edit Profile</Link>
              <Link to="/vendor/add-product" className="btn btn-primary">
                <Plus size={16} /> Add Product
              </Link>
            </div>
          </div>

          {/* Shopkeeper Stall Showcase with uploaded character */}
          <div className="shopkeeper-stall-showcase animate-fade-in">
            <div className="stall-info-col">
              <div className="stall-status-badge">
                <span className="live-pulse" /> Vendor dashboard
              </div>
              <h2 className="stall-headline">
                Manage your local shop
              </h2>
              <p className="stall-desc">
                Publish your available products and manage each pickup from reservation through collection.
                Matching, verified customers who opted in can receive an email for eligible nearby offers. Delivery results are shown with each offer.
              </p>
              <div className="stall-perks">
                <div className="stall-perk-item">
                  <span className="perk-icon">📦</span>
                  <span>Live inventory and pickup orders</span>
                </div>
                <div className="stall-perk-item">
                  <span className="perk-icon">📧</span>
                  <span>Eligible Nearby Email Alerts</span>
                </div>
              </div>
              <div className="stall-cta-row">
                <Link to="/vendor/add-product" className="btn btn-primary">
                  <Plus size={16} /> Add New Product
                </Link>
                <div className="stall-note">
                  <span className="badge badge-green">Update stock from each order</span>
                </div>
              </div>
            </div>

            <div className="stall-visual-col">
              <div className="shop-counter-scene">
                <div className="speech-bubble">
                  "Here are fresh, ripe tomatoes for you today! 🍅"
                </div>
                <div className="character-counter-frame">
                  <img
                    src="/assets/shopkeeper-character.png"
                    alt="Shopkeeper at fresh produce stall"
                    className="shopkeeper-character-portrait"
                  />
                  <div className="shop-counter-table">
                    <span className="counter-wood-label">🧺 ZeroLeft Fresh Produce Stall</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="dashboard-stats animate-fade-in">
            <div className="stat-pill">
              <Zap size={18} className="stat-pill-icon green" />
              <div>
                <div className="stat-pill-value">{active_offers.length}</div>
                <div className="stat-pill-label">Active Offers</div>
              </div>
            </div>
            <div className="stat-pill">
              <ShoppingBag size={18} className="stat-pill-icon orange" />
              <div>
                <div className="stat-pill-value">{incoming_reservations.length}</div>
                <div className="stat-pill-label">New Orders</div>
              </div>
            </div>
            <div className="stat-pill">
              <Package size={18} className="stat-pill-icon blue" />
              <div>
                <div className="stat-pill-value">{packing_queue.length}</div>
                <div className="stat-pill-label">Packing</div>
              </div>
            </div>
            <div className="stat-pill">
              <TrendingUp size={18} className="stat-pill-icon green" />
              <div>
                <div className="stat-pill-value">₹{totalRevenue.toFixed(0)}</div>
                <div className="stat-pill-label">Collected</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="dashboard-tabs">
            <button
              className={`tab-btn ${activeTab === 'offers' ? 'active' : ''}`}
              onClick={() => setActiveTab('offers')}
            >
              <Package size={16} /> My Offers
            </button>
            <button
              className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <ShoppingBag size={16} /> Orders
              {incoming_reservations.length > 0 && (
                <span className="tab-badge">{incoming_reservations.length}</span>
              )}
            </button>
          </div>

          {/* Offers Tab */}
          {activeTab === 'offers' && (
            <div className="animate-fade-in">
              {active_offers.length === 0 && scheduled_offers.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">🥬</div>
                  <h3>No offers yet</h3>
                  <p>Add your first product to start receiving orders from nearby customers.</p>
                  <Link to="/vendor/add-product" className="btn btn-primary">
                    <Plus size={16} /> Add First Product
                  </Link>
                </div>
              )}

              {/* Active */}
              {active_offers.length > 0 && (
                <OfferSection
                  title="🟢 Active Offers"
                  offers={active_offers}
                  onCancel={(id) => { if (confirm('Cancel this offer?')) cancelProductMutation.mutate(id); }}
                  onEndSession={(id) => { if (confirm('End this session now? The offer will expire and customers will not be able to place new orders.')) endSessionMutation.mutate(id); }}
                />
              )}
              {/* Scheduled */}
              {scheduled_offers.length > 0 && (
                <OfferSection title="🕐 Scheduled" offers={scheduled_offers} onCancel={(id) => { if (confirm('Cancel this offer?')) cancelProductMutation.mutate(id); }} />
              )}
              {/* Sold out */}
              {sold_out_offers.length > 0 && (
                <OfferSection title="📦 Sold Out" offers={sold_out_offers} onCancel={() => {}} />
              )}
              {/* Expired */}
              {expired_offers.length > 0 && (
                <OfferSection title="⏰ Expired" offers={expired_offers} onCancel={() => {}} />
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div className="animate-fade-in">
              {allOrders.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📭</div>
                  <h3>No orders yet</h3>
                  <p>Orders will appear here when customers reserve your products.</p>
                </div>
              ) : (
                <div className="orders-list">
                  {/* Incoming */}
                  {incoming_reservations.length > 0 && (
                    <div>
                      <h3 className="orders-section-title">🔔 New Orders ({incoming_reservations.length})</h3>
                      {incoming_reservations.map((r) => (
                        <OrderCard
                          key={r.id}
                          reservation={r}
                          onTransition={(id, st) => transitionMutation.mutate({ id, status: st })}
                          pending={transitionMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                  {/* Packing */}
                  {packing_queue.length > 0 && (
                    <div>
                      <h3 className="orders-section-title">📦 Packing Queue ({packing_queue.length})</h3>
                      {packing_queue.map((r) => (
                        <OrderCard
                          key={r.id}
                          reservation={r}
                          onTransition={(id, st) => transitionMutation.mutate({ id, status: st })}
                          pending={transitionMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                  {/* Completed */}
                  {completed_collections.length > 0 && (
                    <div>
                      <h3 className="orders-section-title">✅ Completed ({completed_collections.length})</h3>
                      {completed_collections.map((r) => (
                        <OrderCard key={r.id} reservation={r} onTransition={() => {}} pending={false} />
                      ))}
                    </div>
                  )}
                  {cancelled_reservations.length > 0 && (
                    <div>
                      <h3 className="orders-section-title">Cancelled / expired ({cancelled_reservations.length})</h3>
                      {cancelled_reservations.map((r) => (
                        <OrderCard key={r.id} reservation={r} onTransition={() => {}} pending={false} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-Components ───────────────────────────────── */

function OfferSection({ title, offers, onCancel, onEndSession }: {
  title: string;
  offers: Product[];
  onCancel: (id: string) => void;
  onEndSession?: (id: string) => void;
}) {
  return (
    <div className="offer-section">
      <h3 className="offers-section-title">{title}</h3>
      <div className="offers-table-wrap">
        <table className="offers-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Reserved</th>
              <th>Start session</th>
              <th>End session</th>
              <th>Status</th>
              <th>Email notifications</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="offer-name-cell">
                    {p.image_url ? <img src={p.image_url} alt={p.product_name} className="offer-thumb" /> : <div className="offer-thumb-placeholder">🥬</div>}
                    <span>{p.product_name}</span>
                  </div>
                </td>
                <td className="price-cell">₹{p.price_per_unit}/{p.unit}</td>
                <td>{p.available_quantity}/{p.initial_quantity} {p.unit}</td>
                <td>{p.reserved_quantity} {p.unit}</td>
                <td>{format(new Date(p.session_start), 'dd MMM, h:mm a')}</td>
                <td>{format(new Date(p.session_end), 'dd MMM, h:mm a')}</td>
                <td>
                  <span className={`badge ${p.session_status === 'active' ? 'badge-green' : p.session_status === 'scheduled' ? 'badge-blue' : 'badge-gray'}`}>
                    {p.session_status}
                  </span>
                </td>
                <td>
                  <small>
                    {p.notification_status?.sent || 0} sent · {p.notification_status?.failed || 0} failed
                    {p.notification_status?.pending ? ` · ${p.notification_status.pending} pending` : ''}
                    <br />
                    {p.notification_status?.eligible || 0} eligible
                  </small>
                </td>
                <td>
                  <div className="offer-actions">
                    <Link to={`/offer/${p.id}`} className="icon-btn" title="View offer">
                      <Eye size={15} />
                    </Link>
                    <Link to={`/vendor/edit-product/${p.id}`} className="icon-btn" title="Edit offer">
                      <Edit3 size={15} />
                    </Link>
                    {onEndSession && p.session_status === 'active' && (
                      <button className="icon-btn" title="End session now" onClick={() => onEndSession(p.id)}>
                        <TimerOff size={15} />
                      </button>
                    )}
                    {(p.session_status === 'active' || p.session_status === 'scheduled') && (
                      <button className="icon-btn danger" title="Cancel offer" onClick={() => onCancel(p.id)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderCard({ reservation: r, onTransition, pending }: {
  reservation: Reservation;
  onTransition: (id: string, status: string) => void;
  pending: boolean;
}) {
  const nextStatus = ORDER_TRANSITIONS[r.status];
  const nextLabel = STATUS_LABELS[r.status];
  const isCompleted = ['collected', 'cancelled', 'expired'].includes(r.status);

  return (
    <div className={`order-card ${isCompleted ? 'order-card--done' : ''}`}>
      <div className="order-card-header">
        <div>
          <span className="order-ref">#{r.order_reference}</span>
          <span className={`badge ${
            r.status === 'reserved' ? 'badge-orange' :
            r.status === 'confirmed' ? 'badge-blue' :
            r.status === 'packed' ? 'badge-green' :
            r.status === 'ready' ? 'badge-green' :
            r.status === 'collected' ? 'badge-green' : 'badge-gray'
          }`}>
            {r.status}
          </span>
        </div>
        <span className="order-time">{format(new Date(r.reserved_at), 'dd MMM, h:mm a')}</span>
      </div>
      <div className="order-card-body">
        <div className="order-detail">
          <strong>{r.product_name}</strong>
          <span>{r.quantity} {r.unit}</span>
          <span className="order-price">₹{r.total_price}</span>
        </div>
        {!isCompleted && nextStatus && (
          <div className="order-actions">
            <button
              className={`btn btn-sm ${nextStatus === 'cancelled' ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => onTransition(r.id, nextStatus)}
              disabled={pending}
            >
              {nextLabel}
            </button>
            {r.status === 'reserved' && (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => onTransition(r.id, 'cancelled')}
                disabled={pending}
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
