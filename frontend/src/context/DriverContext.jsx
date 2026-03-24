import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { useRoute } from './RouteContext';
import { ridesAPI, walletAPI, ratingsAPI, driversAPI } from '../api/client';
import { haversineDistance, estimateTime } from '../utils/geo';

const DriverContext = createContext(null);

const NEARBY_POLL_MS = 10000;
const LOCATION_SYNC_MS = 15000;
const RIDE_POLL_MS = 5000;
const STORAGE_KEY = 'driver_state';
const TEST_LOCATION_POLL_MS = 2000; // Poll database location every 2s for test accounts

function isTestAccount(email) {
  return email && email.includes('test-');
}

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

function loadSavedState() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function DriverProvider({ children }) {
  const {
    routePath, routeInfo, routeLoading, eta, wasRerouted,
    fetchRideRoute, clearRoute, startRouteChecking, stopRouteChecking,
  } = useRoute();

  const saved = useMemo(() => loadSavedState(), []);

  // Phase state machine
  const [driverPhase, setDriverPhase] = useState(saved?.driverPhase || 'offline');
  const driverPhaseRef = useRef(saved?.driverPhase || 'offline');
  useEffect(() => { driverPhaseRef.current = driverPhase; }, [driverPhase]);

  // Location
  const [driverLocation, setDriverLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const currentLocationRef = useRef(null);
  const watchIdRef = useRef(null);

  // Test account location polling
  const [isTestAcc, setIsTestAcc] = useState(false);
  const testLocationPollRef = useRef(null);

  // Nearby requests
  const [nearbyRequests, setNearbyRequests] = useState([]);

  // Active ride
  const [activeRide, setActiveRide] = useState(saved?.activeRide || null);

  // Rider location (from API, for driver to see rider approaching)
  const [riderLocation, setRiderLocation] = useState(null);
  const [riderToPickupDistance, setRiderToPickupDistance] = useState(null);

  // Error
  const [error, setError] = useState(null);

  // Wallet & Rating
  const [walletBalance, setWalletBalance] = useState(null);
  const [userRating, setUserRating] = useState({ rating_avg: null, rating_count: 0 });

  // Vehicles
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);

  // Rating modal
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTarget, setRatingTarget] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  // Cancellation state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelFee, setCancelFee] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Polling refs
  const nearbyIntervalRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const locationSyncIntervalRef = useRef(null);
  const ridePollRef = useRef(null);

  // Fake nearby vehicles for idle map
  const fakeVehicles = useMemo(() => {
    const center = driverLocation || { lat: 23.8103, lng: 90.4125 };
    return generateNearbyVehicles(center, 5);
  }, [driverLocation]);

  // Persist state to sessionStorage
  useEffect(() => {
    const persistable = { driverPhase, activeRide };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [driverPhase, activeRide]);

  // ── Data fetchers ──

  const fetchWalletBalance = useCallback(async () => {
    try {
      const res = await walletAPI.getBalance();
      setWalletBalance(parseFloat(res.data.wallet.balance));
    } catch (err) {
      console.error('fetchWalletBalance error:', err);
    }
  }, []);

  const fetchMyRating = useCallback(async () => {
    try {
      const res = await ratingsAPI.getMyRating();
      setUserRating({ rating_avg: res.data.rating_avg, rating_count: res.data.rating_count });
    } catch (err) {
      console.error('fetchMyRating error:', err);
    }
  }, []);

  const fetchVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const res = await driversAPI.getVehicles();
      setVehicles(res.data.vehicles || []);
    } catch (err) {
      console.error('fetchVehicles error:', err);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  const fetchNearby = useCallback(async () => {
    const loc = currentLocationRef.current;
    if (!loc) return;
    try {
      const res = await ridesAPI.getNearby(loc.lat, loc.lng);
      setNearbyRequests(res.data.requests || []);
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

  const fetchTestLocation = useCallback(async () => {
    try {
      const res = await ridesAPI.getTestLocation();
      if (res.data.lat != null && res.data.lng != null) {
        const loc = { lat: res.data.lat, lng: res.data.lng };
        currentLocationRef.current = loc;
        setDriverLocation(loc);
      }
    } catch (err) {
      console.error('fetchTestLocation error:', err);
    }
  }, []);

  // ── Geolocation & polling ──

  const startGeolocationWatch = useCallback(() => {
    // For test accounts, use database polling instead of browser geolocation
    if (isTestAcc) {
      if (testLocationPollRef.current) return; // already polling
      fetchTestLocation();
      testLocationPollRef.current = setInterval(fetchTestLocation, TEST_LOCATION_POLL_MS);
      setLocationError(null);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }
    if (watchIdRef.current != null) return; // already watching
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
  }, [isTestAcc, fetchTestLocation]);

  const stopGeolocationWatch = useCallback(() => {
    if (testLocationPollRef.current != null) {
      clearInterval(testLocationPollRef.current);
      testLocationPollRef.current = null;
    }
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startLocationSync = useCallback(() => {
    if (locationSyncIntervalRef.current) return; // already syncing
    setTimeout(syncLocation, 500);
    locationSyncIntervalRef.current = setInterval(syncLocation, LOCATION_SYNC_MS);
  }, [syncLocation]);

  const stopLocationSync = useCallback(() => {
    clearInterval(locationSyncIntervalRef.current);
    locationSyncIntervalRef.current = null;
  }, []);

  const startPolling = useCallback(() => {
    setTimeout(fetchNearby, 500);
    nearbyIntervalRef.current = setInterval(fetchNearby, NEARBY_POLL_MS);
    locationIntervalRef.current = setInterval(syncLocation, LOCATION_SYNC_MS);
  }, [fetchNearby, syncLocation]);

  const stopPolling = useCallback(() => {
    clearInterval(nearbyIntervalRef.current);
    clearInterval(locationIntervalRef.current);
    nearbyIntervalRef.current = null;
    locationIntervalRef.current = null;
    setNearbyRequests([]);
  }, []);

  // ── Ride status polling (detect rider-initiated cancellation) ──

  const stopRidePolling = useCallback(() => {
    if (ridePollRef.current) {
      clearInterval(ridePollRef.current);
      ridePollRef.current = null;
    }
  }, []);

  const checkActiveRide = useCallback(async () => {
    try {
      const res = await ridesAPI.getDriverActive();
      if (!res.data.active && ['ride_accepted', 'ride_started'].includes(driverPhaseRef.current)) {
        // Ride was cancelled by the rider (or otherwise ended) — return to online
        stopRidePolling();
        fetchWalletBalance();
        setActiveRide(null);
        setRiderLocation(null);
        setRiderToPickupDistance(null);
        setDriverPhase('online');
        stopRouteChecking();
        clearRoute();
        startPolling();
      } else if (res.data.active) {
        // REFRESH: Update activeRide data from database to sync any changes
        setActiveRide(res.data);

        // Extract rider location from API response
        if (res.data.rider_location) {
          setRiderLocation(res.data.rider_location);
          // Calculate rider-to-pickup distance during matched phase
          if (res.data.ride?.status === 'driver_assigned' && res.data.ride?.pickup_lat) {
            const riderDist = haversineDistance(
              res.data.rider_location.lat, res.data.rider_location.lng,
              parseFloat(res.data.ride.pickup_lat), parseFloat(res.data.ride.pickup_lng)
            );
            setRiderToPickupDistance(riderDist);
          }
        } else {
          setRiderLocation(null);
          setRiderToPickupDistance(null);
        }
      }
    } catch (err) {
      console.error('checkActiveRide error:', err);
    }
  }, [stopRidePolling, fetchWalletBalance, stopRouteChecking, clearRoute, startPolling]);

  const startRidePolling = useCallback(() => {
    stopRidePolling();
    ridePollRef.current = setInterval(checkActiveRide, RIDE_POLL_MS);
  }, [stopRidePolling, checkActiveRide]);

  // ── Actions ──

  const goOnline = useCallback(async () => {
    try {
      await ridesAPI.checkReadiness();
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'You must have an active vehicle before going online. Go to My Vehicles to set one.'
      );
      throw err;
    }
    setError(null);
    setDriverPhase('online');
    startGeolocationWatch();
    startPolling();
    startLocationSync();
  }, [startGeolocationWatch, startPolling, startLocationSync]);

  const goOffline = useCallback(() => {
    setDriverPhase('offline');
    stopPolling();
    stopLocationSync();
    stopGeolocationWatch();
    setError(null);
  }, [stopPolling, stopLocationSync, stopGeolocationWatch]);

  const acceptRequest = useCallback(async (requestId) => {
    try {
      const res = await ridesAPI.acceptRequest(requestId);
      setActiveRide(res.data);
      stopPolling(); // Stop nearby request polling, but location sync continues
      setDriverPhase('ride_accepted');
      setError(null);
      // Fetch route and start route checking
      if (res.data?.ride?.ride_id) {
        await fetchRideRoute(res.data.ride.ride_id);
        startRouteChecking(res.data.ride.ride_id, () => currentLocationRef.current);
      }
      startRidePolling();
    } catch (err) {
      const errData = err.response?.data;
      setError(errData?.details || errData?.error || 'Failed to accept ride');
      throw err;
    }
  }, [stopPolling, fetchRideRoute, startRouteChecking, startRidePolling]);

  const rejectRequest = useCallback(async (requestId) => {
    try {
      await ridesAPI.rejectRequest(requestId);
      setNearbyRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    } catch (err) {
      console.error('rejectRequest error:', err);
    }
  }, []);

  const updateRideStatus = useCallback(async (status) => {
    if (!activeRide?.ride?.ride_id) return;
    try {
      const res = await ridesAPI.updateStatus(activeRide.ride.ride_id, status);
      if (status === 'completed') {
        if (activeRide?.ride?.rider_id) {
          setRatingTarget({
            rideId: activeRide.ride.ride_id,
            rateeUserId: activeRide.ride.rider_id,
            rateeName: activeRide.rider_name || 'the rider',
          });
          setShowRatingModal(true);
        }
        setActiveRide(null);
        setRiderLocation(null);
        setRiderToPickupDistance(null);
        setDriverPhase('online');
        fetchWalletBalance();
        stopRouteChecking();
        stopRidePolling();
        clearRoute();
        startPolling();
      } else if (status === 'started') {
        setActiveRide((prev) => ({ ...prev, ride: res.data.ride }));
        setDriverPhase('ride_started');
      } else {
        setActiveRide((prev) => ({ ...prev, ride: res.data.ride }));
      }
    } catch (err) {
      console.error('updateStatus error:', err);
      const msg = err.response?.data?.error || err.response?.data?.details || 'Failed to update ride status';
      setError(msg);
    }
  }, [activeRide, fetchWalletBalance, stopRouteChecking, stopRidePolling, clearRoute, startPolling]);

  const activateVehicle = useCallback(async (vehicleId) => {
    try {
      await driversAPI.activateVehicle(vehicleId);
      fetchVehicles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to activate vehicle');
    }
  }, [fetchVehicles]);

  const deactivateVehicle = useCallback(async (vehicleId) => {
    try {
      await driversAPI.deactivateVehicle(vehicleId);
      fetchVehicles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deactivate vehicle');
    }
  }, [fetchVehicles]);

  // Rating actions
  const handleSubmitRating = useCallback(async (score) => {
    if (!ratingTarget) return;
    setRatingLoading(true);
    try {
      await ratingsAPI.submit(ratingTarget.rideId, ratingTarget.rateeUserId, score);
      setTimeout(() => {
        setShowRatingModal(false);
        setRatingTarget(null);
        setRatingLoading(false);
        fetchMyRating();
      }, 1200);
    } catch (err) {
      setRatingLoading(false);
      throw new Error(err.response?.data?.error || 'Failed to submit rating');
    }
  }, [ratingTarget, fetchMyRating]);

  const handleSkipRating = useCallback(() => {
    setShowRatingModal(false);
    setRatingTarget(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Cancellation actions
  const initiateCancelRide = useCallback(async () => {
    const rideId = activeRide?.ride?.ride_id;
    if (!rideId) return;
    try {
      const res = await ridesAPI.getCancelFee(rideId);
      setCancelFee(res.data.fee);
      setShowCancelConfirm(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to get cancellation fee');
    }
  }, [activeRide]);

  const confirmCancelRide = useCallback(() => {
    setShowCancelConfirm(false);
    setShowCancelReason(true);
  }, []);

  const submitCancelReason = useCallback(async (reason) => {
    const rideId = activeRide?.ride?.ride_id;
    if (!rideId) return;
    setCancelLoading(true);
    try {
      const res = await ridesAPI.cancelRide(rideId, reason);
      if (res.data.cancellation?.wallet_balance !== undefined) {
        setWalletBalance(res.data.cancellation.wallet_balance);
      } else {
        fetchWalletBalance();
      }
      setShowCancelReason(false);
      setCancelFee(null);
      setCancelLoading(false);
      setActiveRide(null);
      setRiderLocation(null);
      setRiderToPickupDistance(null);
      setDriverPhase('online');
      stopRouteChecking();
      stopRidePolling();
      clearRoute();
      startPolling();
    } catch (err) {
      setCancelLoading(false);
      setShowCancelReason(false);
      setError(err.response?.data?.error || 'Failed to cancel ride');
    }
  }, [activeRide, stopRouteChecking, stopRidePolling, clearRoute, fetchWalletBalance, startPolling]);

  const abortCancel = useCallback(() => {
    setShowCancelConfirm(false);
    setCancelFee(null);
  }, []);

  // Handle mutual cancellation (called from ChatPanel)
  const handleMutualCancellation = useCallback(() => {
    fetchWalletBalance();
    setActiveRide(null);
    setRiderLocation(null);
    setRiderToPickupDistance(null);
    setDriverPhase('online');
    stopRouteChecking();
    stopRidePolling();
    clearRoute();
    startPolling();
  }, [stopRouteChecking, stopRidePolling, clearRoute, fetchWalletBalance, startPolling]);

  // ── On mount: restore state ──

  useEffect(() => {
    // Check if this is a test account
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.email && isTestAccount(user.email)) {
      setIsTestAcc(true);
    }

    fetchWalletBalance();
    fetchMyRating();
    fetchVehicles();

    // Restore active ride from server
    const restoreActiveRide = async () => {
      try {
        const res = await ridesAPI.getDriverActive();
        if (res.data.active && res.data.ride) {
          setActiveRide(res.data);
          const rideStatus = res.data.ride.status;
          if (rideStatus === 'started') {
            setDriverPhase('ride_started');
          } else {
            setDriverPhase('ride_accepted');
          }
          if (res.data.ride.ride_id) {
            await fetchRideRoute(res.data.ride.ride_id);
            startRouteChecking(res.data.ride.ride_id, () => currentLocationRef.current);
          }
          // Start geolocation, location sync, and ride polling during active ride
          startGeolocationWatch();
          startLocationSync();
          startRidePolling();
        } else if (saved?.driverPhase === 'online') {
          // Was online but no active ride — restore online state
          setActiveRide(null);
          setDriverPhase('online');
          startGeolocationWatch();
          startPolling();
          startLocationSync();
        } else {
          // No active ride on server — clear any stale saved state
          setActiveRide(null);
          setDriverPhase('offline');
        }
      } catch (err) {
        console.error('restoreActiveRide error:', err);
      }
    };
    restoreActiveRide();

    // Get initial location for idle map
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

    return () => {
      // Cleanup on unmount
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (testLocationPollRef.current) {
        clearInterval(testLocationPollRef.current);
      }
      clearInterval(nearbyIntervalRef.current);
      clearInterval(locationIntervalRef.current);
      clearInterval(locationSyncIntervalRef.current);
      clearInterval(ridePollRef.current);
    };
  }, []);

  // Proximity helper: driver distance/time to pickup
  const proximityToPickup = useMemo(() => {
    if (!driverLocation || !activeRide?.ride?.pickup_lat) return null;
    const dist = haversineDistance(
      driverLocation.lat, driverLocation.lng,
      parseFloat(activeRide.ride.pickup_lat), parseFloat(activeRide.ride.pickup_lng)
    );
    return {
      distance: dist,
      time: estimateTime(dist / 1000),
      withinProximity: dist <= 100,
    };
  }, [driverLocation, activeRide]);

  const value = {
    // Phase
    driverPhase, setDriverPhase, driverPhaseRef,
    // Location
    driverLocation, locationError, currentLocationRef,
    // Nearby requests
    nearbyRequests,
    // Active ride
    activeRide,
    // Rider location & proximity
    riderLocation, riderToPickupDistance, proximityToPickup,
    // Error
    error, setError, clearError,
    // Wallet & Rating
    walletBalance, userRating, fetchWalletBalance, fetchMyRating,
    // Vehicles
    vehicles, vehiclesLoading, fetchVehicles, activateVehicle, deactivateVehicle,
    // Rating modal
    showRatingModal, ratingTarget, ratingLoading,
    handleSubmitRating, handleSkipRating,
    // Fake vehicles
    fakeVehicles,
    // Actions
    goOnline, goOffline,
    acceptRequest, rejectRequest,
    updateRideStatus,
    // Route (re-exported from RouteContext)
    routePath, routeInfo, routeLoading, eta, wasRerouted,
    // Cancellation
    showCancelConfirm, showCancelReason, cancelFee, cancelLoading,
    initiateCancelRide, confirmCancelRide, submitCancelReason, abortCancel,
    handleMutualCancellation,
  };

  return (
    <DriverContext.Provider value={value}>
      {children}
    </DriverContext.Provider>
  );
}

export function DriverProviderLayout() {
  return (
    <DriverProvider>
      <Outlet />
    </DriverProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDriver() {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error('useDriver must be used within a DriverProvider');
  return ctx;
}

export default DriverContext;
