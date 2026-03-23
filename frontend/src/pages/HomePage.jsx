import { useNavigate } from 'react-router-dom';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="homepage">
      {/* ── Navbar ── */}
      <nav className="homepage-nav">
        <div className="homepage-nav-brand">RideShare</div>
        <div className="homepage-nav-links">
          <button className="homepage-nav-link" onClick={() => navigate('/login')}>
            Ride
          </button>
          <button className="homepage-nav-link" onClick={() => navigate('/login')}>
            Earn
          </button>
          <button className="homepage-nav-link inert">
            About
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="homepage-hero">
        <h1>Your ride, on demand</h1>
        <p>
          Request a ride, get matched with a nearby driver, and reach your
          destination — all in minutes.
        </p>
        <button className="homepage-cta-btn" onClick={() => navigate('/login')}>
          Get Started
        </button>
      </section>

      {/* ── How It Works ── */}
      <section className="homepage-steps">
        <div className="homepage-steps-header">
          <h2>How it works</h2>
        </div>
        <div className="homepage-steps-grid">
          <div className="homepage-step">
            <div className="homepage-step-number">1</div>
            <h3>Request</h3>
            <p>Enter your pickup and destination. Get an instant fare estimate and confirm your ride.</p>
          </div>
          <div className="homepage-step">
            <div className="homepage-step-number">2</div>
            <h3>Get Matched</h3>
            <p>A nearby driver accepts your request and heads to your pickup location.</p>
          </div>
          <div className="homepage-step">
            <div className="homepage-step-number">3</div>
            <h3>Ride</h3>
            <p>Track your driver in real time, hop in, and enjoy the ride to your destination.</p>
          </div>
        </div>
      </section>

      {/* ── Driver CTA ── */}
      <section className="homepage-driver">
        <h2>Drive with RideShare</h2>
        <p>
          Set your own schedule, earn on your terms, and be your own boss.
          Sign up to start driving today.
        </p>
        <button className="homepage-driver-btn" onClick={() => navigate('/login')}>
          Start Earning
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="homepage-footer">
        <div className="homepage-footer-brand">RideShare</div>
        <p>Move the way you want.</p>
      </footer>
    </div>
  );
}
