import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRide } from '../context/RideContext';
import { useRoute } from '../context/RouteContext';
import BookingMap from '../components/BookingMap';
import RatingBadge from '../components/RatingBadge';
import NotificationDropdown from '../components/NotificationDropdown';
import './Dashboard.css';

function ScheduledRidesPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    scheduledRides, handleCancelScheduledRide,
    userRating, stopPolling,
  } = useRide();

  const { routePath, routeInfo, routeLoading, fetchRoutePreview, clearRoute } = useRoute();

  const [selectedId, setSelectedId] = useState(null);

  const selectedRide = scheduledRides.find(r => r.request_id === selectedId) || null;

  const handleLogout = async () => {
    stopPolling();
    await logout();
    navigate('/login');
  };

  const pickupLoc = selectedRide?.pickup_lat
    ? { lat: parseFloat(selectedRide.pickup_lat), lng: parseFloat(selectedRide.pickup_lng) }
    : null;
  const dropoffLoc = selectedRide?.dropoff_lat
    ? { lat: parseFloat(selectedRide.dropoff_lat), lng: parseFloat(selectedRide.dropoff_lng) }
    : null;

  // Fetch route when a ride is selected, clear when deselected
  useEffect(() => {
    if (pickupLoc && dropoffLoc) {
      fetchRoutePreview(pickupLoc.lat, pickupLoc.lng, dropoffLoc.lat, dropoffLoc.lng);
    } else {
      clearRoute();
    }
    return () => clearRoute();
  }, [selectedId]);

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare</h2>
        </div>
        <div className="nav-user">
          <NotificationDropdown />
          <RatingBadge ratingAvg={userRating.rating_avg} ratingCount={userRating.rating_count} />
          <span>Hi, {user?.name || 'Rider'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="uber-split-layout">
        {/* Left Panel: Scheduled rides list + selected detail */}
        <div className="uber-left-panel">
          <div className="driver-panel-scroll">
            <button
              onClick={() => navigate('/rider/dashboard')}
              className="page-back-btn"
              style={{ marginBottom: 12 }}
            >
              &larr; Back
            </button>

            <div className="uber-greeting">
              <h1>Scheduled Rides</h1>
              <p>{scheduledRides.length === 0 ? 'No upcoming scheduled rides' : `${scheduledRides.length} upcoming ride${scheduledRides.length > 1 ? 's' : ''}`}</p>
            </div>

            {scheduledRides.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6B6B' }}>
                <p style={{ fontSize: 14, marginBottom: 16 }}>You don't have any scheduled rides yet.</p>
                <button
                  onClick={() => navigate('/rider/book')}
                  style={{ background: '#000', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Book a Ride
                </button>
              </div>
            )}

            {scheduledRides.map((ride) => {
              const st = new Date(ride.scheduled_time);
              const msUntil = st.getTime() - Date.now();
              const isFreeCancel = msUntil >= 30 * 60 * 1000;
              const isSelected = selectedId === ride.request_id;

              return (
                <div
                  key={ride.request_id}
                  className={`sched-detail-card${isSelected ? ' sched-detail-card--active' : ''}`}
                  onClick={() => setSelectedId(isSelected ? null : ride.request_id)}
                >
                  {/* Summary row (always visible) */}
                  <div className="sched-detail-summary">
                    <div className="sched-detail-left">
                      <div className="sched-detail-time">
                        {st.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at{' '}
                        {st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="sched-detail-route">
                        <span>{ride.pickup_addr}</span>
                        <span className="route-arrow">&rarr;</span>
                        <span>{ride.dropoff_addr}</span>
                      </div>
                    </div>
                    <div className="sched-detail-fare">{ride.estimated_fare} BDT</div>
                  </div>

                  {/* Expanded details */}
                  {isSelected && (
                    <div className="sched-detail-expanded">
                      <div className="sched-detail-grid">
                        <div className="sched-detail-row">
                          <span>Pickup</span>
                          <strong>{ride.pickup_addr}</strong>
                        </div>
                        <div className="sched-detail-row">
                          <span>Dropoff</span>
                          <strong>{ride.dropoff_addr}</strong>
                        </div>
                        <div className="sched-detail-row">
                          <span>Estimated Fare</span>
                          <strong>{ride.estimated_fare} BDT</strong>
                        </div>
                        {ride.estimated_distance_km && (
                          <div className="sched-detail-row">
                            <span>Distance</span>
                            <strong>{parseFloat(ride.estimated_distance_km).toFixed(1)} km</strong>
                          </div>
                        )}
                        {ride.estimated_duration_min && (
                          <div className="sched-detail-row">
                            <span>Est. Duration</span>
                            <strong>{ride.estimated_duration_min} min</strong>
                          </div>
                        )}
                        <div className="sched-detail-row">
                          <span>Vehicle Type</span>
                          <strong style={{ textTransform: 'capitalize' }}>{ride.vehicle_type}</strong>
                        </div>
                        <div className="sched-detail-row">
                          <span>Status</span>
                          <strong style={{ color: '#05944F' }}>Scheduled</strong>
                        </div>
                        <div className="sched-detail-row">
                          <span>Booked on</span>
                          <strong>{new Date(ride.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                        </div>
                      </div>

                      {msUntil > 0 && msUntil <= 20 * 60 * 1000 && (
                        <div className="sched-detail-notice">
                          This ride will be activated shortly and matched with a nearby driver.
                        </div>
                      )}

                      <button
                        className="sched-detail-cancel-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const msg = isFreeCancel
                            ? 'Cancel this scheduled ride? No charges will apply.'
                            : 'This ride is within 30 minutes of pickup. A cancellation fee may apply. Continue?';
                          if (window.confirm(msg)) {
                            handleCancelScheduledRide(ride.request_id);
                            if (selectedId === ride.request_id) setSelectedId(null);
                          }
                        }}
                      >
                        {isFreeCancel ? 'Cancel Ride (Free)' : 'Cancel Ride (Fee may apply)'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="uber-right-map">
          <div className="uber-ridemap-wrapper">
            {selectedRide && pickupLoc && dropoffLoc ? (
              <BookingMap
                fullHeight
                pickupLocation={pickupLoc}
                dropoffLocation={dropoffLoc}
                routePath={routePath}
                routeInfo={routeInfo}
                routeLoading={routeLoading}
              />
            ) : (
              <BookingMap
                fullHeight
                userLocation={null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScheduledRidesPage;
