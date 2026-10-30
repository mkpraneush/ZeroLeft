import { Link } from 'react-router-dom';
import { ArrowRight, Leaf } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './LandingPage.css';

const FEATURES = [
  {
    icon: '📍',
    title: 'Hyperlocal Deals',
    desc: 'Find surplus produce from vendors within your chosen radius — 0.5 km to 50 km.',
  },
  {
    icon: '⚡',
    title: 'Real-Time Stock',
    desc: 'Live inventory updates. No stale listings. What you see is what is actually available.',
  },
  {
    icon: '🛒',
    title: 'Reserve Instantly',
    desc: 'Reserve your items in seconds. The vendor packs your bag — you just collect.',
  },
  {
    icon: '🌱',
    title: 'Reduce Food Waste',
    desc: 'Every purchase saves fresh produce from going unsold. Good for you, great for the planet.',
  },
];

export default function LandingPage() {
  return (
    <div className="page landing-page">
      <Navbar />

      {/* Hero */}
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-bg-blobs" aria-hidden="true">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>
        <div className="container hero-content">
          <div className="hero-tag animate-fade-in">
            <Leaf size={14} />
            Fresh · Local · Affordable
          </div>
          <h1 id="hero-title" className="hero-title animate-slide-up">
            Nearby Surplus <br />
            <span className="hero-title-highlight">Fruits, Veggies &amp; Flowers</span>
            <br />
            at Unbeatable Prices
          </h1>
          <p className="hero-desc animate-slide-up">
            Street vendors have leftover fresh produce each day. ZeroLeft connects them with 
            nearby customers who get <strong>great discounts</strong> — reducing waste and saving money.
          </p>
          <div className="hero-actions animate-slide-up">
            <Link to="/offers" className="btn btn-primary btn-lg">
              Browse Offers Near Me <ArrowRight size={18} />
            </Link>
            <Link to="/register?role=vendor" className="btn btn-outline btn-lg">
              I'm a Vendor
            </Link>
          </div>
          <div className="hero-trust">
            <span className="trust-dot" />
            <span>Local shops</span>
            <span className="trust-sep">·</span>
            <span>Pay at collection</span>
            <span className="trust-sep">·</span>
            <span>Real reserved stock</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-section" aria-labelledby="how-title">
        <div className="container">
          <div className="section-header">
            <h2 id="how-title" className="section-title">How ZeroLeft Works</h2>
            <p className="section-subtitle">Three simple steps to fresh local produce</p>
          </div>
          <div className="how-grid">
            <div className="how-step">
              <div className="how-step-num">01</div>
              <div className="how-step-icon">📍</div>
              <h3>Set Your Location</h3>
              <p>Choose your location and preferred radius. We show only vendors near you.</p>
            </div>
            <div className="how-step-arrow" aria-hidden="true"><ArrowRight size={28} /></div>
            <div className="how-step">
              <div className="how-step-num">02</div>
              <div className="how-step-icon">🛒</div>
              <h3>Browse &amp; Reserve</h3>
              <p>Pick your produce, select the quantity, and reserve it with one tap.</p>
            </div>
            <div className="how-step-arrow" aria-hidden="true"><ArrowRight size={28} /></div>
            <div className="how-step">
              <div className="how-step-num">03</div>
              <div className="how-step-icon">🏃</div>
              <h3>Collect &amp; Enjoy</h3>
              <p>Head to the shop before the session ends. Your bag is packed and waiting!</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section" aria-labelledby="features-title">
        <div className="container">
          <div className="section-header">
            <h2 id="features-title" className="section-title">Why ZeroLeft?</h2>
          </div>
          <div className="grid-2 features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="cta-section" aria-labelledby="cta-title">
        <div className="container cta-content">
          <div>
            <h2 id="cta-title">Are you a street vendor?</h2>
            <p>List your surplus produce and make it discoverable to nearby customers.</p>
          </div>
          <div className="cta-actions">
            <Link to="/register?role=vendor" className="btn btn-orange btn-lg">
              Start Selling Free <ArrowRight size={18} />
            </Link>
            <Link to="/register?role=customer" className="btn btn-outline btn-lg" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>
              Browse as Customer
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
