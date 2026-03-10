import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import BookingMap from '../components/BookingMap';
import './Dashboard.css';

function RideConfirmPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    ridePhase, setRidePhase,
    pickupAddr, dropoffAddr, pickupCoords, dropoffCoords,
    fareEstimate,
    promoCode, setPromoCode, promoResult, setPromoResult, promoLoading,
    handleValidatePromo, handleConfirmRide,
    error, loading, stopPolling,
    routePath, routeInfo, eta, wasRerouted, routeLoading,
  } = useRide();

  // Route guard: must have fare estimate and be in confirming phase
  useEffect(() => {
    if (ridePhase !== 'confirming' || !fareEstimate) {
      navigate('/rider/dashboard', { replace: true });
    }
  }, []);

  // When ride is confirmed, phase transitions to searching -> navigate
  useEffect(() => {
    if (ridePhase === 'searching') {
      navigate('/rider/searching');
    }
  }, [ridePhase, navigate]);

  const handleBack = () => {
    setRidePhase('booking');
    navigate('/rider/book');
  };

  const handleLogout = async () => {
    stopPolling();
    await logout();
    navigate('/login');
  };

  if (!fareEstimate) return null;

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

        <div className="confirm-panel">
          <h2>Confirm Your Ride</h2>

          {routePath.length > 1 && (
            <BookingMap
              pickupLocation={pickupCoords}
              dropoffLocation={dropoffCoords}
              routePath={routePath}
              routeInfo={routeInfo}
              eta={eta}
              wasRerouted={wasRerouted}
              routeLoading={routeLoading}
            />
          )}

          <div className="ride-summary">
            <div className="summary-row">
              <span>From</span>
              <strong>{pickupAddr}</strong>
            </div>
            <div className="summary-row">
              <span>To</span>
              <strong>{dropoffAddr}</strong>
            </div>
            <div className="summary-row">
              <span>Distance</span>
              <strong>{fareEstimate.route_distance_text || `${fareEstimate.distance_km} km`}</strong>
            </div>
            <div className="summary-row">
              <span>Est. Duration</span>
              <strong>{fareEstimate.route_duration_text || `${fareEstimate.estimated_duration_min} min`}</strong>
            </div>
            <div className="summary-row fare">
              <span>Estimated Fare</span>
              <strong>{promoResult?.valid ? promoResult.discounted_fare : fareEstimate.estimated_fare} BDT</strong>
            </div>
          </div>

          <div className="promo-input-section">
            <label>Have a discount coupon?</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value); setPromoResult(null); }}
                placeholder="Enter promo code"
              />
              <button
                onClick={handleValidatePromo}
                disabled={!promoCode.trim() || promoLoading}
                className="location-btn"
              >
                {promoLoading ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {promoResult && promoResult.valid && (
              <div className="promo-success">
                Discount: {promoResult.discount_amount} BDT off! New fare: {promoResult.discounted_fare} BDT
              </div>
            )}
            {promoResult && !promoResult.valid && (
              <div className="promo-error">Invalid or expired promo code</div>
            )}
          </div>

          <div className="booking-actions">
            <button onClick={handleBack}>Back</button>
            <button onClick={handleConfirmRide} disabled={loading}>
              {loading ? 'Requesting...' : 'Confirm Ride'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RideConfirmPage;
