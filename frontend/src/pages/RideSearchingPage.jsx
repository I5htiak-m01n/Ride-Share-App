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
    if (ridePhase === 'matched' || ridePhase === 'in_progress' || ridePhase === 'completed') {
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
              style={{ marginBottom: 12 }}
            >
              &larr; Back
            </button>

            {error && <div className="uber-panel-alert">{error}</div>}

            <div className="searching-panel" style={{ boxShadow: 'none', padding: 0 }}>
              <div className="searching-animation">
                <div className="pulse-ring" />
              </div>
              <h2>Looking for nearby drivers...</h2>
              {activeRequest && (
                <>
                  <p style={{ color: '#6B6B6B', fontSize: '14px', marginTop: '16px' }}>
                    From: {activeRequest.pickup_addr}
                  </p>
                  <p style={{ color: '#6B6B6B', fontSize: '14px' }}>
                    To: {activeRequest.dropoff_addr}
                  </p>
                  <p style={{ fontWeight: 600, fontSize: '16px', marginTop: '8px' }}>
                    {activeRequest.estimated_fare} BDT
                  </p>
                </>
              )}
              <p className="searching-hint">This may take up to 5 minutes</p>
              <button
                onClick={handleCancel}
                style={{
                  padding: '12px 28px',
                  background: '#fff',
                  color: '#E11900',
                  border: '1px solid #E2E2E2',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '14px',
                }}
              >
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
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', color: '#6B6B6B', fontSize: '14px' }}>
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
