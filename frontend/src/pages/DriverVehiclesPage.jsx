import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import RatingBadge from '../components/RatingBadge';
import NotificationDropdown from '../components/NotificationDropdown';
import './Dashboard.css';

function DriverVehiclesPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    vehicles, vehiclesLoading, fetchVehicles,
    activateVehicle, deactivateVehicle,
    userRating, error,
  } = useDriver();

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>My Vehicles</h2>
        </div>
        <div className="nav-user">
          <NotificationDropdown />
          <RatingBadge ratingAvg={userRating.rating_avg} ratingCount={userRating.rating_count} />
          <span>Hi, {user?.name || 'Driver'}</span>
          <button className="card-button secondary" onClick={() => navigate('/driver/dashboard')} style={{ marginRight: 8 }}>
            ← Dashboard
          </button>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content" style={{ padding: '32px 40px', maxWidth: 700 }}>
        <div className="dashboard-header">
          <div>
            <h1>Vehicle Management</h1>
            <p>Activate a vehicle to start accepting rides</p>
          </div>
        </div>

        {error && <div className="uber-panel-alert">{error}</div>}

        {vehiclesLoading ? (
          <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading vehicles...</p>
        ) : vehicles.length === 0 ? (
          <div className="empty-state">
            <h3>No vehicles yet</h3>
            <p>Upload a vehicle registration document to add a vehicle.</p>
            <button
              className="card-button"
              style={{ marginTop: 12 }}
              onClick={() => navigate('/driver/documents')}
            >
              Go to Documents
            </button>
          </div>
        ) : (
          <div className="vehicle-list">
            {vehicles.map((v) => (
              <div key={v.vehicle_id} className={`vehicle-card${v.is_active ? ' active-vehicle' : ''}`}>
                <div className="vehicle-card-header">
                  <h4>{v.model}</h4>
                  <span className={`status-pill ${v.is_active ? 'valid' : ''}`}>
                    {v.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="vehicle-card-body">
                  <p><span>Type:</span> {v.type_label || v.type}</p>
                  <p><span>Plate:</span> {v.plate_number}</p>
                  {v.fare_multiplier && (
                    <p><span>Fare:</span> {v.fare_multiplier}x multiplier</p>
                  )}
                </div>
                <div className="vehicle-card-actions">
                  {v.is_active ? (
                    <button onClick={() => deactivateVehicle(v.vehicle_id)}
                            className="vehicle-deactivate-btn">
                      Deactivate
                    </button>
                  ) : (
                    <button onClick={() => activateVehicle(v.vehicle_id)}
                            className="vehicle-activate-btn">
                      Set as Active
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DriverVehiclesPage;
