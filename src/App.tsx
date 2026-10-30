import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CustomerDashboard from './pages/CustomerDashboard';
import VendorDashboard from './pages/VendorDashboard';
import AddProductPage from './pages/AddProductPage';
import OfferPage from './pages/OfferPage';
import VendorProfilePage from './pages/VendorProfilePage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import { useAuthStore } from './store/authStore';

// Protected Route helper
function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: 'customer' | 'vendor' }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to={user?.role === 'vendor' ? '/vendor/dashboard' : '/customer/dashboard'} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Customer Routes */}
      <Route
        path="/customer/dashboard"
        element={
          <ProtectedRoute requiredRole="customer">
            <CustomerDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/offers" element={<ProtectedRoute requiredRole="customer"><CustomerDashboard /></ProtectedRoute>} />
      <Route path="/offer/:productId" element={<ProtectedRoute><OfferPage /></ProtectedRoute>} />
      <Route path="/customer/profile" element={<ProtectedRoute requiredRole="customer"><CustomerProfilePage /></ProtectedRoute>} />

      {/* Vendor Routes */}
      <Route
        path="/vendor/dashboard"
        element={
          <ProtectedRoute requiredRole="vendor">
            <VendorDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendor/add-product"
        element={
          <ProtectedRoute requiredRole="vendor">
            <AddProductPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendor/edit-product/:productId"
        element={
          <ProtectedRoute requiredRole="vendor">
            <AddProductPage />
          </ProtectedRoute>
        }
      />
      <Route path="/vendor/profile" element={<ProtectedRoute requiredRole="vendor"><VendorProfilePage /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
