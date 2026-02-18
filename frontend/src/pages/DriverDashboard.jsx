import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

function DriverDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleOnline = () => {
    setIsOnline(!isOnline);
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>🚗 RideShare Driver</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'Driver'}</span>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="dashboard-header">
          <h1>Driver Dashboard</h1>
          <div className="driver-status">
            <button
              onClick={toggleOnline}
              className={`status-toggle ${isOnline ? 'online' : 'offline'}`}
            >
              {isOnline ? '🟢 You\'re Online' : '🔴 You\'re Offline'}
            </button>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card primary-card">
            <div className="card-icon">🚘</div>
            <h3>Ride Requests</h3>
            <p>View and accept nearby ride requests</p>
            <button className="card-button" disabled={!isOnline}>
              {isOnline ? 'View Requests' : 'Go Online First'}
            </button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">🗺️</div>
            <h3>Active Ride</h3>
            <p>Currently no active ride</p>
            <button className="card-button secondary" disabled>
              Start Navigation
            </button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">💰</div>
            <h3>Earnings</h3>
            <p>Today: 0 BDT | Total: 0 BDT</p>
            <button className="card-button secondary">View Earnings</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">🚙</div>
            <h3>My Vehicles</h3>
            <p>Manage your registered vehicles</p>
            <button className="card-button secondary">Manage Vehicles</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">📄</div>
            <h3>Documents</h3>
            <p>Upload and verify your documents</p>
            <button className="card-button secondary">Upload Docs</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">📊</div>
            <h3>Performance</h3>
            <p>View your ratings and statistics</p>
            <button className="card-button secondary">View Stats</button>
          </div>
        </div>

        <div className="quick-stats">
          <div className="stat-card">
            <div className="stat-number">0</div>
            <div className="stat-label">Rides Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">0 BDT</div>
            <div className="stat-label">Total Earned</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">5.0 ⭐</div>
            <div className="stat-label">Driver Rating</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">0%</div>
            <div className="stat-label">Acceptance Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DriverDashboard;
