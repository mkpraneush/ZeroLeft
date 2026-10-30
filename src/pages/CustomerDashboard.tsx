import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Compass, MapPin, Navigation, Search, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuthStore } from '../store/authStore';
import type { CustomerProfile, Product, Reservation, ShopLocation } from '../types';
import './CustomerDashboard.css';

type NearbyProducts = { results: Product[]; total: number };

function mapsDirections(order: Reservation, customerLocation?: ShopLocation) {
  const shopCoords = order.shop_location?.coordinates;
  if (!shopCoords || shopCoords.length !== 2) return undefined;
  const [shopLng, shopLat] = shopCoords;

  const custCoords = customerLocation?.coordinates;
  if (custCoords && custCoords.length === 2) {
    const [custLng, custLat] = custCoords;
    return `https://www.google.com/maps/dir/?api=1&origin=${custLat},${custLng}&destination=${shopLat},${shopLng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${shopLat},${shopLng}`;
}

export default function CustomerDashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Live GPS states
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const profileQuery = useQuery<CustomerProfile>({
    queryKey: ['customer-profile'],
    queryFn: () => api.get('/customer/profile').then((response) => response.data),
  });
  const profile = profileQuery.data;

  // Active query coordinates: live GPS takes priority over saved static profile coordinates
  const activeLat = liveLocation?.lat ?? profile?.preferred_location?.coordinates?.[1];
  const activeLng = liveLocation?.lng ?? profile?.preferred_location?.coordinates?.[0];
  const radius = profile?.preferences?.search_radius_km || 10;

  // Effective location used for directions and relative distance calculation
  const effectiveLocation: ShopLocation | undefined = useMemo(() => {
    if (activeLat !== undefined && activeLng !== undefined) {
      return {
        type: 'Point',
        coordinates: [activeLng, activeLat],
        address: liveLocation ? 'Live Device Location' : profile?.preferred_location?.address,
      };
    }
    return profile?.preferred_location ?? undefined;
  }, [activeLat, activeLng, liveLocation, profile?.preferred_location]);

  // Nearby query automatically updates whenever activeLat / activeLng changes
  const productsQuery = useQuery<NearbyProducts>({
    queryKey: ['nearby-products', activeLat, activeLng, radius, selectedCategory],
    enabled: Boolean(activeLat !== undefined && activeLng !== undefined && radius),
    queryFn: () => api.get('/products/nearby/search', {
      params: {
        lat: activeLat,
        lng: activeLng,
        radius_km: radius,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
      },
    }).then((response) => response.data),
    refetchInterval: 15000,
  });

  const ordersQuery = useQuery<Reservation[]>({
    queryKey: ['customer-reservations'],
    queryFn: () => api.get('/reservations/my-orders').then((response) => response.data),
    refetchInterval: 15000,
  });

  // Background auto-save current location to profile if user has none saved
  const saveLocationMutation = useMutation({
    mutationFn: async ({ lat, lng }: { lat: number; lng: number }) => {
      return api.put('/customer/profile', {
        preferred_location: {
          type: 'Point',
          coordinates: [lng, lat],
          address: 'Current Device Location',
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
    },
  });

  // Real-time Geolocation tracking (watchPosition)
  const toggleLiveTracking = () => {
    if (isLiveTracking) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsLiveTracking(false);
      toast('Live GPS tracking paused.', { icon: '⏸️' });
      return;
    }

    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLiveLocation({ lat: latitude, lng: longitude });
        setIsLiveTracking(true);
        setIsLocating(false);

        // Auto-save to profile once if no saved profile coordinates exist yet
        if (!profile?.preferred_location?.coordinates) {
          saveLocationMutation.mutate({ lat: latitude, lng: longitude });
        }
      },
      (err) => {
        setIsLocating(false);
        setIsLiveTracking(false);
        if (err.code === 1) {
          toast.error('Location permission was denied. Allow location in your browser settings.');
        } else {
          toast.error('Could not track live GPS location.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );
    watchIdRef.current = id;
    toast.success('Live GPS tracking activated! Nearby offers and distances are updating automatically.');
  };

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Automatic first-time location detection on load if user hasn't set location
  useEffect(() => {
    if (profile && !profile.preferred_location?.coordinates && !liveLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setLiveLocation({ lat: latitude, lng: longitude });
          saveLocationMutation.mutate({ lat: latitude, lng: longitude });
          toast.success('Current location detected automatically.');
        },
        () => {
          // silently ignore fallback
        },
        { enableHighAccuracy: false, timeout: 7000 }
      );
    }
  }, [profile]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/reservations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['nearby-products'] });
      toast.success('Order cancelled and stock released.');
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      toast.error(error.response?.data?.detail || 'Could not cancel this order.');
    },
  });

  const products = productsQuery.data?.results ?? [];
  const filteredProducts = useMemo(() => products.filter((product) => {
    const query = searchTerm.trim().toLowerCase();
    return !query
      || product.product_name.toLowerCase().includes(query)
      || product.shop_name.toLowerCase().includes(query);
  }), [products, searchTerm]);

  return (
    <div className="page customer-dashboard">
      <Navbar />
      <main className="page-content">
        <div className="container">
          <section className="customer-showcase-card animate-fade-in">
            <div className="customer-info-col">
              <span className="customer-verified-tag">Fresh local offers, updated live</span>
              <h1 className="customer-showcase-title">Welcome, {user?.full_name || 'Customer'}!</h1>
              <p className="customer-showcase-desc">
                Browse real offers near your location, reserve available stock, and track distances in real-time.
              </p>
              <div className="customer-actions-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn ${isLiveTracking ? 'btn-danger' : 'btn-primary'}`}
                  onClick={toggleLiveTracking}
                  disabled={isLocating}
                >
                  <Navigation size={16} />
                  {isLocating
                    ? 'Acquiring GPS…'
                    : isLiveTracking
                    ? 'Stop Live GPS Tracking'
                    : 'Enable Live GPS Tracking'}
                </button>
                <Link to="/customer/profile" className="btn btn-outline">
                  <MapPin size={16} /> {effectiveLocation ? 'Edit Profile & Radius' : 'Set your location'}
                </Link>
                {effectiveLocation && (
                  <span className={`badge ${isLiveTracking ? 'badge-green' : 'badge-blue'}`}>
                    {isLiveTracking ? '📡 Live GPS Active' : '📍 Saved Location'} • {radius} km
                  </span>
                )}
              </div>
              {liveLocation && (
                <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Compass size={14} />
                  <span>Tracking: <strong>{liveLocation.lat.toFixed(4)}° N, {liveLocation.lng.toFixed(4)}° E</strong></span>
                </div>
              )}
            </div>
            <div className="customer-character-col">
              <img src="/assets/customer-character.jpg" alt="" className="customer-character-img" />
            </div>
          </section>

          {profileQuery.isLoading && <div className="loading-center"><div className="spinner spinner-lg" /><p>Loading your profile…</p></div>}
          {profileQuery.isError && (
            <div className="alert alert-warning" role="alert">
              Could not load your profile. <Link to="/customer/profile">Open your profile</Link> or retry the page.
            </div>
          )}
          {!profileQuery.isLoading && !effectiveLocation && (
            <div className="alert alert-info" role="status">
              Click <strong>Enable Live GPS Tracking</strong> above or save your location to discover nearby farm produce.
            </div>
          )}

          <section className="marketplace-section" id="marketplace-section">
            <div className="marketplace-header">
              <div>
                <h2 className="section-title">Nearby offers</h2>
                <p className="section-subtitle">
                  {effectiveLocation
                    ? `Live products matching within ${radius} km radius.`
                    : 'Only active products with available stock are shown.'}
                </p>
              </div>
              <div className="search-bar-wrap">
                <Search size={18} className="search-icon" />
                <input
                  type="search"
                  placeholder="Search products or shops"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="search-input"
                  aria-label="Search nearby products"
                />
              </div>
            </div>

            <div className="category-chips-row" aria-label="Filter by category">
              {['all', 'vegetables', 'fruits', 'flowers', 'other'].map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`category-chip ${selectedCategory === category ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category === 'all' ? 'All products' : category}
                </button>
              ))}
            </div>

            {productsQuery.isLoading && effectiveLocation && (
              <div className="loading-center"><div className="spinner spinner-lg" /><p>Recalculating nearby offers…</p></div>
            )}
            {productsQuery.isError && (
              <div className="alert alert-warning" role="alert">Could not load nearby offers. Please retry.</div>
            )}
            {productsQuery.isSuccess && filteredProducts.length === 0 && (
              <div className="empty-state">
                <AlertCircle size={40} className="empty-icon" />
                <h3>No active offers found</h3>
                <p>Try expanding your radius in profile or check back later.</p>
              </div>
            )}
            {filteredProducts.length > 0 && (
              <div className="products-grid">
                {filteredProducts.map((product) => {
                  const percent = Math.round(product.discount_percent || 0);
                  const discountLabel = percent > 0 ? `${percent}% OFF` : undefined;
                  return (
                    <article key={product.id} className="product-card">
                      <Link to={`/offer/${product.id}`} className="product-card-media" aria-label={`View ${product.product_name}`}>
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.product_name} className="product-card-img" />
                        ) : (
                          <div className="product-card-img product-card-placeholder" aria-hidden="true">
                            {product.category === 'fruits' ? '🍎' : product.category === 'flowers' ? '🌸' : product.category === 'vegetables' ? '🥦' : '📦'}
                          </div>
                        )}
                        <span className="category-badge">{product.category}</span>
                        {product.distance_km !== undefined && (
                          <span className="distance-badge"><MapPin size={12} /> {product.distance_km.toFixed(1)} km away</span>
                        )}
                      </Link>
                      <div className="product-card-body">
                        <Link to={`/offer/${product.id}`} className="product-title">{product.product_name}</Link>
                        <p className="product-shop-name"><MapPin size={13} /> {product.shop_name}</p>
                        {product.description && <p className="product-desc">{product.description}</p>}
                        <div className="product-pricing-row">
                          <div>
                            <span className="price-current">₹{product.price_per_unit.toFixed(2)}</span>
                            <span className="price-unit">/{product.unit}</span>
                            {product.original_price_per_unit && (
                              <span className="price-original">₹{product.original_price_per_unit.toFixed(2)}</span>
                            )}
                          </div>
                          {discountLabel && <span className="discount-pill">{discountLabel}</span>}
                        </div>
                        <div className="product-meta-row">
                          <span className={`stock-pill ${product.stock_status === 'limited' ? 'stock-limited' : 'stock-available'}`}>
                            {product.available_quantity} {product.unit} left
                          </span>
                        </div>
                        <Link to={`/offer/${product.id}`} className="btn btn-primary btn-block">
                          View details
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="customer-reservations-section" id="customer-reservations-section">
            <h2 className="section-title"><ShoppingBag size={20} /> Your orders</h2>
            <p className="section-subtitle">Track pickup orders and get live navigation directions to the shop.</p>
            {ordersQuery.isLoading && <div className="loading-center"><div className="spinner spinner-lg" /><p>Loading your orders…</p></div>}
            {ordersQuery.isError && <div className="alert alert-warning" role="alert">Could not load order history.</div>}
            {ordersQuery.data?.length === 0 && <div className="empty-state"><p>Your orders will appear here after you reserve an offer.</p></div>}
            <div className="reservations-grid">
              {ordersQuery.data?.map((order) => {
                const directions = mapsDirections(order, effectiveLocation);
                const custLabel = liveLocation
                  ? `Live GPS (${liveLocation.lat.toFixed(4)}, ${liveLocation.lng.toFixed(4)})`
                  : effectiveLocation?.address || (effectiveLocation?.coordinates ? `${effectiveLocation.coordinates[1].toFixed(4)}, ${effectiveLocation.coordinates[0].toFixed(4)}` : 'Your location');
                const shopLabel = order.shop_location?.address || order.shop_address || order.shop_name;
                return (
                  <article key={order.id} className="reservation-card">
                    <div className="reservation-header">
                      <span className="reservation-ref">{order.order_reference}</span>
                      <span className={`badge ${order.status === 'ready' ? 'badge-green' : order.status === 'confirmed' ? 'badge-blue' : order.status === 'cancelled' ? 'badge-gray' : 'badge-orange'}`}>
                        {order.status}
                      </span>
                    </div>
                    <h3 className="reservation-product">{order.product_name}</h3>
                    <p className="reservation-shop"><MapPin size={14} /> {order.shop_name}</p>
                    <div className="route-preview" style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 8, margin: '8px 0', fontSize: '0.82rem', border: '1px solid #e2e8f0' }}>
                      <div style={{ color: '#0369a1', fontWeight: 600 }}>📍 From (You): <span style={{ color: '#334155', fontWeight: 400 }}>{custLabel}</span></div>
                      <div style={{ color: '#15803d', fontWeight: 600, marginTop: 4 }}>🏪 To (Shop): <span style={{ color: '#334155', fontWeight: 400 }}>{shopLabel}</span></div>
                    </div>
                    <p className="reservation-qty">Quantity: <strong>{order.quantity} {order.unit}</strong> | Total: <strong>₹{order.total_price.toFixed(2)}</strong></p>
                    <div className="customer-actions-row">
                      {directions && (
                        <a className="btn btn-outline btn-sm" href={directions} target="_blank" rel="noreferrer">
                          <MapPin size={14} /> Navigate to shop
                        </a>
                      )}
                      {order.status === 'reserved' && (
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(order.id)}
                        >
                          Cancel order
                        </button>
                      )}
                    </div>
                    {directions && <small>Google Maps directions to the shop's saved coordinates.</small>}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
