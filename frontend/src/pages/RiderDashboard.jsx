import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

function RiderDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>🚗 RideShare</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'Rider'}</span>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="dashboard-header">
          <h1>Rider Dashboard</h1>
          <p>Welcome back! Where would you like to go?</p>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card primary-card">
            <div className="card-icon">📍</div>
            <h3>Request a Ride</h3>
            <p>Find nearby drivers and book your ride in seconds</p>
            <button className="card-button">Book Now</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">📜</div>
            <h3>Ride History</h3>
            <p>View all your past rides and receipts</p>
            <button className="card-button secondary">View History</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">💳</div>
            <h3>My Wallet</h3>
            <p>Balance: {user?.wallet?.balance || '0.00'} {user?.wallet?.currency || 'BDT'}</p>
            <button className="card-button secondary">Add Money</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">⭐</div>
            <h3>Saved Addresses</h3>
            <p>Manage your favorite locations</p>
            <button className="card-button secondary">Manage</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">🎟️</div>
            <h3>Promo Codes</h3>
            <p>Available discounts and offers</p>
            <button className="card-button secondary">View Promos</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">👤</div>
            <h3>Profile Settings</h3>
            <p>Update your account information</p>
            <button className="card-button secondary">Edit Profile</button>
          </div>
        </div>

        <div className="quick-stats">
          <div className="stat-card">
            <div className="stat-number">0</div>
            <div className="stat-label">Total Rides</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">0 BDT</div>
            <div className="stat-label">Total Spent</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">5.0 ⭐</div>
            <div className="stat-label">Your Rating</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RiderDashboard;
