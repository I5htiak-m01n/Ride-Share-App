import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import { ridesAPI } from '../api/client';
import { decodePolyline } from '../utils/polyline';
import { haversineDistance, formatDistance, estimateTime } from '../utils/geo';
import BookingMap from '../components/BookingMap';
import ChatPanel from '../components/ChatPanel';
import CancelConfirmModal from '../components/CancelConfirmModal';
import CancelReasonForm from '../components/CancelReasonFormRider';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function RiderPickupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    ridePhase,
    error,
    activeRequest, activeRide,
    stopPolling,
    routePath, routeInfo, eta, wasRerouted, routeLoading,
    driverLocation, userLocation, userRating,
    showCancelConfirm, showCancelReason, cancelFee, cancelLoading,
    initiateCancelRide, confirmCancelRide, submitCancelReason, abortCancel,
    handleMutualCancellation,
  } = useRide();

  // Route guard
  useEffect(() => {
    if (ridePhase === 'idle') {
      navigate('/rider/dashboard', { replace: true });
    } else if (ridePhase === 'booking') {
      navigate('/rider/book', { replace: true });
    } else if (ridePhase === 'confirming') {
      navigate('/rider/confirm', { replace: true });
    } else if (ridePhase === 'searching') {
      navigate('/rider/searching', { replace: true });
    } else if (ridePhase === 'in_progress' || ridePhase === 'completed') {
      navigate('/rider/ride', { replace: true });
    }
  }, [ridePhase, navigate]);

  // Phase-specific routes for BookingMap
  const [driverToPickupRoute, setDriverToPickupRoute] = useState(null);
  const [riderToPickupRoute, setRiderToPickupRoute] = useState(null);

  // Fetch driver→pickup route during matched phase
  useEffect(() => {
    if (ridePhase !== 'matched' || !driverLocation || !activeRequest) return;
    let cancelled = false;
    ridesAPI.getDirections(
      driverLocation.lat, driverLocation.lng,
      parseFloat(activeRequest.pickup_lat), parseFloat(activeRequest.pickup_lng)
    ).then((res) => {
      if (!cancelled && res.data.route?.overview_polyline) {
        setDriverToPickupRoute(decodePolyline(res.data.route.overview_polyline));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ridePhase, driverLocation, activeRequest]);

  // Fetch rider→pickup route during matched phase
  useEffect(() => {
    if (ridePhase !== 'matched' || !userLocation || !activeRequest) return;
    let cancelled = false;
    ridesAPI.getDirections(
      userLocation.lat, userLocation.lng,
      parseFloat(activeRequest.pickup_lat), parseFloat(activeRequest.pickup_lng),
      'walking'
    ).then((res) => {
      if (!cancelled && res.data.route?.overview_polyline) {
        setRiderToPickupRoute(decodePolyline(res.data.route.overview_polyline));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ridePhase, userLocation, activeRequest]);

  // Distance computations
  const driverToPickupInfo = useMemo(() => {
    if (ridePhase !== 'matched' || !driverLocation || !activeRequest) return null;
    const dist = haversineDistance(
      driverLocation.lat, driverLocation.lng,
      parseFloat(activeRequest.pickup_lat), parseFloat(activeRequest.pickup_lng)
    );
    return { distance: dist, time: estimateTime(dist / 1000) };
  }, [ridePhase, driverLocation, activeRequest]);

  const riderToPickupInfo = useMemo(() => {
    if (ridePhase !== 'matched' || !userLocation || !activeRequest) return null;
    const dist = haversineDistance(
      userLocation.lat, userLocation.lng,
      parseFloat(activeRequest.pickup_lat), parseFloat(activeRequest.pickup_lng)
    );
    return { distance: dist, time: estimateTime(dist / 1000) };
  }, [ridePhase, userLocation, activeRequest]);

  // Route-based rider→pickup distance (fetched from directions API)
  const [riderRouteToPickup, setRiderRouteToPickup] = useState(null);
  const lastRiderRouteFetchRef = useRef(0);

  useEffect(() => {
    if (ridePhase !== 'matched' || !userLocation || !activeRequest?.pickup_lat) return;
    // Throttle: skip if last fetch was < 30s ago
    const now = Date.now();
    if (now - lastRiderRouteFetchRef.current < 30000) return;
    lastRiderRouteFetchRef.current = now;

    let cancelled = false;
    ridesAPI.getDirections(
      userLocation.lat, userLocation.lng,
      parseFloat(activeRequest.pickup_lat), parseFloat(activeRequest.pickup_lng),
      'walking'
    ).then((res) => {
      if (!cancelled && res.data.route) {
        setRiderRouteToPickup({
          distance: res.data.route.distance_meters,
          distance_text: res.data.route.distance_text,
          duration_text: res.data.route.duration_text,
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ridePhase, userLocation, activeRequest]);

  if (!activeRide) return null;

  return (
    <div className="dashboard-container">
      <NavBar
        showNotifications
        ratingAvg={userRating.rating_avg}
        ratingCount={userRating.rating_count}
      />

      <div className="uber-split-layout">
        {/* Left Panel: Pickup Details */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            <button
              onClick={() => navigate('/rider/dashboard')}
              className="page-back-btn"
              style={{ marginBottom: 12 }}
            >
              &larr; Back
            </button>
            {error && <div className="uber-panel-alert">{error}</div>}

            <div className="uber-greeting">
              <h1>Driver Found!</h1>
              <p>Your driver is on the way</p>
            </div>

            <div className="uber-active-ride-panel">
              <div className="ride-detail-row">
                <span>Driver</span>
                <strong>{activeRide.driver_name}</strong>
              </div>
              {activeRide.driver_phone && (
                <div className="ride-detail-row">
                  <span>Phone</span>
                  <strong>{activeRide.driver_phone}</strong>
                </div>
              )}
              {activeRide.driver_rating && (
                <div className="ride-detail-row">
                  <span>Rating</span>
                  <strong>{activeRide.driver_rating}/5</strong>
                </div>
              )}
              {activeRide.vehicle_model && (
                <div className="ride-detail-row">
                  <span>Vehicle</span>
                  <strong>{activeRide.vehicle_model}</strong>
                </div>
              )}
              {activeRide.vehicle_plate && (
                <div className="ride-detail-row">
                  <span>Plate</span>
                  <strong>{activeRide.vehicle_plate}</strong>
                </div>
              )}
              <div className="ride-detail-row">
                <span>From</span>
                <strong>{activeRide.pickup_addr}</strong>
              </div>
              <div className="ride-detail-row">
                <span>To</span>
                <strong>{activeRide.dropoff_addr}</strong>
              </div>
              <div className="ride-detail-row">
                <span>Fare</span>
                <strong>{activeRide.estimated_fare} BDT</strong>
              </div>
              <div className="ride-detail-row">
                <span>Status</span>
                <strong style={{ color: '#05944F' }}>Driver is on the way</strong>
              </div>
              {(eta || driverToPickupInfo) && (
                <div className="ride-detail-row">
                  <span>Driver ETA</span>
                  <strong>
                    {eta?.remaining_meters != null
                      ? `${formatDistance(eta.remaining_meters)} (~${eta.remaining_text})`
                      : `${formatDistance(driverToPickupInfo.distance)} (~${driverToPickupInfo.time} min)`}
                  </strong>
                </div>
              )}
              {(riderRouteToPickup || riderToPickupInfo) && (
                <div className="ride-detail-row">
                  <span>You → Pickup</span>
                  <strong>
                    {riderRouteToPickup
                      ? `${riderRouteToPickup.distance_text} (~${riderRouteToPickup.duration_text})`
                      : `${formatDistance(riderToPickupInfo.distance)} (~${riderToPickupInfo.time} min)`}
                  </strong>
                </div>
              )}

              <div className="ride-actions">
                <button
                  onClick={initiateCancelRide}
                  style={{ background: '#fff', color: '#E11900', border: '1px solid #E2E2E2' }}
                >
                  Cancel Ride
                </button>
              </div>

              <ChatPanel
                rideId={activeRide.ride_id}
                currentUserId={user.user_id}
                otherName={activeRide.driver_name}
                onRideCancelled={handleMutualCancellation}
              />
            </div>
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="uber-right-map">
          <div className="uber-ridemap-wrapper">
            {activeRequest ? (
              <BookingMap
                fullHeight
                pickupLocation={{ lat: parseFloat(activeRequest.pickup_lat), lng: parseFloat(activeRequest.pickup_lng) }}
                dropoffLocation={{ lat: parseFloat(activeRequest.dropoff_lat), lng: parseFloat(activeRequest.dropoff_lng) }}
                driverLocation={driverLocation}
                riderLocation={userLocation}
                routePath={routePath}
                routeInfo={routeInfo}
                eta={eta}
                wasRerouted={wasRerouted}
                routeLoading={routeLoading}
                ridePhase="matched"
                driverToPickupRoute={driverToPickupRoute}
                riderToPickupRoute={riderToPickupRoute}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', color: '#6B6B6B', fontSize: '14px' }}>
                Loading map...
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

export default RiderPickupPage;
