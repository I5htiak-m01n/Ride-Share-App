import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ridesAPI } from '../api/client';
import NavBar from '../components/NavBar';
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

  // Detail view
  const [selectedRideId, setSelectedRideId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const openDetail = async (rideId) => {
    setSelectedRideId(rideId);
    setDetailLoading(true);
    setError(null);
    try {
      const res = await ridesAPI.getRideDetail(rideId);
      setDetail(res.data);
    } catch {
      setError('Failed to load ride details');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedRideId(null);
    setDetail(null);
  };

  const goBack = () => navigate(isDriver ? '/driver/dashboard' : '/rider/dashboard');

  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const fmtTime = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const fmtStatus = (s) => (s || '').replace(/_/g, ' ');

  /* ── Detail View ─────────────────────────────────────── */
  const renderDetail = () => {
    if (!detail) return null;
    const r = detail.ride;
    const msgs = detail.messages || [];
    const ratings = detail.ratings || [];

    return (
      <div className="ride-detail-panel">
        <button className="page-back-btn" onClick={closeDetail} style={{ marginBottom: 20 }}>&larr; Back to list</button>

        {/* Ride Summary */}
        <div className="ride-detail-section">
          <h2 style={{ margin: '0 0 16px' }}>Ride Details</h2>
          <span className="history-status" style={{
            background: `${STATUS_COLORS[r.status] || '#6B6B6B'}18`,
            color: STATUS_COLORS[r.status] || '#6B6B6B',
            marginBottom: 16, display: 'inline-block',
          }}>{fmtStatus(r.status)}</span>

          <div className="ride-detail-route">
            <div className="history-addr">
              <span className="history-dot pickup" />
              <span>{r.pickup_addr || 'Unknown pickup'}</span>
            </div>
            <div className="history-addr">
              <span className="history-dot dropoff" />
              <span>{r.dropoff_addr || 'Unknown dropoff'}</span>
            </div>
          </div>

          <div className="ride-detail-info-grid">
            <div><span>Started</span><strong>{fmtDate(r.started_at)}</strong></div>
            <div><span>Completed</span><strong>{fmtDate(r.completed_at)}</strong></div>
            <div><span>Distance</span><strong>{r.estimated_distance_km ? `${r.estimated_distance_km} km` : '—'}</strong></div>
            <div><span>Fare</span><strong>{r.final_fare || r.estimated_fare || '—'} BDT</strong></div>
            {isDriver && r.driver_earning && <div><span>Your Earnings</span><strong>{r.driver_earning} BDT</strong></div>}
            {isDriver && r.platform_fee && <div><span>Platform Fee</span><strong>{r.platform_fee} BDT</strong></div>}
          </div>
        </div>

        {/* Counterpart Info */}
        <div className="ride-detail-section">
          <h3>{isDriver ? 'Rider Info' : 'Driver Info'}</h3>
          <div className="ride-detail-info-grid">
            <div><span>Name</span><strong>{isDriver ? r.rider_name : r.driver_name}</strong></div>
            {!isDriver && r.driver_phone && <div><span>Phone</span><strong>{r.driver_phone}</strong></div>}
            {!isDriver && r.vehicle_model && <div><span>Vehicle</span><strong>{r.vehicle_model}</strong></div>}
            {!isDriver && r.vehicle_plate && <div><span>Plate</span><strong>{r.vehicle_plate}</strong></div>}
            {!isDriver && r.driver_rating && <div><span>Rating</span><strong>{r.driver_rating}/5</strong></div>}
          </div>
        </div>

        {/* Ratings */}
        {ratings.length > 0 && (
          <div className="ride-detail-section">
            <h3>Ratings</h3>
            {ratings.map(rt => (
              <div key={rt.rating_id} className="ride-detail-rating-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{rt.rater_name}</strong>
                  <span className="ride-detail-score">{'★'.repeat(rt.score)}{'☆'.repeat(5 - rt.score)}</span>
                </div>
                {rt.comment && <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--uber-gray-50)' }}>{rt.comment}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Chat History */}
        <div className="ride-detail-section">
          <h3>Chat History</h3>
          {msgs.length === 0 ? (
            <p style={{ color: 'var(--uber-gray-50)', fontSize: 13 }}>No messages during this ride.</p>
          ) : (
            <div className="ride-detail-chat">
              {msgs.map(m => (
                <div key={m.message_id} className={`ride-detail-chat-msg ${m.sender_id === user.user_id ? 'own' : 'other'}`}>
                  <div className="ride-detail-chat-bubble">
                    <p>{m.content}</p>
                    <span className="ride-detail-chat-meta">{m.sender_name} &middot; {fmtTime(m.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="ride-detail-actions">
          <button className="admin-btn reject" onClick={() => navigate(`/complaints?ride=${r.ride_id}`)}>
            File Complaint
          </button>
        </div>
      </div>
    );
  };

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="dashboard-container">
      <NavBar brandText={isDriver ? 'RideShare Driver' : 'RideShare'} />

      <div className="dashboard-content">
        {!selectedRideId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <button className="page-back-btn" onClick={goBack}>
              &larr; Back
            </button>
            <h1 style={{ margin: 0, fontSize: 28 }}>Ride History</h1>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        {/* Detail view */}
        {selectedRideId && (detailLoading
          ? <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading ride details...</p>
          : renderDetail()
        )}

        {/* List view */}
        {!selectedRideId && (
          loading ? (
            <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading ride history...</p>
          ) : rides.length === 0 ? (
            <div className="empty-state">
              <h3>No rides yet</h3>
              <p>{isDriver ? 'Your completed trips will appear here.' : 'Your past rides will appear here once you take your first trip.'}</p>
            </div>
          ) : (
            <div className="history-list">
              {rides.map(ride => (
                <div key={ride.ride_id} className="history-item" style={{ cursor: 'pointer' }} onClick={() => openDetail(ride.ride_id)}>
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
                      <span className="history-date">{fmtDate(ride.completed_at || ride.started_at)}</span>
                      <span className="history-status" style={{
                        background: `${STATUS_COLORS[ride.status] || '#6B6B6B'}18`,
                        color: STATUS_COLORS[ride.status] || '#6B6B6B',
                      }}>{fmtStatus(ride.status)}</span>
                    </div>
                  </div>
                  <div className="history-item-details">
                    <div className="history-detail">
                      <span>{isDriver ? 'Rider' : 'Driver'}</span>
                      <strong>{isDriver ? ride.rider_name : ride.driver_name}</strong>
                    </div>
                    {!isDriver && ride.vehicle_model && (
                      <div className="history-detail">
                        <span>Vehicle</span>
                        <strong>{ride.vehicle_model}</strong>
                      </div>
                    )}
                    <div className="history-detail">
                      <span>Distance</span>
                      <strong>{ride.estimated_distance_km ? `${ride.estimated_distance_km} km` : '—'}</strong>
                    </div>
                    <div className="history-detail fare">
                      <span>Fare</span>
                      <strong>{ride.final_fare || ride.estimated_fare || '—'} BDT</strong>
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
          )
        )}
      </div>
    </div>
  );
}

export default RideHistory;
