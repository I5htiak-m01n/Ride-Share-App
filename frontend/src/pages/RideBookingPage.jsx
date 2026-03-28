import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import { useRoute } from '../context/RouteContext';
import BookingMap from '../components/BookingMap';
import PlacesAutocomplete from '../components/PlacesAutocomplete';
import SavedPlacesModal from '../components/SavedPlacesModal';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function RideBookingPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    ridePhase, setRidePhase,
    pickupAddr, setPickupAddr, dropoffAddr, setDropoffAddr,
    pickupCoords, setPickupCoords, dropoffCoords, setDropoffCoords,
    clickMode, setClickMode, mapCenter, setMapCenter,
    handleMapClick, handleUseMyLocation, handleGetEstimate,
    resetBooking, error, setError, loading, userLocation, riderLocation,
    routePath, routeInfo, routeLoading, stopPolling,
    scheduledTime, setScheduledTime,
  } = useRide();
  const { clearRoute, fetchRoutePreview } = useRoute();

  // ── Pickup time state ─────────────────────────────────────
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState('today'); // 'today' | ISO date string
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('now'); // 'now' | 'HH:MM'
  const dateDropdownRef = useRef(null);
  const timeDropdownRef = useRef(null);

  // Build the list of up to 90 future dates
  const dateOptions = useMemo(() => {
    const opts = [{ key: 'today', label: 'Today' }];
    const now = new Date();
    for (let i = 1; i <= 89; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      opts.push({ key, label });
    }
    return opts;
  }, []);

  // Build 10-minute time slots from now + 30 min through midnight
  const timeSlots = useMemo(() => {
    const slots = [{ key: 'now', label: 'Now' }];
    const now = new Date();
    // Start at next 10-min boundary + 30 min buffer
    const startMs = now.getTime() + 30 * 60 * 1000;
    const startDate = new Date(Math.ceil(startMs / (10 * 60 * 1000)) * (10 * 60 * 1000));

    // Determine the base date
    let baseDate;
    if (selectedDateKey === 'today') {
      baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      baseDate = new Date(selectedDateKey + 'T00:00:00');
    }

    const isToday = baseDate.toDateString() === now.toDateString();

    // Generate slots for the selected day
    const slotStart = isToday ? startDate : new Date(baseDate.getTime());
    if (!isToday) {
      slotStart.setHours(0, 0, 0, 0);
    }
    const slotEnd = new Date(baseDate);
    slotEnd.setHours(23, 59, 59, 0);

    let cursor = new Date(slotStart);
    while (cursor <= slotEnd) {
      const hh = cursor.getHours().toString().padStart(2, '0');
      const mm = cursor.getMinutes().toString().padStart(2, '0');
      const h12 = cursor.getHours() % 12 || 12;
      const ampm = cursor.getHours() < 12 ? 'AM' : 'PM';
      slots.push({ key: `${hh}:${mm}`, label: `${h12}:${mm} ${ampm}` });
      cursor = new Date(cursor.getTime() + 10 * 60 * 1000);
    }
    return slots;
  }, [selectedDateKey]);

  // Derive the selected date label
  const selectedDateLabel = useMemo(() => {
    const opt = dateOptions.find(o => o.key === selectedDateKey);
    return opt ? opt.label : selectedDateKey;
  }, [selectedDateKey, dateOptions]);

  // Derive the selected time label
  const selectedTimeLabel = useMemo(() => {
    if (selectedTimeSlot === 'now') return 'Now';
    const slot = timeSlots.find(s => s.key === selectedTimeSlot);
    return slot ? slot.label : selectedTimeSlot;
  }, [selectedTimeSlot, timeSlots]);

  // Update scheduledTime in context whenever the user picks a date/time (or reverts to now)
  useEffect(() => {
    if (selectedTimeSlot === 'now') {
      setScheduledTime(null);
    } else {
      const dateStr = selectedDateKey === 'today'
        ? new Date().toISOString().split('T')[0]
        : selectedDateKey;
      const dt = new Date(`${dateStr}T${selectedTimeSlot}`);
      if (!isNaN(dt.getTime())) {
        setScheduledTime(dt.toISOString());
      }
    }
  }, [selectedDateKey, selectedTimeSlot, setScheduledTime]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target)) {
        setDateDropdownOpen(false);
      }
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(e.target)) {
        setTimeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [savedPlacesOpen, setSavedPlacesOpen] = useState(false);
  const [savedPlacesTarget, setSavedPlacesTarget] = useState('pickup'); // 'pickup' | 'dropoff'

  const openSavedPlaces = (target) => {
    setSavedPlacesTarget(target);
    setSavedPlacesOpen(true);
  };

  const handleSavedPlaceSelect = ({ address, lat, lng }) => {
    if (savedPlacesTarget === 'pickup') {
      setPickupAddr(address);
      setPickupCoords({ lat, lng });
      setMapCenter({ lat, lng });
      setClickMode('dropoff');
    } else {
      setDropoffAddr(address);
      setDropoffCoords({ lat, lng });
      setMapCenter({ lat, lng });
    }
  };

  // Auto-preview route when both pickup and dropoff are set
  useEffect(() => {
    if (ridePhase === 'booking' && pickupCoords && dropoffCoords) {
      fetchRoutePreview(pickupCoords.lat, pickupCoords.lng, dropoffCoords.lat, dropoffCoords.lng);
    }
  }, [pickupCoords, dropoffCoords, ridePhase]);

  // Route guard: redirect if in an active ride phase
  useEffect(() => {
    if (['searching', 'matched', 'in_progress', 'completed'].includes(ridePhase)) {
      navigate('/rider/dashboard', { replace: true });
    }
  }, []);

  // Set phase to booking when this page mounts — clear stale data from previous rides
  useEffect(() => {
    if (ridePhase === 'idle') {
      setPickupAddr('');
      setDropoffAddr('');
      setPickupCoords(null);
      setDropoffCoords(null);
      setClickMode('pickup');
      setRidePhase('booking');
      setError(null);
      clearRoute();
    }
  }, []);

  // When fare estimate succeeds, phase transitions to confirming -> navigate
  useEffect(() => {
    if (ridePhase === 'confirming') {
      navigate('/rider/confirm');
    }
  }, [ridePhase, navigate]);

  const handleBack = () => {
    resetBooking();
    navigate('/rider/dashboard');
  };

  const handleLogout = async () => {
    stopPolling();
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <NavBar onLogout={handleLogout} />

      <div className="booking-split-layout">
        {/* Left Panel: Booking form */}
        <div className="booking-left-panel">
          <button onClick={handleBack} className="page-back-btn">
            &larr; Back
          </button>

          {error && <div className="uber-panel-alert">{error}</div>}

          <div className="booking-panel-header">
            <h2>Book a Ride</h2>
            <p>Set your pickup and dropoff locations</p>
          </div>

          <div className="booking-form">
            <div className="booking-field">
              <label>Pickup</label>
              <div className="booking-input-row">
                <div className="booking-input-dot pickup" />
                <PlacesAutocomplete
                  value={pickupAddr}
                  onChange={setPickupAddr}
                  onPlaceSelect={({ address, lat, lng }) => {
                    setPickupAddr(address);
                    setPickupCoords({ lat, lng });
                    setMapCenter({ lat, lng });
                    setClickMode('dropoff');
                  }}
                  placeholder="Search pickup address"
                  userLocation={userLocation}
                />
              </div>
              <div className="booking-field-actions">
                <button onClick={handleUseMyLocation} className="booking-action-link">
                  Use my location
                </button>
                <span className="booking-action-divider" />
                <button onClick={() => openSavedPlaces('pickup')} className="booking-action-link">
                  Saved places
                </button>
              </div>
            </div>

            <div className="booking-route-connector" />

            <div className="booking-field">
              <label>Dropoff</label>
              <div className="booking-input-row">
                <div className="booking-input-dot dropoff" />
                <PlacesAutocomplete
                  value={dropoffAddr}
                  onChange={setDropoffAddr}
                  onPlaceSelect={({ address, lat, lng }) => {
                    setDropoffAddr(address);
                    setDropoffCoords({ lat, lng });
                    setMapCenter({ lat, lng });
                  }}
                  placeholder="Search dropoff address"
                  userLocation={userLocation}
                />
              </div>
              <div className="booking-field-actions">
                <button onClick={() => openSavedPlaces('dropoff')} className="booking-action-link">
                  Saved places
                </button>
              </div>
            </div>
          </div>

          {/* ── Uber-style pickup time selector ─────────────────── */}
          <div className="uber-time-selector">
            <div className="uber-time-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>When do you want to be picked up?</span>
            </div>
            <div className="uber-time-dropdowns">
              {/* Date dropdown */}
              <div className="uber-time-dropdown" ref={dateDropdownRef}>
                <button
                  className={`uber-time-trigger${dateDropdownOpen ? ' open' : ''}`}
                  onClick={() => { setDateDropdownOpen(v => !v); setTimeDropdownOpen(false); }}
                  id="booking-date-trigger"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>{selectedDateLabel}</span>
                  <svg className="uber-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {dateDropdownOpen && (
                  <div className="uber-time-menu" role="listbox">
                    {dateOptions.map(opt => (
                      <div
                        key={opt.key}
                        className={`uber-time-option${selectedDateKey === opt.key ? ' selected' : ''}`}
                        role="option"
                        onClick={() => {
                          setSelectedDateKey(opt.key);
                          setSelectedTimeSlot('now');
                          setDateDropdownOpen(false);
                        }}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Time dropdown */}
              <div className="uber-time-dropdown" ref={timeDropdownRef}>
                <button
                  className={`uber-time-trigger${timeDropdownOpen ? ' open' : ''}`}
                  onClick={() => { setTimeDropdownOpen(v => !v); setDateDropdownOpen(false); }}
                  id="booking-time-trigger"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>{selectedTimeLabel}</span>
                  <svg className="uber-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {timeDropdownOpen && (
                  <div className="uber-time-menu" role="listbox">
                    {timeSlots.map(slot => (
                      <div
                        key={slot.key}
                        className={`uber-time-option${selectedTimeSlot === slot.key ? ' selected' : ''}`}
                        role="option"
                        onClick={() => {
                          setSelectedTimeSlot(slot.key);
                          setTimeDropdownOpen(false);
                        }}
                      >
                        {slot.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {scheduledTime && (
              <div className="uber-time-info-rows">
                <div className="uber-time-info-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>Choose your pickup time up to 90 days in advance</span>
                </div>
                <div className="uber-time-info-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  <span>Extra wait time included to meet your ride</span>
                </div>
                <div className="uber-time-info-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  <span>Cancel at no charge up to 60 minutes in advance</span>
                </div>
              </div>
            )}
          </div>

          <div className="booking-map-mode">
            <p className="booking-map-hint">
              Or click on the map to set your {clickMode} location
              {pickupCoords && !dropoffCoords && ' (now set your dropoff)'}
            </p>
            <div className="click-mode-toggle">
              <button
                className={clickMode === 'pickup' ? 'active' : ''}
                onClick={() => setClickMode('pickup')}
              >
                Set Pickup
              </button>
              <button
                className={clickMode === 'dropoff' ? 'active' : ''}
                onClick={() => setClickMode('dropoff')}
              >
                Set Dropoff
              </button>
            </div>
          </div>

          <div className="booking-actions">
            <button
              onClick={handleGetEstimate}
              disabled={!pickupCoords || !dropoffCoords || !pickupAddr.trim() || !dropoffAddr.trim() || loading}
            >
              {loading ? 'Calculating...' : 'Get Fare Estimate'}
            </button>
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="booking-map-panel">
          <div className="uber-ridemap-wrapper">
            <BookingMap
              pickupLocation={pickupCoords}
              dropoffLocation={dropoffCoords}
              onMapClick={handleMapClick}
              centerLocation={userLocation}
              userLocation={userLocation}
              panTo={mapCenter}
              routePath={routePath}
              routeInfo={routeInfo}
              routeLoading={routeLoading}
              ridePhase="booking"
              riderLocation={riderLocation}
              fullHeight
            />
          </div>
        </div>
      </div>

      <SavedPlacesModal
        isOpen={savedPlacesOpen}
        onClose={() => setSavedPlacesOpen(false)}
        onSelect={handleSavedPlaceSelect}
        userLocation={userLocation}
      />
    </div>
  );
}

export default RideBookingPage;
