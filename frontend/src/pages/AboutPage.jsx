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
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat.
          </p>
          <p>
            Duis aute irure dolor in reprehenderit in voluptate velit esse
            cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
            cupidatat non proident, sunt in culpa qui officia deserunt mollit
            anim id est laborum.
          </p>
          <p>
            Curabitur pretium tincidunt lacus. Nulla gravida orci a odio.
            Nullam varius, turpis et commodo pharetra, est eros bibendum elit,
            nec luctus magna felis sollicitudin mauris. Integer in mauris eu
            nibh euismod gravida.
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
