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
    resetBooking, error, setError, loading, userLocation, riderLocation,
    routePath, routeInfo, routeLoading, stopPolling,
  } = useRide();
  const { clearRoute, fetchRoutePreview } = useRoute();

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
