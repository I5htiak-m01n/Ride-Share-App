import { useEffect, useState, useMemo, useRef } from 'react';
// import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import { ridesAPI } from '../api/client';
import { decodePolyline } from '../utils/polyline';
import { haversineDistance, formatDistance, estimateTime } from '../utils/geo';
import RideMap from '../components/RideMap';
import ChatPanel from '../components/ChatPanel';
import CancelConfirmModal from '../components/CancelConfirmModal';
import CancelReasonForm from '../components/CancelReasonFormDriver';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function DriverPickupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    driverPhase,
    driverLocation, locationError,
    activeRide,
    riderLocation, riderToPickupDistance, proximityToPickup,
    error,
    userRating,
    updateRideStatus,
    routePath, routeInfo, routeLoading, eta, wasRerouted,
    showCancelConfirm, showCancelReason, cancelFee, cancelLoading,
    initiateCancelRide, confirmCancelRide, submitCancelReason, abortCancel,
    handleMutualCancellation,
  } = useDriver();

  // Route guard: must be in ride_accepted phase
  useEffect(() => {
    if (driverPhase === 'offline' || driverPhase === 'online') {
      navigate('/driver/dashboard', { replace: true });
    } else if (driverPhase === 'ride_started') {
      navigate('/driver/ride', { replace: true });
    }
  }, [driverPhase, navigate]);

  const [proximityWarning, setProximityWarning] = useState(null);

  // Phase-specific routes for RideMap
  const [driverToPickupRoute, setDriverToPickupRoute] = useState(null);

  // Fetch driver→pickup route
  useEffect(() => {
    if (activeRide?.ride?.status !== 'driver_assigned' || !driverLocation || !activeRide.ride.pickup_lat) return;
    let cancelled = false;
    ridesAPI.getDirections(
      driverLocation.lat, driverLocation.lng,
      parseFloat(activeRide.ride.pickup_lat), parseFloat(activeRide.ride.pickup_lng)
    ).then((res) => {
      if (!cancelled && res.data.route?.overview_polyline) {
        setDriverToPickupRoute(decodePolyline(res.data.route.overview_polyline));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeRide?.ride?.status, driverLocation, activeRide?.ride?.pickup_lat, activeRide?.ride?.pickup_lng]);


  const handleStartRide = () => {
    // DUAL-PROXIMITY VALIDATION: both driver AND rider must be within 100m of pickup
    if (!proximityToPickup || proximityToPickup.distance > 100) {
      setProximityWarning(
        `You must be within 100m of pickup. Currently ${formatDistance(proximityToPickup?.distance || 0)} away (~${proximityToPickup?.time || '?'} min).`
      );
      return;
    }
    if (riderLocation && activeRide?.ride?.pickup_lat) {
      const riderDist = haversineDistance(
        riderLocation.lat, riderLocation.lng,
        parseFloat(activeRide.ride.pickup_lat),
        parseFloat(activeRide.ride.pickup_lng)
      );
      if (riderDist > 100) {
        setProximityWarning(
          `Waiting for rider to arrive at pickup. Rider is ${formatDistance(riderDist)} away (~${estimateTime(riderDist / 1000)} min).`
        );
        return;
      }
    }
    setProximityWarning(null);
    updateRideStatus('started');
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
        {/* Left Panel: Pickup Details */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            <button
              onClick={() => navigate('/driver/dashboard')}
              className="page-back-btn"
            >
              &larr; Back
            </button>
            <div className="uber-greeting">
              <h1>Go to Pickup</h1>
              <p>Navigate to the rider's pickup location</p>
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

              {/* Proximity info — driver to pickup */}
              {proximityToPickup && (
                <div className="ride-detail-row">
                  <span>You → Pickup</span>
                  <strong style={{ color: proximityToPickup.withinProximity ? '#05944F' : '#E11900' }}>
                    {formatDistance(proximityToPickup.distance)} (~{proximityToPickup.time} min)
                  </strong>
                </div>
              )}
              {/* Rider location info — rider to pickup */}
              {/* {riderToPickupDistance !== null && (
                <div className="ride-detail-row">
                  <span>Rider → Pickup</span>
                  <strong style={{ color: riderToPickupDistance <= 100 ? '#05944F' : '#F5A623' }}>
                    {formatDistance(riderToPickupDistance)} (~{estimateTime(riderToPickupDistance / 1000)} min)
                  </strong>
                </div>
              )} */}

              {proximityWarning && (
                <div className="uber-panel-alert" style={{ marginTop: 8 }}>{proximityWarning}</div>
              )}

              <div className="ride-actions">
                <button
                  onClick={handleStartRide}
                  style={{ background: '#000', color: '#fff', border: 'none' }}
                >
                  Start Ride
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

        {/* Right Panel: RideMap with pickup routes */}
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
                rideStatus="driver_assigned"
                driverToPickupRoute={driverToPickupRoute}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', color: '#6B6B6B', fontSize: '14px' }}>
                Waiting for GPS location...
              </div>
            )}
          </div>
        </div>
      </div>

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

export default DriverPickupPage;
