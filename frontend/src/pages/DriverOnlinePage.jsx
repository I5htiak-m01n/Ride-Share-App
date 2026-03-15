import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import RideMap from '../components/RideMap';
import RatingBadge from '../components/RatingBadge';
import NotificationDropdown from '../components/NotificationDropdown';
import './Dashboard.css';

function DriverOnlinePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    driverPhase,
    driverLocation, locationError,
    nearbyRequests,
    error,
    walletBalance,
    userRating,
    goOffline,
    acceptRequest, rejectRequest,
    routePath, routeInfo, routeLoading, eta, wasRerouted,
  } = useDriver();

  // Route guard
  useEffect(() => {
    if (driverPhase === 'ride_accepted' || driverPhase === 'ride_started') {
      navigate('/driver/ride', { replace: true });
    } else if (driverPhase === 'offline') {
      navigate('/driver/dashboard', { replace: true });
    }
  }, [driverPhase, navigate]);

  const handleGoOffline = () => {
    goOffline();
    navigate('/driver/dashboard');
  };

  const handleAccept = async (requestId) => {
    try {
      await acceptRequest(requestId);
      // Navigation happens via driverPhase watcher above
    } catch {
      // error is set in context
    }
  };

  const handleLogout = async () => {
    goOffline();
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare Driver</h2>
        </div>
        <div className="nav-user">
          <NotificationDropdown />
          <RatingBadge ratingAvg={userRating.rating_avg} ratingCount={userRating.rating_count} />
          <span>Hi, {user?.name || 'Driver'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="uber-split-layout">
        {/* Left Panel */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            <div className="uber-greeting">
              <h1>You&apos;re Online</h1>
              <p>Accepting rides nearby</p>
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
              <button onClick={handleGoOffline} className="status-toggle online">
                Online — Accepting Rides
              </button>
            </div>

            {/* Nearby requests list */}
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
          </div>
        </div>

        {/* Right Panel: RideMap */}
        <div className="uber-right-map">
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
        </div>
      </div>
    </div>
  );
}

export default DriverOnlinePage;
