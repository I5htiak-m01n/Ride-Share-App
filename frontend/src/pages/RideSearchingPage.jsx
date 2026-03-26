import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import BookingMap from '../components/BookingMap';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function RideSearchingPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    ridePhase, activeRequest,
    handleCancelRequest, resetBooking, error, stopPolling,
    routePath, routeInfo, routeLoading, userLocation,
  } = useRide();

  // Route guard: must be in searching phase with an active request
  useEffect(() => {
    if (ridePhase !== 'searching' || !activeRequest) {
      navigate('/rider/dashboard', { replace: true });
    }
  }, []);

  // Watch for phase transitions from polling
  useEffect(() => {
    if (ridePhase === 'matched') {
      navigate('/rider/pickup', { replace: true });
    } else if (ridePhase === 'in_progress' || ridePhase === 'completed') {
      navigate('/rider/ride', { replace: true });
    } else if (ridePhase === 'idle') {
      // Ride was cancelled server-side or timed out
      navigate('/rider/dashboard', { replace: true });
    }
  }, [ridePhase, navigate]);

  const handleCancel = async () => {
    await handleCancelRequest();
    navigate('/rider/dashboard', { replace: true });
  };

  const handleLogout = async () => {
    stopPolling();
    await logout();
    navigate('/login');
  };

  const pickupLocation = activeRequest ? {
    lat: parseFloat(activeRequest.pickup_lat),
    lng: parseFloat(activeRequest.pickup_lng),
  } : null;

  const dropoffLocation = activeRequest ? {
    lat: parseFloat(activeRequest.dropoff_lat),
    lng: parseFloat(activeRequest.dropoff_lng),
  } : null;

  return (
    <div className="dashboard-container">
      <NavBar onLogout={handleLogout} />

      <div className="uber-split-layout">
        {/* Left Panel: Searching animation + ride info */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            <button
              onClick={() => navigate('/rider/dashboard')}
              className="page-back-btn"
            >
              &larr; Back
            </button>

            {error && <div className="uber-panel-alert">{error}</div>}

            <div className="searching-panel">
              <div className="searching-animation">
                <div className="pulse-ring" />
              </div>
              <h2>Looking for nearby drivers...</h2>
              <p className="searching-hint">This usually takes a minute or two</p>

              {activeRequest && (
                <div className="searching-route-card">
                  <div className="searching-route-row">
                    <div className="searching-route-dot pickup" />
                    <span>{activeRequest.pickup_addr}</span>
                  </div>
                  <div className="searching-route-divider" />
                  <div className="searching-route-row">
                    <div className="searching-route-dot dropoff" />
                    <span>{activeRequest.dropoff_addr}</span>
                  </div>
                </div>
              )}

              {activeRequest && (
                <div className="searching-fare">{activeRequest.estimated_fare} BDT</div>
              )}

              <button onClick={handleCancel} className="searching-cancel-btn">
                Cancel Request
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="uber-right-map">
          <div className="uber-ridemap-wrapper">
            {pickupLocation ? (
              <BookingMap
                pickupLocation={pickupLocation}
                dropoffLocation={dropoffLocation}
                routePath={routePath}
                routeInfo={routeInfo}
                routeLoading={routeLoading}
                userLocation={userLocation}
                ridePhase="searching"
                fullHeight
              />
            ) : (
              <div className="uber-map-loading">
                Loading map...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RideSearchingPage;
