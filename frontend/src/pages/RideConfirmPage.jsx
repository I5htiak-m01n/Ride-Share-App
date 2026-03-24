import { useEffect, useState, useMemo } from 'react';
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
    scheduledTime, setScheduledTime,
    handleValidatePromo, handleConfirmRide,
    error, loading, stopPolling,
    routePath, routeInfo, eta, wasRerouted, routeLoading,
  } = useRide();

  const [availablePromos, setAvailablePromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState([]);

  // Pickup time mode
  const [pickupMode, setPickupMode] = useState('now'); // 'now' | 'schedule'
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

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

  // Compute date bounds for the schedule picker
  const { todayStr, maxDateStr } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maxDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().split('T')[0];
    return { todayStr: fmt(today), maxDateStr: fmt(maxDate) };
  }, []);

  // Update scheduledTime when date/time change
  useEffect(() => {
    if (pickupMode === 'schedule' && scheduleDate && scheduleTime) {
      const dt = new Date(`${scheduleDate}T${scheduleTime}`);
      if (!isNaN(dt.getTime())) {
        setScheduledTime(dt.toISOString());
      }
    } else if (pickupMode === 'now') {
      setScheduledTime(null);
    }
  }, [pickupMode, scheduleDate, scheduleTime, setScheduledTime]);

  // Validate that scheduled time is at least 30 minutes from now
  const scheduleError = useMemo(() => {
    if (pickupMode !== 'schedule' || !scheduleDate || !scheduleTime) return null;
    const dt = new Date(`${scheduleDate}T${scheduleTime}`);
    if (isNaN(dt.getTime())) return null;
    const minTime = Date.now() + 30 * 60 * 1000;
    if (dt.getTime() < minTime) {
      return 'Pickup must be at least 30 minutes from now';
    }
    return null;
  }, [pickupMode, scheduleDate, scheduleTime]);

  const handleBack = () => {
    setScheduledTime(null);
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

  const scheduleValid = pickupMode === 'now' || (scheduleDate && scheduleTime && !scheduleError);

  return (
    <div className="dashboard-container">
      <NavBar onLogout={handleLogout} />

      <div className="confirm-split-layout">
        <div className="confirm-left-panel">
          {error && <div className="error-banner">{error}</div>}
          <h2>Confirm Your Ride</h2>

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

          {/* Pickup Time Selector */}
          <div className="pickup-time-selector">
            <h3>Pickup Time</h3>
            <div className="pickup-mode-toggle">
              <button
                className={pickupMode === 'now' ? 'active' : ''}
                onClick={() => { setPickupMode('now'); setScheduledTime(null); }}
              >
                Pick up now
              </button>
              <button
                className={pickupMode === 'schedule' ? 'active' : ''}
                onClick={() => setPickupMode('schedule')}
              >
                Schedule
              </button>
            </div>

            {pickupMode === 'schedule' && (
              <div className="schedule-picker">
                <div className="schedule-picker-row">
                  <div className="schedule-field">
                    <label>Date</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      min={todayStr}
                      max={maxDateStr}
                    />
                  </div>
                  <div className="schedule-field">
                    <label>Time</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                    />
                  </div>
                </div>
                <div className="schedule-info">
                  <p>Schedule up to 15 days in advance</p>
                  <p>Cancel without charge up to 30 minutes before pickup</p>
                </div>
                {scheduleError && (
                  <p className="promo-error" style={{ marginTop: 8 }}>{scheduleError}</p>
                )}
              </div>
            )}
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
            <button onClick={onConfirm} disabled={loading || !scheduleValid}>
              {loading ? 'Requesting...' : (pickupMode === 'schedule' ? 'Schedule Ride' : 'Confirm Ride')}
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
              fullHeight
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default RideConfirmPage;
