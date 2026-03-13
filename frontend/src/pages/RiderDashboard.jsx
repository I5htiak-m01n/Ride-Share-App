import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import BookingMap from '../components/BookingMap';
import ChatPanel from '../components/ChatPanel';
import RatingModal from '../components/RatingModal';
import RatingBadge from '../components/RatingBadge';
import NotificationDropdown from '../components/NotificationDropdown';
import './Dashboard.css';

function RiderDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    ridePhase,
    walletBalance, statusMessage, userLocation, nearbyVehicles,
    activeRequest, activeRide,
    resetBooking, error, stopPolling,
    routePath, routeInfo, eta, wasRerouted, routeLoading,
    showRatingModal, ratingTarget, ratingLoading, userRating,
    handleSubmitRating, handleSkipRating,
  } = useRide();

  // If we're in a booking/confirming/searching phase, redirect to the correct page
  useEffect(() => {
    if (ridePhase === 'booking') {
      navigate('/rider/book', { replace: true });
    } else if (ridePhase === 'confirming') {
      navigate('/rider/confirm', { replace: true });
    } else if (ridePhase === 'searching') {
      navigate('/rider/searching', { replace: true });
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

  // Show idle or active ride phases
  const showIdle = ridePhase === 'idle';
  const showActiveRide = ['matched', 'in_progress', 'completed'].includes(ridePhase);

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare</h2>
        </div>
        <div className="nav-user">
          <NotificationDropdown />
          <RatingBadge ratingAvg={userRating.rating_avg} ratingCount={userRating.rating_count} />
          <span>Hi, {user?.name || 'Rider'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      {/* === IDLE — Split layout === */}
      {showIdle && (
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
              <div className="uber-panel-info">{statusMessage}</div>
            )}

            <div className="uber-where-to-bar" onClick={startBooking}>
              <div className="search-dot" />
              <span>Where to?</span>
            </div>

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
              <div className="uber-quick-card" onClick={() => navigate('/wallet')}>
                <div className="card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
                <div>
                  <h4>Wallet</h4>
                  <p>Top up and view transactions</p>
                </div>
              </div>
              <div className="uber-quick-card" onClick={() => navigate('/rider/profile')}>
                <div className="card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M20 21a8 8 0 1 0-16 0" />
                  </svg>
                </div>
                <div>
                  <h4>Profile</h4>
                  <p>Manage your account</p>
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
      )}

      {/* === Active ride phases === */}
      {showActiveRide && (
        <div className="dashboard-content">
          {error && <div className="error-banner">{error}</div>}

          {/* MATCHED */}
          {ridePhase === 'matched' && activeRide && (
            <div className="ride-active-panel">
              <h2>Driver Found!</h2>

              {routePath.length > 1 && (
                <BookingMap
                  pickupLocation={activeRequest ? { lat: parseFloat(activeRequest.pickup_lat), lng: parseFloat(activeRequest.pickup_lng) } : null}
                  dropoffLocation={activeRequest ? { lat: parseFloat(activeRequest.dropoff_lat), lng: parseFloat(activeRequest.dropoff_lng) } : null}
                  routePath={routePath}
                  routeInfo={routeInfo}
                  eta={eta}
                  wasRerouted={wasRerouted}
                  routeLoading={routeLoading}
                />
              )}
              <div className="driver-info">
                <h3>{activeRide.driver_name}</h3>
                {activeRide.driver_phone && <p>Phone: {activeRide.driver_phone}</p>}
                {activeRide.driver_rating && <p>Rating: {activeRide.driver_rating}/5</p>}
                {activeRide.vehicle_model && <p>Vehicle: {activeRide.vehicle_model}</p>}
                {activeRide.vehicle_plate && <p>Plate: {activeRide.vehicle_plate}</p>}
              </div>
              <div className="ride-summary">
                <div className="summary-row">
                  <span>From</span>
                  <strong>{activeRide.pickup_addr}</strong>
                </div>
                <div className="summary-row">
                  <span>To</span>
                  <strong>{activeRide.dropoff_addr}</strong>
                </div>
                <div className="summary-row fare">
                  <span>Fare</span>
                  <strong>{activeRide.estimated_fare} BDT</strong>
                </div>
              </div>
              <span className="status-badge">Driver is on the way</span>
              <ChatPanel
                rideId={activeRide.ride_id}
                currentUserId={user.user_id}
                otherName={activeRide.driver_name}
              />
            </div>
          )}

          {/* IN PROGRESS */}
          {ridePhase === 'in_progress' && activeRide && (
            <div className="ride-active-panel">
              <h2>Ride in Progress</h2>

              {routePath.length > 1 && (
                <BookingMap
                  pickupLocation={activeRequest ? { lat: parseFloat(activeRequest.pickup_lat), lng: parseFloat(activeRequest.pickup_lng) } : null}
                  dropoffLocation={activeRequest ? { lat: parseFloat(activeRequest.dropoff_lat), lng: parseFloat(activeRequest.dropoff_lng) } : null}
                  routePath={routePath}
                  routeInfo={routeInfo}
                  eta={eta}
                  wasRerouted={wasRerouted}
                  routeLoading={routeLoading}
                />
              )}
              <div className="driver-info">
                <h3>{activeRide.driver_name}</h3>
                {activeRide.driver_phone && <p>Phone: {activeRide.driver_phone}</p>}
                {activeRide.vehicle_model && <p>Vehicle: {activeRide.vehicle_model}</p>}
                {activeRide.vehicle_plate && <p>Plate: {activeRide.vehicle_plate}</p>}
              </div>
              <div className="ride-summary">
                <div className="summary-row">
                  <span>From</span>
                  <strong>{activeRide.pickup_addr}</strong>
                </div>
                <div className="summary-row">
                  <span>To</span>
                  <strong>{activeRide.dropoff_addr}</strong>
                </div>
                <div className="summary-row fare">
                  <span>Fare</span>
                  <strong>{activeRide.estimated_fare} BDT</strong>
                </div>
              </div>
              <span className="status-badge active">Ride started</span>
              <ChatPanel
                rideId={activeRide.ride_id}
                currentUserId={user.user_id}
                otherName={activeRide.driver_name}
              />
            </div>
          )}

          {/* COMPLETED */}
          {ridePhase === 'completed' && activeRide && (
            <div className="completion-panel">
              <h2>Ride Complete!</h2>

              <div className="payment-summary">
                <div className="summary-row">
                  <span>Base Fare</span>
                  <strong>{activeRide.estimated_fare} BDT</strong>
                </div>
                {activeRide.final_fare && activeRide.estimated_fare &&
                  Number(activeRide.estimated_fare) !== Number(activeRide.final_fare) && (
                  <div className="summary-row discount">
                    <span>Promo Discount</span>
                    <strong>-{(Number(activeRide.estimated_fare) - Number(activeRide.final_fare)).toFixed(0)} BDT</strong>
                  </div>
                )}
                {activeRide.platform_fee && (
                  <div className="summary-row">
                    <span>Platform Fee (15%)</span>
                    <strong>{activeRide.platform_fee} BDT</strong>
                  </div>
                )}
                <div className="summary-row fare">
                  <span>Total Charged</span>
                  <strong>{activeRide.final_fare || activeRide.estimated_fare} BDT</strong>
                </div>
              </div>

              <div className="payment-wallet-info">
                <p>Paid from wallet</p>
                {walletBalance !== null && (
                  <p className="wallet-after">Wallet Balance: {walletBalance.toFixed(2)} BDT</p>
                )}
              </div>

              <p style={{ color: '#6B6B6B', fontSize: '14px', marginBottom: '4px' }}>
                Driver: {activeRide.driver_name}
              </p>
              <p style={{ color: '#6B6B6B', fontSize: '14px', marginBottom: '24px' }}>
                {activeRide.pickup_addr || activeRequest?.pickup_addr} &rarr; {activeRide.dropoff_addr || activeRequest?.dropoff_addr}
              </p>

              <button
                onClick={resetBooking}
                style={{
                  padding: '14px 28px',
                  background: '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '15px',
                }}
              >
                Done
              </button>
            </div>
          )}

          {/* Rating Modal */}
          {showRatingModal && ratingTarget && (
            <RatingModal
              rateeName={ratingTarget.rateeName}
              onSubmit={handleSubmitRating}
              onSkip={handleSkipRating}
              loading={ratingLoading}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default RiderDashboard;
