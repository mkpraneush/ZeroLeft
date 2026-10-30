import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Navbar from '../components/Navbar';
import type { CustomerProfile } from '../types';

const CATEGORIES = ['vegetables', 'fruits', 'flowers', 'other'];

export default function CustomerProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileQuery = useQuery<CustomerProfile>({
    queryKey: ['customer-profile'],
    queryFn: () => api.get('/customer/profile').then((response) => response.data),
  });
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(5);
  const [categories, setCategories] = useState<string[]>([]);
  const [emailNotifications, setEmailNotifications] = useState(true);

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setLongitude(profile.preferred_location?.coordinates?.[0]?.toString() || '');
    setLatitude(profile.preferred_location?.coordinates?.[1]?.toString() || '');
    setAddress(profile.preferred_location?.address || '');
    setRadius(profile.preferences.search_radius_km);
    setCategories(profile.preferences.preferred_categories);
    setEmailNotifications(profile.preferences.email_notifications);
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const lng = Number(longitude);
      const lat = Number(latitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error('Enter valid longitude (-180 to 180) and latitude (-90 to 90).');
      }
      return api.put('/customer/profile', {
        preferred_location: {
          type: 'Point',
          coordinates: [lng, lat],
          address: address.trim() || undefined,
        },
        preferences: {
          search_radius_km: radius,
          preferred_categories: categories,
          email_notifications: emailNotifications,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['nearby-products'] });
      toast.success('Location and preferences saved.');
      navigate('/customer/dashboard');
    },
    onError: (error: { response?: { data?: { detail?: string } }; message?: string }) => {
      toast.error(error.response?.data?.detail || error.message || 'Could not save your preferences.');
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
            toast.error('Could not detect location. Enter coordinates manually.');
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
          <h1 className="section-title">Your location &amp; preferences</h1>
          <p className="section-subtitle">Nearby offers and email alerts use this saved location and radius.</p>
          {profileQuery.isLoading && <div className="loading-center"><div className="spinner spinner-lg" /><p>Loading your profile…</p></div>}
          {profileQuery.isError && <div className="alert alert-warning">Could not load your profile. Retry the page.</div>}
          {profileQuery.data && (
            <form
              className="card card-body"
              onSubmit={(event) => {
                event.preventDefault();
                saveMutation.mutate();
              }}
            >
              <h2 className="form-section-title"><MapPin size={18} /> Choose your location</h2>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => useCurrentLocation(false)}>Use my current location</button>
              <div className="form-row" style={{ marginTop: 16 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="customer-lng">Longitude</label>
                  <input id="customer-lng" className="form-input" type="number" step="any" min="-180" max="180" required value={longitude} onChange={(event) => setLongitude(event.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="customer-lat">Latitude</label>
                  <input id="customer-lat" className="form-input" type="number" step="any" min="-90" max="90" required value={latitude} onChange={(event) => setLatitude(event.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="customer-address">Location label (optional)</label>
                <input id="customer-address" className="form-input" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Neighborhood or address" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="customer-radius">Preferred distance: {radius} km</label>
                <input id="customer-radius" className="form-input" type="range" min="0.5" max="50" step="0.5" value={radius} onChange={(event) => setRadius(Number(event.target.value))} />
              </div>
              <fieldset className="form-group" style={{ border: 0, padding: 0 }}>
                <legend className="form-label">Preferred categories (leave all unchecked for all categories)</legend>
                <div className="category-chips-row">
                  {CATEGORIES.map((category) => (
                    <label className="category-chip" key={category}>
                      <input
                        type="checkbox"
                        checked={categories.includes(category)}
                        onChange={(event) => setCategories((current) => event.target.checked
                          ? [...current, category]
                          : current.filter((value) => value !== category))}
                      />
                      {category}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={emailNotifications} onChange={(event) => setEmailNotifications(event.target.checked)} />
                Email me eligible nearby offers
              </label>
              <p className="section-subtitle">Offer emails are sent only to verified customers who opt in and match the product category and distance.</p>
              <div className="customer-actions-row">
                <Link to="/customer/dashboard" className="btn btn-outline">Cancel</Link>
                <button className="btn btn-primary" type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Save preferences'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
