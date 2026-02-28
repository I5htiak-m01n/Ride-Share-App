import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ridesAPI } from '../api/client';
import RideMap from '../components/RideMap';
import './Dashboard.css';

const NEARBY_POLL_MS   = 10000;
const LOCATION_SYNC_MS = 15000;

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
      setMapError(err.response?.data?.error || 'Failed to accept ride');
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

      <div className="dashboard-content">
        <div className="dashboard-header">
          <h1>Driver Dashboard</h1>
          <div className="driver-status">
            <button
              onClick={toggleOnline}
              className={`status-toggle ${isOnline ? 'online' : 'offline'}`}
            >
              {isOnline ? 'Online — Accepting Rides' : 'Offline — Tap to Go Online'}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {locationError && (
          <div style={{ background: '#FFF0EE', color: '#E11900', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', borderLeft: '3px solid #E11900' }}>
            {locationError}
          </div>
        )}
        {mapError && (
          <div style={{ background: '#FFF0EE', color: '#E11900', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', borderLeft: '3px solid #E11900' }}>
            {mapError}
          </div>
        )}

        {/* Active Ride Panel */}
        {activeRide && (
          <div style={{ background: '#F6F6F6', border: '2px solid #000', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px', color: '#000' }}>Active Ride</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: '14px', marginBottom: '16px' }}>
              <p style={{ margin: 0, color: '#6B6B6B' }}>Rider</p>
              <p style={{ margin: 0, fontWeight: 600 }}>{activeRide.rider_name}</p>
              <p style={{ margin: 0, color: '#6B6B6B' }}>From</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{activeRide.ride?.pickup_addr}</p>
              <p style={{ margin: 0, color: '#6B6B6B' }}>To</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{activeRide.ride?.dropoff_addr}</p>
              <p style={{ margin: 0, color: '#6B6B6B' }}>Fare</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '16px' }}>{activeRide.estimated_fare} BDT</p>
              <p style={{ margin: 0, color: '#6B6B6B' }}>Status</p>
              <p style={{ margin: 0, fontWeight: 600, textTransform: 'capitalize' }}>{activeRide.ride?.status?.replace('_', ' ')}</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {activeRide.ride?.status === 'driver_assigned' && (
                <button onClick={() => handleUpdateStatus('started')}
                  style={{ padding: '12px 24px', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
                  Start Ride
                </button>
              )}
              {activeRide.ride?.status === 'started' && (
                <button onClick={() => handleUpdateStatus('completed')}
                  style={{ padding: '12px 24px', background: '#05944F', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
                  Complete Ride
                </button>
              )}
              <button onClick={() => handleUpdateStatus('cancelled')}
                style={{ padding: '12px 24px', background: '#fff', color: '#E11900', border: '1px solid #E2E2E2', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '14px' }}>
                Cancel Ride
              </button>
            </div>
          </div>
        )}

        {/* Map */}
        {(isOnline || activeRide) && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>
                {isOnline ? `Nearby Requests (${nearbyRequests.length})` : 'Active Ride Map'}
              </h3>
              {isOnline && driverLocation && (
                <span style={{ fontSize: '12px', color: '#6B6B6B' }}>
                  Auto-refreshing
                </span>
              )}
            </div>

            {isOnline && !driverLocation && !locationError && (
              <div style={{ padding: '24px', textAlign: 'center', background: '#F6F6F6', borderRadius: '12px', color: '#6B6B6B', fontSize: '14px' }}>
                Waiting for GPS location...
              </div>
            )}

            {(driverLocation || activeRide) && (
              <RideMap
                driverLocation={driverLocation}
                rideRequests={nearbyRequests}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            )}

            {isOnline && driverLocation && nearbyRequests.length === 0 && (
              <p style={{ textAlign: 'center', color: '#6B6B6B', marginTop: '12px', fontSize: '14px' }}>
                No ride requests within 5 km. Waiting...
              </p>
            )}
          </div>
        )}

        {/* Dashboard cards */}
        <div className="dashboard-grid">
          <div className="dashboard-card primary-card">
            <div className="card-icon">Rides</div>
            <h3>Ride Requests</h3>
            <p>{isOnline ? `${nearbyRequests.length} nearby` : 'Go online to see nearby requests'}</p>
            <button className="card-button" disabled={!isOnline}>
              {isOnline ? 'Shown on map above' : 'Go Online First'}
            </button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">Active</div>
            <h3>Active Ride</h3>
            <p>{activeRide ? `In progress` : 'No active ride'}</p>
            <button className="card-button secondary" disabled={!activeRide}>
              {activeRide ? 'In Progress' : 'No Active Ride'}
            </button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">Earn</div>
            <h3>Earnings</h3>
            <p>Today: 0 BDT | Total: 0 BDT</p>
            <button className="card-button secondary">View Earnings</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">Cars</div>
            <h3>My Vehicles</h3>
            <p>Manage your registered vehicles</p>
            <button className="card-button secondary">Manage Vehicles</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">Docs</div>
            <h3>Documents</h3>
            <p>Upload and verify your documents</p>
            <button className="card-button secondary">Upload Docs</button>
          </div>

          <div className="dashboard-card">
            <div className="card-icon">Stats</div>
            <h3>Performance</h3>
            <p>View your ratings and statistics</p>
            <button className="card-button secondary">View Stats</button>
          </div>
        </div>

        <div className="quick-stats">
          <div className="stat-card">
            <div className="stat-number">0</div>
            <div className="stat-label">Rides Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">0 BDT</div>
            <div className="stat-label">Total Earned</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">5.0</div>
            <div className="stat-label">Driver Rating</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{isOnline ? 'Online' : 'Offline'}</div>
            <div className="stat-label">Status</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DriverDashboard;
