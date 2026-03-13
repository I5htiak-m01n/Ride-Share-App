import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import { ridesAPI } from '../api/client';
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
    vehicleType, setVehicleType,
    handleValidatePromo, handleConfirmRide,
    error, loading, stopPolling,
    routePath, routeInfo, eta, wasRerouted, routeLoading,
  } = useRide();

  const [availablePromos, setAvailablePromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState([]);

  // Fetch available promos and vehicle types on mount
  useEffect(() => {
    let cancelled = false;
    const fetchPromos = async () => {
      setPromosLoading(true);
      try {
        const { data } = await ridesAPI.getAvailablePromos();
        if (!cancelled) setAvailablePromos(data.promos);
      } catch {
        // silently fail — promos are optional
      } finally {
        if (!cancelled) setPromosLoading(false);
      }
    };
    const fetchVehicleTypes = async () => {
      try {
        const { data } = await ridesAPI.getVehicleTypes();
        if (!cancelled) setVehicleTypes(data.vehicle_types || []);
      } catch {
        // silently fail — will default to economy
      }
    };
    fetchPromos();
    fetchVehicleTypes();
    return () => { cancelled = true; };
  }, []);

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

  // Compute adjusted fare based on selected vehicle type multiplier
  const selectedVT = vehicleTypes.find((vt) => vt.type_key === vehicleType);
  const multiplier = selectedVT ? parseFloat(selectedVT.fare_multiplier) : 1.0;
  const baseFare = parseFloat(fareEstimate.estimated_fare);
  const adjustedFare = Math.round(baseFare * multiplier * 100) / 100;
  const displayFare = promoResult?.valid
    ? Math.max(0, adjustedFare - parseFloat(promoResult.discount_amount || 0))
    : adjustedFare;

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
          </div>

          {/* Vehicle Type Selector */}
          {vehicleTypes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Choose Ride Category</h3>
              <div className="vehicle-type-list">
                {vehicleTypes.map((vt) => {
                  const vtFare = Math.round(baseFare * parseFloat(vt.fare_multiplier) * 100) / 100;
                  return (
                    <div
                      key={vt.type_key}
                      className={`vehicle-type-card${vehicleType === vt.type_key ? ' selected' : ''}`}
                      onClick={() => { setVehicleType(vt.type_key); setPromoResult(null); }}
                    >
                      <div className="vt-label">{vt.label}</div>
                      <div className="vt-desc">{vt.description}</div>
                      <div className="vt-meta">
                        <span className="vt-capacity">{vt.capacity} seats</span>
                        <strong>{vtFare} BDT</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="ride-summary">
            <div className="summary-row fare">
              <span>Estimated Fare</span>
              <strong>{displayFare} BDT</strong>
            </div>
          </div>

          <div className="promo-input-section">
            <label>Have a discount coupon?</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {availablePromos.length > 0 ? (
                <select
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    setPromoResult(null);
                  }}
                  style={{
                    flex: 1, padding: '10px 12px', border: '1px solid #ccc',
                    borderRadius: 8, fontSize: 14, background: '#fff',
                  }}
                >
                  <option value="">Select a promo code</option>
                  {availablePromos.map(p => (
                    <option key={p.promo_id} value={p.promo_code}>
                      {p.promo_code} — {parseFloat(p.discount_amount).toFixed(0)} BDT off ({p.remaining_uses} use{p.remaining_uses !== 1 ? 's' : ''} left)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => { setPromoCode(e.target.value); setPromoResult(null); }}
                  placeholder={promosLoading ? 'Loading promos...' : 'Enter promo code'}
                />
              )}
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
