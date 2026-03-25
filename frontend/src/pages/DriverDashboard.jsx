import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useDriver } from '../context/DriverContext';
import BookingMap from '../components/BookingMap';
import RideMap from '../components/RideMap';
import RatingModal from '../components/RatingModal';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function DriverDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    driverPhase,
    driverLocation, locationError,
    walletBalance, userRating,
    error,
    fakeVehicles,
    goOnline, goOffline,
    nearbyRequests,
    acceptRequest, rejectRequest,
    activeRide,
    routePath, routeInfo, routeLoading, eta, wasRerouted,
    // Rating modal
    showRatingModal, ratingTarget, ratingLoading,
    handleSubmitRating, handleSkipRating,
  } = useDriver();

  const isOnline = driverPhase === 'online';
  const hasActiveRide = ['ride_accepted', 'ride_started'].includes(driverPhase);

  const handleGoOnline = async () => {
    try {
      await goOnline();
    } catch {
      // error is set in context
    }
  };

  const handleGoOffline = () => {
    goOffline();
  };

  const handleAccept = async (requestId) => {
    try {
      await acceptRequest(requestId);
      navigate('/driver/pickup');
    } catch {
      // error is set in context
    }
  };

  const handleLogout = async () => {
    if (isOnline) goOffline();
    await logout();
    navigate('/login');
  };

  const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';

  return (
    <div className="dashboard-container">
      <NavBar
        brandText="RideShare Driver"
        showNotifications
        ratingAvg={userRating.rating_avg}
        ratingCount={userRating.rating_count}
        onLogout={handleLogout}
      />

      <div className="uber-split-layout">
        {/* Left Panel */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            <div className="uber-greeting">
              {isOnline ? (
                <>
                  <h1>You&apos;re Online</h1>
                  <p>Accepting rides nearby</p>
                </>
              ) : (
                <>
                  <h1>Good {greeting}, {user?.name || 'Driver'}</h1>
                  <p>Go online to start accepting rides</p>
                </>
              )}
            </div>

            {walletBalance !== null && (
              <div className="wallet-balance-display">
                <span>Earnings</span>
                <strong>{walletBalance.toFixed(2)} BDT</strong>
              </div>
            )}

            {locationError && <div className="uber-panel-alert">{locationError}</div>}
            {error && <div className="uber-panel-alert">{error}</div>}

            <div className="uber-status-section">
              {isOnline ? (
                <button onClick={handleGoOffline} className="status-toggle online">
                  Online &mdash; Accepting Rides
                </button>
              ) : (
                <button onClick={handleGoOnline} className="status-toggle offline">
                  Tap to Go Online
                </button>
              )}
            </div>

            {/* Nearby requests (online only) */}
            {isOnline && (
              <>
                {nearbyRequests.length > 0 ? (
                  <div className="uber-request-list">
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 600 }}>
                      Nearby Requests ({nearbyRequests.length})
                    </h3>
                    {nearbyRequests.map((req) => (
                      <div key={req.request_id} className="uber-request-card">
                        <h4>{req.rider_name}</h4>
                        <p className="req-detail">From: {req.pickup_addr}</p>
                        <p className="req-detail">To: {req.dropoff_addr}</p>
                        <p className="req-detail">
                          Distance: {(req.distance_meters / 1000).toFixed(1)} km away
                        </p>
                        {req.estimated_fare && (
                          <p className="req-fare">{req.estimated_fare} BDT</p>
                        )}
                        <div className="req-actions">
                          <button className="accept-btn" onClick={() => handleAccept(req.request_id)}>
                            Accept
                          </button>
                          <button className="reject-btn" onClick={() => rejectRequest(req.request_id)}>
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : driverLocation ? (
                  <p className="uber-waiting-text">No ride requests within 5 km. Waiting...</p>
                ) : null}
              </>
            )}

            {/* Ongoing ride card (ride_accepted / ride_started) */}
            {hasActiveRide && activeRide && (
              <div className="ongoing-ride-section">
                <h3>Ongoing Ride</h3>
                <div
                  className="ongoing-ride-card"
                  onClick={() => navigate(driverPhase === 'ride_accepted' ? '/driver/pickup' : '/driver/ride')}
                >
                  <div className="ongoing-ride-status">
                    <div className="status-dot active" />
                    <span>{driverPhase === 'ride_accepted' ? 'Heading to pickup' : 'Ride in progress'}</span>
                  </div>
                  <div className="ongoing-ride-route">
                    <span>{activeRide.ride?.pickup_addr}</span>
                    <span className="route-arrow">&rarr;</span>
                    <span>{activeRide.ride?.dropoff_addr}</span>
                  </div>
                  <div className="ongoing-ride-meta">
                    <span>{activeRide.rider_name}</span>
                    <span>{activeRide.estimated_fare} BDT</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions — always visible */}
            <div className="uber-quick-actions">
              <div className="uber-quick-card" onClick={() => navigate('/driver/vehicles')}>
                <div className="card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" rx="2" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
                <div>
                  <h4>My Vehicles</h4>
                  <p>Manage your vehicles</p>
                </div>
              </div>
              <div className="uber-quick-card" onClick={() => navigate('/driver/history')}>
                <div className="card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <div>
                  <h4>Earnings</h4>
                  <p>View your ride history</p>
                </div>
              </div>
              <div className="uber-quick-card" onClick={() => navigate('/driver/documents')}>
                <div className="card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div>
                  <h4>Documents</h4>
                  <p>Manage your documents</p>
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
            </div>
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="uber-right-map">
          {isOnline ? (
            <div className="uber-ridemap-wrapper">
              {driverLocation ? (
                <RideMap
                  driverLocation={driverLocation}
                  rideRequests={nearbyRequests}
                  onAccept={handleAccept}
                  onReject={rejectRequest}
                  routePath={routePath}
                  routeInfo={routeInfo}
                  routeLoading={routeLoading}
                  eta={eta}
                  wasRerouted={wasRerouted}
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', color: '#6B6B6B', fontSize: '14px' }}>
                  Waiting for GPS location...
                </div>
              )}
            </div>
          ) : (
            <BookingMap
              fullscreen
              userLocation={driverLocation}
              nearbyVehicles={fakeVehicles}
            />
          )}
        </div>
      </div>

      {/* Rating Modal (survives navigation back from ride page) */}
      {showRatingModal && ratingTarget && (
        <RatingModal
          rateeName={ratingTarget.rateeName}
          onSubmit={handleSubmitRating}
          onSkip={handleSkipRating}
          loading={ratingLoading}
        />
      )}
    </div>
  );
}

export default DriverDashboard;
