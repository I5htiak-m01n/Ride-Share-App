import { useEffect, useState } from 'react';
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
    resetBooking, error, setError, loading, userLocation,
    routePath, routeInfo, routeLoading, stopPolling,
  } = useRide();
  const { clearRoute } = useRoute();

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

      <div className="dashboard-content">
        {error && <div className="error-banner">{error}</div>}

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
                <button onClick={handleUseMyLocation} className="location-btn">
                  Use My Location
                </button>
              </div>
              <div className="saved-places-trigger" onClick={() => openSavedPlaces('pickup')}>
                <span className="saved-places-icon">&#9733;</span> Saved places
              </div>
            </div>
            <div className="form-group">
              <label>Dropoff Address</label>
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
              <div className="saved-places-trigger" onClick={() => openSavedPlaces('dropoff')}>
                <span className="saved-places-icon">&#9733;</span> Saved places
              </div>
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
            panTo={mapCenter}
            routePath={routePath}
            routeInfo={routeInfo}
            routeLoading={routeLoading}
          />

          <div className="booking-actions">
            <button onClick={handleBack}>Back</button>
            <button
              onClick={handleGetEstimate}
              disabled={!pickupCoords || !dropoffCoords || !pickupAddr.trim() || !dropoffAddr.trim() || loading}
            >
              {loading ? 'Calculating...' : 'Get Fare Estimate'}
            </button>
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
