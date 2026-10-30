import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const defaultBackendUrl = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : 'http://localhost:8000';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || defaultBackendUrl,
  timeout: 15000,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default api;
