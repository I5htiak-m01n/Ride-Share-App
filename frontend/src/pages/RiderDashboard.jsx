import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import BookingMap from '../components/BookingMap';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function RiderDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    ridePhase,
    walletBalance, statusMessage, setStatusMessage, userLocation, nearbyVehicles,
    stopPolling, userRating,
    scheduledRides, handleCancelScheduledRide, scheduleSuccess, setScheduleSuccess,
    activeRequest, activeRide,
  } = useRide();

  // If we're in a booking/confirming phase, redirect to the correct page.
  // For searching/matched/in_progress, let the user stay on dashboard and see
  // the ongoing ride card instead of force-redirecting.
  useEffect(() => {
    if (ridePhase === 'booking') {
      navigate('/rider/book', { replace: true });
    } else if (ridePhase === 'confirming') {
      navigate('/rider/confirm', { replace: true });
    }
  }, [ridePhase, navigate]);

  const handleLogout = async () => {
    stopPolling();
    await logout();
    navigate('/login');
  };

  const startBooking = () => {
    navigate('/rider/book');
  };

  return (
    <div className="dashboard-container">
      <NavBar
        showNotifications
        ratingAvg={userRating.rating_avg}
        ratingCount={userRating.rating_count}
        onLogout={handleLogout}
      />

      {/* === IDLE — Split layout === */}
      <div className="uber-split-layout">
        <div className="uber-left-panel">
          <div className="uber-greeting">
            <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name || 'Rider'}</h1>
            <p>Where would you like to go?</p>
          </div>

          {walletBalance !== null && (
            <div className="wallet-balance-display">
              <span>Wallet Balance</span>
              <strong>{walletBalance.toFixed(2)} BDT</strong>
            </div>
          )}

          {statusMessage && (
            <div className="uber-panel-info">
              {statusMessage}
              <button onClick={() => setStatusMessage(null)} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'inherit' }}>
                Dismiss
              </button>
            </div>
          )}

          {scheduleSuccess && (
            <div className="info-banner" style={{ marginBottom: 16 }}>
              {scheduleSuccess}
              <button onClick={() => setScheduleSuccess(null)} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Dismiss
              </button>
            </div>
          )}

          <div className="uber-where-to-bar" onClick={startBooking}>
            <div className="search-dot" />
            <span>Where to?</span>
          </div>

          {ridePhase === 'searching' && activeRequest && (
            <div className="ongoing-ride-section">
              <h3>Ongoing Ride Request</h3>
              <div
                className="ongoing-ride-card"
                onClick={() => navigate('/rider/searching')}
              >
                <div className="ongoing-ride-status">
                  <div className="pulse-dot" />
                  <span>Searching for driver...</span>
                </div>
                <div className="ongoing-ride-route">
                  <span>{activeRequest.pickup_addr}</span>
                  <span className="route-arrow">&rarr;</span>
                  <span>{activeRequest.dropoff_addr}</span>
                </div>
                <div className="ongoing-ride-meta">
                  <span>{activeRequest.estimated_fare} BDT</span>
                </div>
              </div>
            </div>
          )}

          {['matched', 'in_progress'].includes(ridePhase) && activeRide && (
            <div className="ongoing-ride-section">
              <h3>Ongoing Ride</h3>
              <div
                className="ongoing-ride-card"
                onClick={() => navigate('/rider/ride')}
              >
                <div className="ongoing-ride-status">
                  <div className="status-dot active" />
                  <span>{ridePhase === 'matched' ? 'Driver on the way' : 'Ride in progress'}</span>
                </div>
                <div className="ongoing-ride-route">
                  <span>{activeRide.pickup_addr}</span>
                  <span className="route-arrow">&rarr;</span>
                  <span>{activeRide.dropoff_addr}</span>
                </div>
                <div className="ongoing-ride-meta">
                  <span>{activeRide.driver_name}</span>
                  <span>{activeRide.estimated_fare} BDT</span>
                  {activeRide.vehicle_plate && <span>{activeRide.vehicle_plate}</span>}
                </div>
              </div>
            </div>
          )}

          {scheduledRides.length > 0 && (
            <div className="scheduled-rides-section">
              <div className="scheduled-rides-header">
                <h3>Upcoming Scheduled Rides</h3>
                <button
                  className="scheduled-rides-view-all"
                  onClick={() => navigate('/rider/scheduled')}
                >
                  View All &rarr;
                </button>
              </div>
              {scheduledRides.map((ride) => {
                const st = new Date(ride.scheduled_time);
                return (
                  <div
                    key={ride.request_id}
                    className="scheduled-ride-card scheduled-ride-card--clickable"
                    onClick={() => navigate('/rider/scheduled')}
                  >
                    <div className="scheduled-ride-info">
                      <div className="scheduled-ride-time">
                        {st.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at{' '}
                        {st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="scheduled-ride-route">
                        <span>{ride.pickup_addr}</span>
                        <span className="route-arrow">&rarr;</span>
                        <span>{ride.dropoff_addr}</span>
                      </div>
                      <div className="scheduled-ride-meta">
                        <span>{ride.estimated_fare} BDT</span>
                        <span>{ride.vehicle_type}</span>
                      </div>
                    </div>
                    <span className="scheduled-ride-chevron">&rsaquo;</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="uber-quick-actions">
            <div className="uber-quick-card" onClick={startBooking}>
              <div className="card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-3h8l2 3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1m10 0v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1" />
                  <circle cx="7.5" cy="13" r="1.5" />
                  <circle cx="16.5" cy="13" r="1.5" />
                </svg>
              </div>
              <div>
                <h4>Book a Ride</h4>
                <p>Set pickup and destination</p>
              </div>
            </div>
            <div className="uber-quick-card" onClick={() => navigate('/rider/history')}>
              <div className="card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h4>Ride History</h4>
                <p>View your past trips</p>
              </div>
            </div>
            <div className="uber-quick-card" onClick={() => navigate('/complaints')}>
              <div className="card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h4>Complaints</h4>
                <p>File or track complaints</p>
              </div>
            </div>
            <div className="uber-quick-card" onClick={() => navigate('/rider/promos')}>
              <div className="card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </div>
              <div>
                <h4>Promos</h4>
                <p>View available discounts</p>
              </div>
            </div>
          </div>
        </div>

        <div className="uber-right-map">
          <BookingMap
            fullscreen
            userLocation={userLocation}
            nearbyVehicles={nearbyVehicles}
          />
        </div>
      </div>
    </div>
  );
}

export default RiderDashboard;
