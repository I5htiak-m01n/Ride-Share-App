import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ridesAPI } from '../api/client';
import BookingMap from '../components/BookingMap';
import RideMap from '../components/RideMap';
import './Dashboard.css';

const NEARBY_POLL_MS   = 10000;
const LOCATION_SYNC_MS = 15000;

// Generate random nearby vehicles around a center point
function generateNearbyVehicles(center, count = 5) {
  const vehicles = [];
  for (let i = 0; i < count; i++) {
    vehicles.push({
      lat: center.lat + (Math.random() - 0.5) * 0.02,
      lng: center.lng + (Math.random() - 0.5) * 0.02,
      rotation: Math.floor(Math.random() * 360),
    });
  }
  return vehicles;
}

function DriverDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [isOnline, setIsOnline]             = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [nearbyRequests, setNearbyRequests] = useState([]);
  const [activeRide, setActiveRide]         = useState(null);
  const [locationError, setLocationError]   = useState(null);
  const [mapError, setMapError]             = useState(null);

  const watchIdRef          = useRef(null);
  const nearbyIntervalRef   = useRef(null);
  const locationIntervalRef = useRef(null);
  const currentLocationRef  = useRef(null);

  // Simulated vehicles for idle map
  const fakeVehicles = useMemo(() => {
    const center = driverLocation || { lat: 23.8103, lng: 90.4125 };
    return generateNearbyVehicles(center, 5);
  }, [driverLocation]);

  const fetchNearby = useCallback(async () => {
    const loc = currentLocationRef.current;
    if (!loc) return;
    try {
      const res = await ridesAPI.getNearby(loc.lat, loc.lng);
      setNearbyRequests(res.data.requests || []);
      setMapError(null);
    } catch (err) {
      console.error('fetchNearby error:', err);
    }
  }, []);

  const syncLocation = useCallback(async () => {
    const loc = currentLocationRef.current;
    if (!loc) return;
    try {
      await ridesAPI.updateLocation(loc.lat, loc.lng);
    } catch (err) {
      console.error('syncLocation error:', err);
    }
  }, []);

  const startOnlineMode = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }
    setLocationError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        currentLocationRef.current = loc;
        setDriverLocation(loc);
      },
      () => {
        setLocationError('Location access denied. Please allow location in browser settings.');
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    setTimeout(fetchNearby, 500);
    setTimeout(syncLocation, 500);
    nearbyIntervalRef.current   = setInterval(fetchNearby,  NEARBY_POLL_MS);
    locationIntervalRef.current = setInterval(syncLocation, LOCATION_SYNC_MS);
  }, [fetchNearby, syncLocation]);

  const stopOnlineMode = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearInterval(nearbyIntervalRef.current);
    clearInterval(locationIntervalRef.current);
    setNearbyRequests([]);
  }, []);

  useEffect(() => () => stopOnlineMode(), [stopOnlineMode]);

  // Get location on mount even when offline (for idle map)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setDriverLocation(loc);
          currentLocationRef.current = loc;
        },
        () => {}
      );
    }
  }, []);

  const toggleOnline = () => {
    const next = !isOnline;
    setIsOnline(next);
    if (next) startOnlineMode();
    else stopOnlineMode();
  };

  const handleAccept = async (requestId) => {
    try {
      const res = await ridesAPI.acceptRequest(requestId);
      setActiveRide(res.data);
      stopOnlineMode();
      setIsOnline(false);
      setMapError(null);
    } catch (err) {
      const errData = err.response?.data;
      setMapError(errData?.details || errData?.error || 'Failed to accept ride');
    }
  };

  const handleReject = async (requestId) => {
    try {
      await ridesAPI.rejectRequest(requestId);
      setNearbyRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    } catch (err) {
      console.error('rejectRequest error:', err);
    }
  };

  const handleUpdateStatus = async (status) => {
    if (!activeRide?.ride?.ride_id) return;
    try {
      const res = await ridesAPI.updateStatus(activeRide.ride.ride_id, status);
      if (status === 'completed' || status === 'cancelled') {
        setActiveRide(null);
      } else {
        setActiveRide((prev) => ({ ...prev, ride: res.data.ride }));
      }
    } catch (err) {
      console.error('updateStatus error:', err);
    }
  };

  const handleLogout = async () => {
    stopOnlineMode();
    await logout();
    navigate('/login');
  };

  // Show full-screen map when offline (idle) with no active ride
  const showIdleMap = !isOnline && !activeRide;
  // Show RideMap when online or have active ride
  const showRideMap = isOnline || activeRide;

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare Driver</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'Driver'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="uber-split-layout">
        {/* === Left Panel: Controls === */}
        <div className="uber-left-panel">
          <div className="uber-greeting">
            <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name || 'Driver'}</h1>
            <p>{isOnline ? 'You are online and accepting rides' : 'Go online to start accepting rides'}</p>
          </div>

          {/* Alerts */}
          {locationError && (
            <div className="uber-panel-alert">{locationError}</div>
          )}
          {mapError && (
            <div className="uber-panel-alert">{mapError}</div>
          )}

          {/* Online/Offline toggle */}
          <div className="uber-status-section">
            <button
              onClick={toggleOnline}
              className={`status-toggle ${isOnline ? 'online' : 'offline'}`}
            >
              {isOnline ? 'Online — Accepting Rides' : 'Tap to Go Online'}
            </button>
          </div>

          {/* Active ride panel */}
          {activeRide && (
            <div className="uber-active-ride-panel">
              <h3>Active Ride</h3>
              <div className="ride-detail-row">
                <span>Rider</span>
                <strong>{activeRide.rider_name}</strong>
              </div>
              <div className="ride-detail-row">
                <span>From</span>
                <strong>{activeRide.ride?.pickup_addr}</strong>
              </div>
              <div className="ride-detail-row">
                <span>To</span>
                <strong>{activeRide.ride?.dropoff_addr}</strong>
              </div>
              <div className="ride-detail-row">
                <span>Fare</span>
                <strong>{activeRide.estimated_fare} BDT</strong>
              </div>
              <div className="ride-detail-row">
                <span>Status</span>
                <strong style={{ textTransform: 'capitalize' }}>{activeRide.ride?.status?.replace('_', ' ')}</strong>
              </div>
              <div className="ride-actions">
                {activeRide.ride?.status === 'driver_assigned' && (
                  <button
                    onClick={() => handleUpdateStatus('started')}
                    style={{ background: '#000', color: '#fff', border: 'none' }}
                  >
                    Start Ride
                  </button>
                )}
                {activeRide.ride?.status === 'started' && (
                  <button
                    onClick={() => handleUpdateStatus('completed')}
                    style={{ background: '#05944F', color: '#fff', border: 'none' }}
                  >
                    Complete Ride
                  </button>
                )}
                <button
                  onClick={() => handleUpdateStatus('cancelled')}
                  style={{ background: '#fff', color: '#E11900', border: '1px solid #E2E2E2' }}
                >
                  Cancel Ride
                </button>
              </div>
            </div>
          )}

          {/* Nearby requests list (when online) */}
          {isOnline && !activeRide && nearbyRequests.length > 0 && (
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
                    <button className="reject-btn" onClick={() => handleReject(req.request_id)}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Waiting message */}
          {isOnline && !activeRide && nearbyRequests.length === 0 && driverLocation && (
            <p className="uber-waiting-text">No ride requests within 5 km. Waiting...</p>
          )}

          {/* Quick actions */}
          {!activeRide && (
            <div className="uber-quick-actions">
              <div className="uber-quick-card" onClick={() => navigate('/driver/history')}>
                <div className="card-icon">&#128176;</div>
                <div>
                  <h4>Earnings</h4>
                  <p>View your ride history</p>
                </div>
              </div>
              <div className="uber-quick-card" onClick={() => navigate('/driver/documents')}>
                <div className="card-icon">&#128196;</div>
                <div>
                  <h4>Documents</h4>
                  <p>Manage your documents</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* === Right Panel: Map === */}
        <div className="uber-right-map">
          {(isOnline || activeRide) ? (
            <div className="uber-ridemap-wrapper">
              {driverLocation ? (
                <RideMap
                  driverLocation={driverLocation}
                  rideRequests={nearbyRequests}
                  onAccept={handleAccept}
                  onReject={handleReject}
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', color: '#6B6B6B', fontSize: '14px' }}>
                  Waiting for GPS location...
                </div>
              )}
            </div>
          ) : (
            <BookingMap
              fullscreen
              userLocation={driverLocation}
              nearbyVehicles={fakeVehicles}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default DriverDashboard;
