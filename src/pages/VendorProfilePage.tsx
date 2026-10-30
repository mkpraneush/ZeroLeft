import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Navbar from '../components/Navbar';

type VendorProfile = {
  shop_name: string;
  shop_address: string;
  shop_hours: { open_time: string; close_time: string; timezone: string };
  location?: { coordinates: [number, number]; address?: string } | null;
};

export default function VendorProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileQuery = useQuery<VendorProfile>({
    queryKey: ['vendor-profile'],
    queryFn: () => api.get('/vendor/profile').then((response) => response.data),
  });
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('21:00');

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setShopName(profile.shop_name || '');
    setAddress(profile.shop_address || '');
    setOpenTime(profile.shop_hours?.open_time || '09:00');
    setCloseTime(profile.shop_hours?.close_time || '21:00');
    setLongitude(profile.location?.coordinates?.[0]?.toString() || '');
    setLatitude(profile.location?.coordinates?.[1]?.toString() || '');
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const lng = Number(longitude);
      const lat = Number(latitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error('Enter valid longitude (-180 to 180) and latitude (-90 to 90).');
      }
      await api.put('/vendor/profile', {
        shop_name: shopName.trim(),
        shop_address: address.trim(),
        shop_hours: { open_time: openTime, close_time: closeTime, timezone: 'Asia/Kolkata' },
      });
      await api.put('/vendor/location', {
        type: 'Point',
        coordinates: [lng, lat],
        address: address.trim(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['vendor-dashboard'] });
      toast.success('Shop profile and coordinates saved.');
      navigate('/vendor/dashboard');
    },
    onError: (error: { response?: { data?: { detail?: string } }; message?: string }) => {
      toast.error(error.response?.data?.detail || error.message || 'Could not save your shop profile.');
    },
  });

  const fetchIPLocation = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          setLatitude(Number(data.latitude).toFixed(6));
          setLongitude(Number(data.longitude).toFixed(6));
          if (!address && (data.city || data.region)) {
            setAddress([data.city, data.region, data.country_name].filter(Boolean).join(', '));
          }
          toast.success('Location detected automatically.');
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  };

  const useCurrentLocation = (silent: boolean = false) => {
    if (!navigator.geolocation) {
      if (!silent) toast.error('This browser does not support location access.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        if (!silent) toast.success('Location updated from device GPS.');
      },
      async (err) => {
        // Fallback to IP-based location automatically
        const ipOk = await fetchIPLocation();
        if (!ipOk && !silent) {
          if (err.code === 1) {
            toast.error('Location permission was denied in your browser settings. Please allow location in the address bar or enter coordinates.');
          } else if (err.code === 3) {
            toast.error('Location request timed out. Trying automatic approximation...');
          } else {
            toast.error('Could not detect location. Enter your shop coordinates manually.');
          }
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  // Automatically request/update location when profile loads if coordinates are not set
  useEffect(() => {
    if (profileQuery.data && !latitude && !longitude) {
      useCurrentLocation(true);
    }
  }, [profileQuery.data]);

  return (
    <div className="page">
      <Navbar />
      <main className="page-content">
        <div className="container" style={{ maxWidth: 760 }}>
          <h1 className="section-title">Shop profile &amp; location</h1>
          <p className="section-subtitle">Customers use these saved coordinates for nearby matching and Google Maps directions.</p>
          {profileQuery.isLoading && <div className="loading-center"><div className="spinner spinner-lg" /><p>Loading shop profile…</p></div>}
          {profileQuery.isError && <div className="alert alert-warning">Could not load your profile. Retry the page.</div>}
          {profileQuery.data && (
            <form
              className="card card-body"
              onSubmit={(event) => {
                event.preventDefault();
                saveMutation.mutate();
              }}
            >
              <div className="form-group">
                <label className="form-label" htmlFor="shop-name">Shop name</label>
                <input id="shop-name" className="form-input" required minLength={2} value={shopName} onChange={(event) => setShopName(event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="shop-address">Shop address</label>
                <input id="shop-address" className="form-input" required minLength={4} value={address} onChange={(event) => setAddress(event.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="shop-open">Opens</label>
                  <input id="shop-open" className="form-input" type="time" required value={openTime} onChange={(event) => setOpenTime(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="shop-close">Closes</label>
                  <input id="shop-close" className="form-input" type="time" required value={closeTime} onChange={(event) => setCloseTime(event.target.value)} />
                </div>
              </div>
              <h2 className="form-section-title"><MapPin size={18} /> Exact shop coordinates</h2>
              <p className="section-subtitle">Use the shop’s location, not your current location if you are elsewhere.</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => useCurrentLocation(false)}>Use this device’s location</button>
              <div className="form-row" style={{ marginTop: 16 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="shop-lng">Longitude</label>
                  <input id="shop-lng" className="form-input" type="number" step="any" min="-180" max="180" required value={longitude} onChange={(event) => setLongitude(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="shop-lat">Latitude</label>
                  <input id="shop-lat" className="form-input" type="number" step="any" min="-90" max="90" required value={latitude} onChange={(event) => setLatitude(event.target.value)} />
                </div>
              </div>
              <div className="alert alert-info">Coordinates are stored as [longitude, latitude]. Google Maps directions are provided; live tracking is not enabled.</div>
              <div className="customer-actions-row">
                <Link to="/vendor/dashboard" className="btn btn-outline">Cancel</Link>
                <button className="btn btn-primary" type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Save shop profile'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
