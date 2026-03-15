import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import RideMap from '../components/RideMap';
import ChatPanel from '../components/ChatPanel';
import RatingModal from '../components/RatingModal';
import RatingBadge from '../components/RatingBadge';
import NotificationDropdown from '../components/NotificationDropdown';
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
  } = useDriver();

  // Route guard: must have an active ride
  useEffect(() => {
    if (driverPhase === 'offline') {
      navigate('/driver/dashboard', { replace: true });
    } else if (driverPhase === 'online') {
      navigate('/driver/online', { replace: true });
    }
  }, [driverPhase, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!activeRide) return null;

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare Driver</h2>
        </div>
        <div className="nav-user">
          <NotificationDropdown />
          <RatingBadge ratingAvg={userRating.rating_avg} ratingCount={userRating.rating_count} />
          <span>Hi, {user?.name || 'Driver'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="uber-split-layout">
        {/* Left Panel: Ride Details */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            <div className="uber-greeting">
              <h1>Active Ride</h1>
              <p style={{ textTransform: 'capitalize' }}>
                {activeRide.ride?.status?.replace('_', ' ')}
              </p>
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
                <strong style={{ textTransform: 'capitalize' }}>
                  {activeRide.ride?.status?.replace('_', ' ')}
                </strong>
              </div>

              <div className="ride-actions">
                {activeRide.ride?.status === 'driver_assigned' && (
                  <button
                    onClick={() => updateRideStatus('started')}
                    style={{ background: '#000', color: '#fff', border: 'none' }}
                  >
                    Start Ride
                  </button>
                )}
                {activeRide.ride?.status === 'started' && (
                  <button
                    onClick={() => updateRideStatus('completed')}
                    style={{ background: '#05944F', color: '#fff', border: 'none' }}
                  >
                    Complete Ride
                  </button>
                )}
                <button
                  onClick={() => updateRideStatus('cancelled')}
                  style={{ background: '#fff', color: '#E11900', border: '1px solid #E2E2E2' }}
                >
                  Cancel Ride
                </button>
              </div>

              <ChatPanel
                rideId={activeRide.ride.ride_id}
                currentUserId={user.user_id}
                otherName={activeRide.rider_name}
              />
            </div>
          </div>
        </div>

        {/* Right Panel: RideMap with route */}
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
                pickupLocation={activeRide.ride?.pickup_addr ? undefined : null}
                dropoffLocation={activeRide.ride?.dropoff_addr ? undefined : null}
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
    </div>
  );
}

export default DriverRidePage;
