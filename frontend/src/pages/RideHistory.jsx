import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ridesAPI } from '../api/client';
import './Dashboard.css';

const STATUS_COLORS = {
  completed: '#05944F',
  started: '#276EF1',
  driver_assigned: '#276EF1',
  arrived: '#276EF1',
  cancelled: '#E11900',
};

function RideHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDriver = user?.role === 'driver';

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = isDriver
          ? await ridesAPI.getDriverHistory()
          : await ridesAPI.getRiderHistory();
        setRides(res.data.rides || []);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load ride history');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [isDriver]);

  const goBack = () => {
    navigate(isDriver ? '/driver/dashboard' : '/rider/dashboard');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatStatus = (status) => {
    return (status || '').replace(/_/g, ' ');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>{isDriver ? 'RideShare Driver' : 'RideShare'}</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'User'}</span>
          <button onClick={goBack} className="logout-btn">Back</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="dashboard-header">
          <div>
            <h1>Ride History</h1>
            <p>{isDriver ? 'Your completed trips and earnings' : 'Your past rides'}</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <p style={{ color: '#6B6B6B', textAlign: 'center', padding: '40px' }}>
            Loading ride history...
          </p>
        ) : rides.length === 0 ? (
          <div className="empty-state">
            <h3>No rides yet</h3>
            <p>{isDriver ? 'Your completed trips will appear here.' : 'Your past rides will appear here once you take your first trip.'}</p>
          </div>
        ) : (
          <div className="history-list">
            {rides.map((ride) => (
              <div key={ride.ride_id} className="history-item">
                <div className="history-item-main">
                  <div className="history-route">
                    <div className="history-addr">
                      <span className="history-dot pickup" />
                      <span>{ride.pickup_addr || 'Unknown pickup'}</span>
                    </div>
                    <div className="history-addr">
                      <span className="history-dot dropoff" />
                      <span>{ride.dropoff_addr || 'Unknown dropoff'}</span>
                    </div>
                  </div>
                  <div className="history-meta">
                    <span className="history-date">
                      {formatDate(ride.completed_at || ride.started_at)}
                    </span>
                    <span
                      className="history-status"
                      style={{
                        background: `${STATUS_COLORS[ride.status] || '#6B6B6B'}18`,
                        color: STATUS_COLORS[ride.status] || '#6B6B6B',
                      }}
                    >
                      {formatStatus(ride.status)}
                    </span>
                  </div>
                </div>
                <div className="history-item-details">
                  <div className="history-detail">
                    <span>{isDriver ? 'Rider' : 'Driver'}</span>
                    <strong>{isDriver ? ride.rider_name : ride.driver_name}</strong>
                  </div>
                  <div className="history-detail">
                    <span>Distance</span>
                    <strong>{ride.estimated_distance_km ? `${ride.estimated_distance_km} km` : '-'}</strong>
                  </div>
                  <div className="history-detail fare">
                    <span>Fare</span>
                    <strong>{ride.final_fare || ride.estimated_fare || '-'} BDT</strong>
                  </div>
                  {isDriver && ride.driver_earning && (
                    <div className="history-detail">
                      <span>Earnings</span>
                      <strong>{ride.driver_earning} BDT</strong>
                    </div>
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

export default RideHistory;
