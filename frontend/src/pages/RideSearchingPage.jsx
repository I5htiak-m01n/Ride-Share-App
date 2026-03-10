import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import './Dashboard.css';

function RideSearchingPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    ridePhase, activeRequest,
    handleCancelRequest, resetBooking, error, stopPolling,
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
      navigate('/rider/dashboard', { replace: true });
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

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'Rider'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content">
        {error && <div className="error-banner">{error}</div>}

        <div className="searching-panel">
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
  );
}

export default RideSearchingPage;
