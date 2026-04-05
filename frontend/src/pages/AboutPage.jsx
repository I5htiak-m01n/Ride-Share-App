import { useNavigate } from 'react-router-dom';
import './AboutPage.css';
import './Auth.css';

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="about-page">
      {/* ── Navbar (same as HomePage) ── */}
      <nav className="homepage-nav">
        <div className="homepage-nav-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          RideShare
        </div>
        <div className="homepage-nav-links">
          <button className="homepage-nav-link" onClick={() => navigate('/login')}>
            Ride
          </button>
          <button className="homepage-nav-link" onClick={() => navigate('/login')}>
            Earn
          </button>
          <button className="homepage-nav-link about-active" onClick={() => navigate('/about')}>
            About
          </button>
        </div>
      </nav>

      {/* ── Back Button (fixed, just below navbar) ── */}
      <button className="auth-back-btn about-back-btn" onClick={() => navigate('/')}>
        &larr; Back
      </button>

      {/* ── Content ── */}
      <section className="about-content">
        <h1 className="about-title">RideShare</h1>

        <div className="about-body">
          <p>
            RideShare is a full-stack ride-hailing platform built as a Database
            Management project (CSE216) at Independent University, Bangladesh,
            under the supervision of <strong>Asib Rahman</strong> sir.
          </p>
          <p>
            The platform connects riders with nearby drivers in real time,
            handling everything from ride requests and fare estimation to
            in-ride chat, mutual cancellations, wallet payments, promo codes,
            and driver onboarding — all backed by a PostgreSQL database with
            custom triggers, stored procedures, and functions.
          </p>
          <p>
            Designed and developed by{' '}
            <strong>Md. Ishtiak Moin</strong> and{' '}
            <strong>Abhijnan Podder</strong>.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="homepage-footer">
        <div className="homepage-footer-brand">RideShare</div>
        <p>Move the way you want.</p>
      </footer>
    </div>
  );
}
