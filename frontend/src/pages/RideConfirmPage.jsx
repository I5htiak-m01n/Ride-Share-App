import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import { ridesAPI } from '../api/client';
import BookingMap from '../components/BookingMap';
import NavBar from '../components/NavBar';
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
    scheduledTime,
    handleValidatePromo, handleConfirmRide,
    error, loading, stopPolling,
    routePath, routeInfo, eta, wasRerouted, routeLoading,
    userLocation,
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

  const onConfirm = async () => {
    const result = await handleConfirmRide();
    if (result === 'scheduled') {
      navigate('/rider/dashboard', { replace: true });
    }
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
      <NavBar onLogout={handleLogout} />

      <div className="confirm-split-layout">
        <div className="confirm-left-panel">
          {error && <div className="error-banner">{error}</div>}
          <h2>Confirm Your Ride</h2>

          {/* Route summary */}
          <div className="confirm-section">
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
          </div>

          {/* Pickup Time — scheduled time summary */}
          {scheduledTime && (
            <div className="confirm-section">
              <div className="confirm-schedule-summary">
                <span className="confirm-schedule-label">⏰ Scheduled pickup</span>
                <strong className="confirm-schedule-time">
                  {new Date(scheduledTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' at '}
                  {new Date(scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </strong>
              </div>
            </div>
          )}

          {/* Vehicle type — Uber-style vertical list */}
          <div className="confirm-section">
            <h3 className="confirm-section-title">Choose a ride</h3>
            {vehicleTypes.length === 0 ? (
              <div className="uber-vehicle-loading">Loading ride options…</div>
            ) : (
              <div className="uber-vehicle-list">
                {[...vehicleTypes]
                  .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
                  .map((vt) => {
                    const vtFare = Math.round(baseFare * parseFloat(vt.fare_multiplier) * 100) / 100;
                    const isSelected = vehicleType === vt.type_key;
                    const ICONS = {
                      bike:    '🏍️',
                      cng:     '🛺',
                      premier: '🚗',
                      luxury:  '🚘',
                      economy: '🚕',
                    };
                    const icon = ICONS[vt.type_key] || '🚖';
                    const cap  = parseInt(vt.capacity, 10) || 0;

                    return (
                      <div
                        key={vt.type_key}
                        className={`uber-vehicle-card${isSelected ? ' selected' : ''}`}
                        onClick={() => { setVehicleType(vt.type_key); setPromoResult(null); }}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && (setVehicleType(vt.type_key), setPromoResult(null))}
                      >
                        {/* Vehicle emoji icon */}
                        <div className="uber-vc-icon" aria-hidden="true">{icon}</div>

                        {/* Middle: name row + description */}
                        <div className="uber-vc-info">
                          <div className="uber-vc-name-row">
                            <span className="uber-vc-name">{vt.label}</span>
                            {cap > 0 && (
                              <span className="uber-vc-capacity">
                                {/* Uber-style person icon */}
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                                </svg>
                                <span>{cap}</span>
                              </span>
                            )}
                          </div>
                          <div className="uber-vc-desc">{vt.description}</div>
                        </div>

                        {/* Right: fare */}
                        <div className="uber-vc-fare">
                          <strong>
                            BDT {vtFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>
                        </div>
                      </div>
                    );
                })}
              </div>
            )}
          </div>


          {/* Fare + promo */}
          <div className="confirm-section">
            <div className="ride-summary">
              <div className="summary-row fare">
                <span>Estimated Fare</span>
                <strong>BDT {displayFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </div>

            <div className="promo-input-section">
              <label>Have a discount coupon?</label>
              <div className="promo-input-row">
                {availablePromos.length > 0 ? (
                  <select
                    className="promo-select"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value);
                      setPromoResult(null);
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
          </div>

          <div className="booking-actions">
            <button onClick={handleBack}>Back</button>
            <button onClick={onConfirm} disabled={loading}>
              {loading ? 'Requesting...' : (scheduledTime ? 'Schedule Ride' : 'Confirm Ride')}
            </button>
          </div>
        </div>

        <div className="confirm-map-panel">
          {routePath.length > 1 && (
            <BookingMap
              pickupLocation={pickupCoords}
              dropoffLocation={dropoffCoords}
              routePath={routePath}
              routeInfo={routeInfo}
              eta={eta}
              wasRerouted={wasRerouted}
              routeLoading={routeLoading}
              userLocation={userLocation}
              ridePhase="confirming"
              fullHeight
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default RideConfirmPage;
