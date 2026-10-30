import { Link } from 'react-router-dom';
import { Leaf, Globe, Share2, Mail } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <div className="footer-logo">
            <img src="/assets/logo.png" alt="ZeroLeft" className="footer-logo-img" style={{ height: '42px', width: 'auto', objectFit: 'contain' }} />
          </div>
          <p className="footer-tagline">
            Fresh surplus produce — rescued before it's gone.
          </p>
          <div className="footer-social">
            <a href="#" aria-label="Website" className="social-link"><Globe size={18} /></a>
            <a href="#" aria-label="Share" className="social-link"><Share2 size={18} /></a>
            <a href="mailto:hello@zeroleft.in" aria-label="Email" className="social-link"><Mail size={18} /></a>
          </div>
        </div>

        <div className="footer-links-group">
          <h4>Marketplace</h4>
          <Link to="/offers">Browse Offers</Link>
          <Link to="/register?role=vendor">Sell on ZeroLeft</Link>
          <Link to="/register?role=customer">Sign Up Free</Link>
        </div>

        <div className="footer-links-group">
          <h4>Help</h4>
          <a href="#">How it Works</a>
          <a href="#">FAQs</a>
          <a href="#">Contact Us</a>
        </div>

        <div className="footer-links-group">
          <h4>Legal</h4>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Cookie Policy</a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container">
          <span>© 2026 ZeroLeft. Made with <Leaf size={13} className="leaf-icon" /> for fresh food</span>
          <span>Serving Erode &amp; beyond 🇮🇳</span>
        </div>
      </div>
    </footer>
  );
}
