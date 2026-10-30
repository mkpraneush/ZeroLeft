import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ShoppingBag, Store, LogOut, Menu, X, User, LayoutDashboard } from 'lucide-react';
import './Navbar.css';

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
    setMenuOpen(false);
  };

  const dashboardPath = user?.role === 'vendor' ? '/vendor/dashboard' : '/customer/dashboard';

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar-inner container">
        {/* Logo */}
        <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>
          <img src="/assets/logo.png" alt="ZeroLeft" className="navbar-logo-img" style={{ height: '38px', width: 'auto', objectFit: 'contain' }} />
        </Link>

        {/* Desktop Nav */}
        <div className="navbar-links">
          <Link to="/offers" className={`nav-link ${location.pathname === '/offers' ? 'active' : ''}`}>
            Browse Offers
          </Link>
          {!isAuthenticated && (
            <>
              <Link to="/login" className="nav-link">Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Get Started
              </Link>
            </>
          )}
          {isAuthenticated && (
            <>
              <Link to={dashboardPath} className="nav-link">
                <LayoutDashboard size={16} /> Dashboard
              </Link>
              <div className="nav-user-menu">
                <button className="nav-avatar" aria-label="User menu">
                  <User size={18} />
                  <span>{user?.full_name?.split(' ')[0]}</span>
                </button>
                <div className="nav-dropdown">
                  <div className="nav-dropdown-header">
                    <span className="nav-dropdown-name">{user?.full_name}</span>
                    <span className={`badge badge-${user?.role === 'vendor' ? 'orange' : 'green'}`}>
                      {user?.role === 'vendor' ? <><Store size={10} /> Vendor</> : <><ShoppingBag size={10} /> Customer</>}
                    </span>
                  </div>
                  <Link to={dashboardPath} className="nav-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <LayoutDashboard size={15} /> Dashboard
                  </Link>
                  <Link to={user?.role === 'vendor' ? '/vendor/profile' : '/customer/profile'} className="nav-dropdown-item">
                    <User size={15} /> My Profile
                  </Link>
                  <div className="nav-dropdown-divider" />
                  <button className="nav-dropdown-item danger" onClick={handleLogout}>
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          className="navbar-hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="navbar-mobile animate-fade-in">
          <Link to="/offers" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
            Browse Offers
          </Link>
          {!isAuthenticated ? (
            <>
              <Link to="/login" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>Login</Link>
              <Link to="/register" className="mobile-nav-link highlight" onClick={() => setMenuOpen(false)}>
                Get Started Free
              </Link>
            </>
          ) : (
            <>
              <Link to={dashboardPath} className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
                Dashboard
              </Link>
              <Link to={user?.role === 'vendor' ? '/vendor/profile' : '/customer/profile'} className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
                My Profile
              </Link>
              <button className="mobile-nav-link danger" onClick={handleLogout}>
                Sign Out
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
