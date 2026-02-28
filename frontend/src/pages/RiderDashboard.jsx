import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ridesAPI } from '../api/client';
import BookingMap from '../components/BookingMap';
import './Dashboard.css';

const POLL_INTERVAL_MS = 5000;

function RiderDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Ride flow state machine
  const [ridePhase, setRidePhase] = useState('idle');
  const ridePhaseRef = useRef('idle');
  useEffect(() => { ridePhaseRef.current = ridePhase; }, [ridePhase]);

  // Booking form
  const [pickupAddr, setPickupAddr] = useState('');
  const [dropoffAddr, setDropoffAddr] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [clickMode, setClickMode] = useState('pickup');

  // Fare estimate
  const [fareEstimate, setFareEstimate] = useState(null);

  // Active ride tracking
  const [activeRequest, setActiveRequest] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  // UI
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Polling
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const checkActiveRide = useCallback(async () => {
    try {
      const res = await ridesAPI.getRiderActive();
      const data = res.data;

      if (data.message) setStatusMessage(data.message);

      switch (data.phase) {
        case 'searching':
          setRidePhase('searching');
          setActiveRequest(data.request);
          break;
        case 'matched':
          setRidePhase('matched');
          setActiveRide(data.ride);
          setActiveRequest(data.request);
          break;
        case 'in_progress':
          setRidePhase('in_progress');
          setActiveRide(data.ride);
          setActiveRequest(data.request);
          break;
        case 'completed':
          setRidePhase('completed');
          setActiveRide(data.ride);
          stopPolling();
          break;
        case 'idle':
        default:
          if (['searching', 'matched', 'in_progress'].includes(ridePhaseRef.current)) {
            setRidePhase('idle');
            setActiveRequest(null);
            setActiveRide(null);
            stopPolling();
          }
          break;
      }
    } catch (err) {
      console.error('checkActiveRide error:', err);
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(checkActiveRide, POLL_INTERVAL_MS);
  }, [stopPolling, checkActiveRide]);

  // On mount: check for existing active ride + get user location
  useEffect(() => {
    checkActiveRide().then(() => {
      if (['searching', 'matched', 'in_progress'].includes(ridePhaseRef.current)) {
        startPolling();
      }
    });
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
    return () => stopPolling();
  }, []);

  // Reverse geocode coords to address using Google Maps API
  const reverseGeocode = useCallback((coords, callback) => {
    if (!window.google?.maps?.Geocoder) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: coords }, (results, status) => {
      if (status === 'OK' && results[0]) {
        callback(results[0].formatted_address);
      }
    });
  }, []);

  // Map click handler — set coords and auto-fill address
  const handleMapClick = (coords) => {
    if (clickMode === 'pickup') {
      setPickupCoords(coords);
      reverseGeocode(coords, setPickupAddr);
      setClickMode('dropoff');
    } else {
      setDropoffCoords(coords);
      reverseGeocode(coords, setDropoffAddr);
    }
  };

  // Use My Location
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser. Click on the map to set your pickup instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPickupCoords(coords);
        reverseGeocode(coords, setPickupAddr);
        setClickMode('dropoff');
        setError(null);
      },
      (err) => {
        if (err.code === 1) {
          setError('Location access denied. Allow location in your browser settings, or click on the map to set your pickup manually.');
        } else {
          setError('Could not get your location. Click on the map to set your pickup instead.');
        }
      }
    );
  };

  // Get fare estimate
  const handleGetEstimate = async () => {
    if (!pickupCoords || !dropoffCoords) {
      setError('Please set both pickup and dropoff on the map');
      return;
    }
    if (!pickupAddr.trim() || !dropoffAddr.trim()) {
      setError('Please enter both pickup and dropoff addresses');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await ridesAPI.getFareEstimate(
        pickupCoords.lat, pickupCoords.lng,
        dropoffCoords.lat, dropoffCoords.lng
      );
      setFareEstimate(res.data);
      setRidePhase('confirming');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to get fare estimate');
    } finally {
      setLoading(false);
    }
  };

  // Confirm ride request
  const handleConfirmRide = async () => {
    if (ridePhaseRef.current !== 'confirming') return;
    setError(null);
    setLoading(true);
    try {
      const res = await ridesAPI.createRequest({
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        pickup_addr: pickupAddr,
        dropoff_lat: dropoffCoords.lat,
        dropoff_lng: dropoffCoords.lng,
        dropoff_addr: dropoffAddr,
      });
      setActiveRequest(res.data.request);
      setRidePhase('searching');
      startPolling();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create ride request');
    } finally {
      setLoading(false);
    }
  };

  // Cancel ride request
  const handleCancelRequest = async () => {
    if (!activeRequest?.request_id) return;
    try {
      await ridesAPI.cancelRequest(activeRequest.request_id);
      stopPolling();
      resetBooking();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel request');
    }
  };

  // Reset to idle
  const resetBooking = () => {
    setRidePhase('idle');
    setPickupAddr('');
    setDropoffAddr('');
    setPickupCoords(null);
    setDropoffCoords(null);
    setClickMode('pickup');
    setFareEstimate(null);
    setActiveRequest(null);
    setActiveRide(null);
    setError(null);
    setStatusMessage(null);
    stopPolling();
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
        {/* Error banner */}
        {error && (
          <div className="error-banner">{error}</div>
        )}
        {statusMessage && ridePhase === 'idle' && (
          <div className="info-banner">{statusMessage}</div>
        )}

        {/* === PHASE: IDLE === */}
        {ridePhase === 'idle' && (
          <>
            <div className="dashboard-header">
              <div>
                <h1>Where to?</h1>
                <p>Welcome back. Book your next ride.</p>
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-card primary-card">
                <div className="card-icon">Ride</div>
                <h3>Request a Ride</h3>
                <p>Find nearby drivers and book your ride in seconds</p>
                <button className="card-button" onClick={() => { setRidePhase('booking'); setError(null); setStatusMessage(null); }}>
                  Book Now
                </button>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">History</div>
                <h3>Ride History</h3>
                <p>View all your past rides and receipts</p>
                <button className="card-button secondary">View History</button>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">Wallet</div>
                <h3>My Wallet</h3>
                <p>Balance: {user?.wallet?.balance || '0.00'} {user?.wallet?.currency || 'BDT'}</p>
                <button className="card-button secondary">Add Money</button>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">Saved</div>
                <h3>Saved Addresses</h3>
                <p>Manage your favorite locations</p>
                <button className="card-button secondary">Manage</button>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">Promo</div>
                <h3>Promo Codes</h3>
                <p>Available discounts and offers</p>
                <button className="card-button secondary">View Promos</button>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">Profile</div>
                <h3>Profile Settings</h3>
                <p>Update your account information</p>
                <button className="card-button secondary">Edit Profile</button>
              </div>
            </div>

            <div className="quick-stats">
              <div className="stat-card">
                <div className="stat-number">0</div>
                <div className="stat-label">Total Rides</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">0 BDT</div>
                <div className="stat-label">Total Spent</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">5.0</div>
                <div className="stat-label">Your Rating</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">Active</div>
                <div className="stat-label">Account</div>
              </div>
            </div>
          </>
        )}

        {/* === PHASE: BOOKING === */}
        {ridePhase === 'booking' && (
          <div>
            <div className="dashboard-header">
              <div>
                <h1>Book a Ride</h1>
                <p>Set your pickup and dropoff locations</p>
              </div>
            </div>

            <div className="booking-form">
              <div className="form-group">
                <label>Pickup Address</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={pickupAddr}
                    onChange={(e) => setPickupAddr(e.target.value)}
                    placeholder="Enter pickup address"
                  />
                  <button
                    onClick={handleUseMyLocation}
                    className="location-btn"
                  >
                    Use My Location
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Dropoff Address</label>
                <input
                  type="text"
                  value={dropoffAddr}
                  onChange={(e) => setDropoffAddr(e.target.value)}
                  placeholder="Enter dropoff address"
                />
              </div>
            </div>

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
            <p className="map-hint">
              Click on the map to set your {clickMode} location
              {pickupCoords && !dropoffCoords && ' (now set your dropoff)'}
            </p>

            <BookingMap
              pickupLocation={pickupCoords}
              dropoffLocation={dropoffCoords}
              onMapClick={handleMapClick}
              centerLocation={userLocation}
            />

            <div className="booking-actions">
              <button onClick={resetBooking}>Back</button>
              <button
                onClick={handleGetEstimate}
                disabled={!pickupCoords || !dropoffCoords || !pickupAddr.trim() || !dropoffAddr.trim() || loading}
              >
                {loading ? 'Calculating...' : 'Get Fare Estimate'}
              </button>
            </div>
          </div>
        )}

        {/* === PHASE: CONFIRMING === */}
        {ridePhase === 'confirming' && fareEstimate && (
          <div className="confirm-panel">
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
                <strong>{fareEstimate.distance_km} km</strong>
              </div>
              <div className="summary-row">
                <span>Est. Duration</span>
                <strong>{fareEstimate.estimated_duration_min} min</strong>
              </div>
              <div className="summary-row fare">
                <span>Estimated Fare</span>
                <strong>{fareEstimate.estimated_fare} BDT</strong>
              </div>
            </div>
            <div className="booking-actions">
              <button onClick={() => setRidePhase('booking')}>Back</button>
              <button onClick={handleConfirmRide} disabled={loading}>
                {loading ? 'Requesting...' : 'Confirm Ride'}
              </button>
            </div>
          </div>
        )}

        {/* === PHASE: SEARCHING === */}
        {ridePhase === 'searching' && (
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
              onClick={handleCancelRequest}
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
        )}

        {/* === PHASE: MATCHED === */}
        {ridePhase === 'matched' && activeRide && (
          <div className="ride-active-panel">
            <h2>Driver Found!</h2>
            <div className="driver-info">
              <h3>{activeRide.driver_name}</h3>
              {activeRide.driver_phone && (
                <p>Phone: {activeRide.driver_phone}</p>
              )}
              {activeRide.driver_rating && (
                <p>Rating: {activeRide.driver_rating}/5</p>
              )}
              {activeRide.vehicle_model && (
                <p>Vehicle: {activeRide.vehicle_model}</p>
              )}
              {activeRide.vehicle_plate && (
                <p>Plate: {activeRide.vehicle_plate}</p>
              )}
            </div>
            <div className="ride-summary">
              <div className="summary-row">
                <span>From</span>
                <strong>{activeRide.pickup_addr}</strong>
              </div>
              <div className="summary-row">
                <span>To</span>
                <strong>{activeRide.dropoff_addr}</strong>
              </div>
              <div className="summary-row fare">
                <span>Fare</span>
                <strong>{activeRide.estimated_fare} BDT</strong>
              </div>
            </div>
            <span className="status-badge">Driver is on the way</span>
          </div>
        )}

        {/* === PHASE: IN PROGRESS === */}
        {ridePhase === 'in_progress' && activeRide && (
          <div className="ride-active-panel">
            <h2>Ride in Progress</h2>
            <div className="driver-info">
              <h3>{activeRide.driver_name}</h3>
              {activeRide.driver_phone && (
                <p>Phone: {activeRide.driver_phone}</p>
              )}
              {activeRide.vehicle_model && (
                <p>Vehicle: {activeRide.vehicle_model}</p>
              )}
              {activeRide.vehicle_plate && (
                <p>Plate: {activeRide.vehicle_plate}</p>
              )}
            </div>
            <div className="ride-summary">
              <div className="summary-row">
                <span>From</span>
                <strong>{activeRide.pickup_addr}</strong>
              </div>
              <div className="summary-row">
                <span>To</span>
                <strong>{activeRide.dropoff_addr}</strong>
              </div>
              <div className="summary-row fare">
                <span>Fare</span>
                <strong>{activeRide.estimated_fare} BDT</strong>
              </div>
            </div>
            <span className="status-badge active">Ride started</span>
          </div>
        )}

        {/* === PHASE: COMPLETED === */}
        {ridePhase === 'completed' && activeRide && (
          <div className="completion-panel">
            <h2>Ride Complete!</h2>
            <div className="fare-amount">
              {activeRide.final_fare || activeRide.estimated_fare} BDT
            </div>
            <p style={{ color: '#6B6B6B', fontSize: '14px', marginBottom: '4px' }}>
              Driver: {activeRide.driver_name}
            </p>
            <p style={{ color: '#6B6B6B', fontSize: '14px', marginBottom: '24px' }}>
              {activeRide.pickup_addr || activeRequest?.pickup_addr} → {activeRide.dropoff_addr || activeRequest?.dropoff_addr}
            </p>
            <button
              onClick={resetBooking}
              style={{
                padding: '14px 28px',
                background: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '15px',
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RiderDashboard;
