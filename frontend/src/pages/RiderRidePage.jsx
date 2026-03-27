import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import BookingMap from '../components/BookingMap';
import ChatPanel from '../components/ChatPanel';
import RatingModal from '../components/RatingModal';
import CancelConfirmModal from '../components/CancelConfirmModal';
import CancelReasonForm from '../components/CancelReasonFormRider';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function RiderRidePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    ridePhase,
    walletBalance, error,
    activeRequest, activeRide,
    resetBooking, stopPolling,
    routePath, routeInfo, eta, wasRerouted, routeLoading,
    driverLocation, userLocation, userRating,
    showRatingModal, ratingTarget, ratingLoading,
    handleSubmitRating, handleSkipRating,
    showCancelConfirm, showCancelReason, cancelFee, cancelLoading,
    initiateCancelRide, confirmCancelRide, submitCancelReason, abortCancel,
    handleMutualCancellation,
  } = useRide();

  // Route guard: only render for in_progress/completed
  useEffect(() => {
    if (ridePhase === 'idle') {
      navigate('/rider/dashboard', { replace: true });
    } else if (ridePhase === 'booking') {
      navigate('/rider/book', { replace: true });
    } else if (ridePhase === 'confirming') {
      navigate('/rider/confirm', { replace: true });
    } else if (ridePhase === 'searching') {
      navigate('/rider/searching', { replace: true });
    } else if (ridePhase === 'matched') {
      navigate('/rider/pickup', { replace: true });
    }
  }, [ridePhase, navigate]);

  const handleLogout = async () => {
    stopPolling();
    await logout();
    navigate('/login');
  };

  if (!activeRide && ridePhase !== 'completed') return null;

  return (
    <div className="dashboard-container">
      <NavBar
        showNotifications
        ratingAvg={userRating.rating_avg}
        ratingCount={userRating.rating_count}
        onLogout={handleLogout}
      />

      <div className="uber-split-layout">
        {/* Left Panel: Ride Details */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            {ridePhase === 'in_progress' && (
              <button
                onClick={() => navigate('/rider/dashboard')}
                className="page-back-btn"
                style={{ marginBottom: 12 }}
              >
                &larr; Back
              </button>
            )}
            {error && <div className="uber-panel-alert">{error}</div>}

            {/* IN PROGRESS */}
            {ridePhase === 'in_progress' && activeRide && (
              <>
                <div className="uber-greeting">
                  <h1>Ride in Progress</h1>
                  <p>Enjoy your trip!</p>
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
                    <strong style={{ color: '#05944F' }}>Ride started</strong>
                  </div>
                  {eta && (
                    <div className="ride-detail-row">
                      <span>ETA</span>
                      <strong>{eta?.remaining_text ?? ''}</strong>
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
              </>
            )}

            {/* COMPLETED */}
            {ridePhase === 'completed' && activeRide && (
              <>
                <div className="uber-greeting">
                  <h1>Ride Complete!</h1>
                  <p>Thanks for riding with us</p>
                </div>

                <div className="uber-active-ride-panel">
                  <div className="ride-detail-row">
                    <span>Base Fare</span>
                    <strong>{activeRide.estimated_fare} BDT</strong>
                  </div>
                  {activeRide.final_fare && activeRide.estimated_fare &&
                    Number(activeRide.estimated_fare) !== Number(activeRide.final_fare) && (
                    <div className="ride-detail-row">
                      <span>Promo Discount</span>
                      <strong style={{ color: '#05944F' }}>
                        -{(Number(activeRide.estimated_fare) - Number(activeRide.final_fare)).toFixed(0)} BDT
                      </strong>
                    </div>
                  )}
                  {activeRide.platform_fee && (
                    <div className="ride-detail-row">
                      <span>Platform Fee (15%)</span>
                      <strong>{activeRide.platform_fee} BDT</strong>
                    </div>
                  )}
                  <div className="ride-detail-row" style={{ borderTop: '2px solid #000', paddingTop: 12 }}>
                    <span style={{ fontWeight: 600 }}>Total Charged</span>
                    <strong style={{ fontSize: 18 }}>{activeRide.final_fare || activeRide.estimated_fare} BDT</strong>
                  </div>

                  {walletBalance !== null && (
                    <div className="ride-detail-row">
                      <span>Wallet Balance</span>
                      <strong>{walletBalance.toFixed(2)} BDT</strong>
                    </div>
                  )}

                  <div className="ride-detail-row">
                    <span>Driver</span>
                    <strong>{activeRide.driver_name}</strong>
                  </div>
                  <div className="ride-detail-row">
                    <span>Route</span>
                    <strong>{activeRide.pickup_addr || activeRequest?.pickup_addr} → {activeRide.dropoff_addr || activeRequest?.dropoff_addr}</strong>
                  </div>

                  <div className="ride-actions">
                    <button
                      onClick={resetBooking}
                      style={{ background: '#000', color: '#fff', border: 'none' }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="uber-right-map">
          <div className="uber-ridemap-wrapper">
            {ridePhase !== 'completed' && activeRequest ? (
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
                ridePhase={ridePhase}
                inProgressRoute={ridePhase === 'in_progress' ? routePath : null}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', color: '#6B6B6B', fontSize: '14px' }}>
                {ridePhase === 'completed' ? 'Ride completed' : 'Loading map...'}
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

export default RiderRidePage;
