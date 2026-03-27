import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import { haversineDistance, formatDistance } from '../utils/geo';
import RideMap from '../components/RideMap';
import ChatPanel from '../components/ChatPanel';
import RatingModal from '../components/RatingModal';
import CancelConfirmModal from '../components/CancelConfirmModal';
import CancelReasonForm from '../components/CancelReasonFormDriver';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function DriverRidePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    driverPhase,
    driverLocation, locationError,
    activeRide,
    error,
    userRating,
    updateRideStatus,
    routePath, routeInfo, routeLoading, eta, wasRerouted,
    // Rating modal
    showRatingModal, ratingTarget, ratingLoading,
    handleSubmitRating, handleSkipRating,
    // Cancellation
    showCancelConfirm, showCancelReason, cancelFee, cancelLoading,
    initiateCancelRide, confirmCancelRide, submitCancelReason, abortCancel,
    handleMutualCancellation,
  } = useDriver();

  // Route guard: must be in ride_started phase
  useEffect(() => {
    if (driverPhase === 'offline' || driverPhase === 'online') {
      navigate('/driver/dashboard', { replace: true });
    } else if (driverPhase === 'ride_accepted') {
      navigate('/driver/pickup', { replace: true });
    }
  }, [driverPhase, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const [proximityWarning, setProximityWarning] = useState(null);

  // Distance to dropoff for completion check
  const distanceToDropoff = useMemo(() => {
    if (!driverLocation || !activeRide?.ride?.dropoff_lat) return null;
    return haversineDistance(
      driverLocation.lat, driverLocation.lng,
      parseFloat(activeRide.ride.dropoff_lat), parseFloat(activeRide.ride.dropoff_lng)
    );
  }, [driverLocation, activeRide]);

  const handleCompleteRide = () => {
    if (distanceToDropoff !== null && distanceToDropoff > 100) {
      setProximityWarning(`You must be within 100m of the dropoff to complete. Currently ${formatDistance(distanceToDropoff)} away.`);
      return;
    }
    setProximityWarning(null);
    updateRideStatus('completed');
  };

  if (!activeRide) return null;

  return (
    <div className="dashboard-container">
      <NavBar
        brandText="RideShare Driver"
        showNotifications
        ratingAvg={userRating.rating_avg}
        ratingCount={userRating.rating_count}
      />

      <div className="uber-split-layout">
        {/* Left Panel: Ride Details */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            <button
              onClick={() => navigate('/driver/dashboard')}
              className="page-back-btn"
            >
              &larr; Back
            </button>
            <div className="uber-greeting">
              <h1>Ride in Progress</h1>
              <p>Navigate to the dropoff location</p>
            </div>

            {locationError && <div className="uber-panel-alert">{locationError}</div>}
            {error && <div className="uber-panel-alert">{error}</div>}

            <div className="uber-active-ride-panel">
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
                <strong style={{ color: '#05944F' }}>Ride started</strong>
              </div>
              {/* Distance to dropoff during ride — prefer route-based ETA distance */}
              {(eta?.remaining_meters != null || distanceToDropoff !== null) && (
                <div className="ride-detail-row">
                  <span>Distance to dropoff</span>
                  <strong style={{ color: (distanceToDropoff !== null && distanceToDropoff <= 100) ? '#05944F' : '#E11900' }}>
                    {eta?.remaining_meters != null
                      ? formatDistance(eta.remaining_meters)
                      : formatDistance(distanceToDropoff)}
                  </strong>
                </div>
              )}
              {eta && (
                <div className="ride-detail-row">
                  <span>ETA</span>
                  <strong>{eta?.remaining_text ?? ''}</strong>
                </div>
              )}

              {proximityWarning && (
                <div className="uber-panel-alert" style={{ marginTop: 8 }}>{proximityWarning}</div>
              )}

              <div className="ride-actions">
                <button
                  onClick={handleCompleteRide}
                  style={{ background: '#05944F', color: '#fff', border: 'none' }}
                >
                  Complete Ride
                </button>
                <button
                  onClick={initiateCancelRide}
                  style={{ background: '#fff', color: '#E11900', border: '1px solid #E2E2E2' }}
                >
                  Cancel Ride
                </button>
              </div>

              <ChatPanel
                rideId={activeRide.ride.ride_id}
                currentUserId={user.user_id}
                otherName={activeRide.rider_name}
                onRideCancelled={handleMutualCancellation}
              />
            </div>
          </div>
        </div>

        {/* Right Panel: RideMap with ride route */}
        <div className="uber-right-map">
          <div className="uber-ridemap-wrapper">
            {driverLocation ? (
              <RideMap
                driverLocation={driverLocation}
                rideRequests={[]}
                onAccept={() => {}}
                onReject={() => {}}
                routePath={routePath}
                routeInfo={routeInfo}
                routeLoading={routeLoading}
                eta={eta}
                wasRerouted={wasRerouted}
                pickupLocation={activeRide.ride?.pickup_lat ? {
                  lat: parseFloat(activeRide.ride.pickup_lat),
                  lng: parseFloat(activeRide.ride.pickup_lng)
                } : null}
                dropoffLocation={activeRide.ride?.dropoff_lat ? {
                  lat: parseFloat(activeRide.ride.dropoff_lat),
                  lng: parseFloat(activeRide.ride.dropoff_lng)
                } : null}
                rideStatus="started"
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', color: '#6B6B6B', fontSize: '14px' }}>
                Waiting for GPS location...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rating Modal */}
      {showRatingModal && ratingTarget && (
        <RatingModal
          rateeName={ratingTarget.rateeName}
          onSubmit={handleSubmitRating}
          onSkip={handleSkipRating}
          loading={ratingLoading}
        />
      )}

      {/* Cancel Modals */}
      {showCancelConfirm && (
        <CancelConfirmModal
          fee={cancelFee}
          onConfirm={confirmCancelRide}
          onCancel={abortCancel}
        />
      )}
      {showCancelReason && (
        <CancelReasonForm
          onSubmit={submitCancelReason}
          loading={cancelLoading}
        />
      )}
    </div>
  );
}

export default DriverRidePage;
