import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { useRoute } from './RouteContext';
import { ridesAPI, walletAPI, ratingsAPI, isTestAccount } from '../api/client';

const RideContext = createContext(null);

const POLL_INTERVAL_MS = 5000;
const STORAGE_KEY = 'ride_booking_state';
const TEST_LOCATION_POLL_MS = 2000; // Poll database location every 2s for test accounts

function generateNearbyVehicles(center, count = 7) {
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

export function RideProvider({ children }) {
  const {
    routePath, routeInfo, routeLoading, eta, wasRerouted,
    fetchRoutePreview, fetchRideRoute, clearRoute,
    stopRouteChecking,
  } = useRoute();

  const saved = useMemo(() => loadSavedState(), []);

  // Ride flow state machine
  const [ridePhase, setRidePhase] = useState(saved?.ridePhase || 'idle');
  const ridePhaseRef = useRef(saved?.ridePhase || 'idle');
  useEffect(() => { ridePhaseRef.current = ridePhase; }, [ridePhase]);

  // Booking form
  const [pickupAddr, setPickupAddr] = useState(saved?.pickupAddr || '');
  const [dropoffAddr, setDropoffAddr] = useState(saved?.dropoffAddr || '');
  const [pickupCoords, setPickupCoords] = useState(saved?.pickupCoords || null);
  const [dropoffCoords, setDropoffCoords] = useState(saved?.dropoffCoords || null);
  const [clickMode, setClickMode] = useState('pickup');

  // Fare estimate
  const [fareEstimate, setFareEstimate] = useState(saved?.fareEstimate || null);

  // Active ride tracking
  const [activeRequest, setActiveRequest] = useState(saved?.activeRequest || null);
  const [activeRide, setActiveRide] = useState(saved?.activeRide || null);
  const [statusMessage, setStatusMessage] = useState(null);

  // Live driver location (from poll) and rider location tracking
  const [driverLocation, setDriverLocation] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const riderWatchIdRef = useRef(null);
  const riderSyncIntervalRef = useRef(null);
  const activeRideIdRef = useRef(null);

  // Test account location polling
  const [isTestAcc, setIsTestAcc] = useState(false);
  const isTestAccRef = useRef(false); // For synchronous access to test account status
  const testLocationPollRef = useRef(null);

  // UI
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);

  // Wallet & Promo
  const [walletBalance, setWalletBalance] = useState(null);
  const [promoCode, setPromoCode] = useState(saved?.promoCode || '');
  const [promoResult, setPromoResult] = useState(saved?.promoResult || null);
  const [promoLoading, setPromoLoading] = useState(false);

  // Vehicle type selection
  const [vehicleType, setVehicleType] = useState(saved?.vehicleType || 'economy');

  // Scheduled ride
  const [scheduledTime, setScheduledTime] = useState(saved?.scheduledTime || null);
  const [scheduledRides, setScheduledRides] = useState([]);
  const [scheduleSuccess, setScheduleSuccess] = useState(null);

  // Polling
  const pollRef = useRef(null);

  // Rating
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTarget, setRatingTarget] = useState(null); // { rideId, rateeUserId, rateeName }
  const [ratingLoading, setRatingLoading] = useState(false);
  const [userRating, setUserRating] = useState({ rating_avg: null, rating_count: 0 });

  // Cancellation state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelFee, setCancelFee] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Fake nearby vehicles for idle map
  const nearbyVehicles = useMemo(() => {
    const center = userLocation || { lat: 23.8103, lng: 90.4125 };
    return generateNearbyVehicles(center, 7);
  }, [userLocation]);

  // Persist booking state to sessionStorage
  useEffect(() => {
    const persistable = {
      ridePhase,
      pickupAddr, dropoffAddr,
      pickupCoords, dropoffCoords,
      fareEstimate,
      activeRequest, activeRide,
      promoCode, promoResult,
      vehicleType, scheduledTime,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [ridePhase, pickupAddr, dropoffAddr, pickupCoords, dropoffCoords,
      fareEstimate, activeRequest, activeRide, promoCode, promoResult, vehicleType, scheduledTime]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchWalletBalance = useCallback(async () => {
    try {
      const res = await walletAPI.getBalance();
      setWalletBalance(parseFloat(res.data.wallet.balance));
    } catch (err) {
      console.error('fetchWalletBalance error:', err);
    }
  }, []);

  const fetchTestLocation = useCallback(async () => {
    try {
      const res = await ridesAPI.getTestLocation();
      if (res.data.lat != null && res.data.lng != null) {
        setRiderLocation({ lat: res.data.lat, lng: res.data.lng });
      }
    } catch (err) {
      console.error('fetchTestLocation error:', err);
    }
  }, []);

  const startRiderLocationTracking = useCallback(() => {
    if (riderWatchIdRef.current != null) return; // already tracking
    if (!navigator.geolocation) return;

    // For test accounts, use database polling instead of browser geolocation
    if (isTestAccRef.current) {
      if (testLocationPollRef.current) return; // already polling
      fetchTestLocation();
      testLocationPollRef.current = setInterval(fetchTestLocation, TEST_LOCATION_POLL_MS);
      return;
    }

    riderWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    // Sync rider location to backend every 10s
    if (!riderSyncIntervalRef.current) {
      const syncRiderLoc = async () => {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 10000 })
          );
          await ridesAPI.updateRiderLocation(pos.coords.latitude, pos.coords.longitude);
        } catch {
          // ignore sync failures
        }
      };
      syncRiderLoc();
      riderSyncIntervalRef.current = setInterval(syncRiderLoc, 10000);
    }
  }, [fetchTestLocation]);

  const stopRiderLocationTracking = useCallback(() => {
    if (riderWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(riderWatchIdRef.current);
      riderWatchIdRef.current = null;
    }
    if (testLocationPollRef.current) {
      clearInterval(testLocationPollRef.current);
      testLocationPollRef.current = null;
    }
    if (riderSyncIntervalRef.current) {
      clearInterval(riderSyncIntervalRef.current);
      riderSyncIntervalRef.current = null;
    }
  }, []);

  const checkActiveRide = useCallback(async () => {
    try {
      const res = await ridesAPI.getRiderActive();
      const data = res.data;

      switch (data.phase) {
        case 'scheduled':
          // Rider has a scheduled ride — don't change phase, stay idle
          break;
        case 'searching':
          setRidePhase('searching');
          setActiveRequest(data.request);
          break;
        case 'matched':
          setRidePhase('matched');
          setActiveRide(data.ride);
          setActiveRequest(data.request);
          if (data.driver_location) setDriverLocation(data.driver_location);
          if (data.ride?.ride_id) {
            fetchRideRoute(data.ride.ride_id);
            startRiderLocationTracking();
          }
          break;
        case 'in_progress':
          setRidePhase('in_progress');
          setActiveRide(data.ride);
          setActiveRequest(data.request);
          if (data.driver_location) setDriverLocation(data.driver_location);
          if (data.ride?.ride_id) {
            fetchRideRoute(data.ride.ride_id);
            startRiderLocationTracking();
          }
          break;
        case 'completed':
          if (['searching', 'matched', 'in_progress'].includes(ridePhaseRef.current)) {
            setRidePhase('completed');
            setActiveRide(data.ride);
            if (data.wallet_balance !== undefined) {
              setWalletBalance(parseFloat(data.wallet_balance));
            } else {
              fetchWalletBalance();
            }
            stopPolling();
            stopRouteChecking();
            clearRoute();
            stopRiderLocationTracking();
            setDriverLocation(null);
            // Trigger rating modal for the driver
            if (data.ride?.ride_id && data.ride?.driver_id) {
              setRatingTarget({
                rideId: data.ride.ride_id,
                rateeUserId: data.ride.driver_id,
                rateeName: data.ride.driver_name || 'your driver',
              });
              setShowRatingModal(true);
            }
          }
          break;
        case 'idle':
        default:
          if (['searching', 'matched', 'in_progress'].includes(ridePhaseRef.current)) {
            if (data.message) setStatusMessage(data.message);
            setRidePhase('idle');
            setActiveRequest(null);
            setActiveRide(null);
            setPickupAddr('');
            setDropoffAddr('');
            setPickupCoords(null);
            setDropoffCoords(null);
            setFareEstimate(null);
            setPromoCode('');
            setPromoResult(null);
            setVehicleType('economy');
            stopPolling();
            stopRiderLocationTracking();
            setDriverLocation(null);
            clearRoute();
            sessionStorage.removeItem(STORAGE_KEY);
          }
          break;
      }
    } catch (err) {
      console.error('checkActiveRide error:', err);
    }
  }, [stopPolling, clearRoute, fetchRideRoute, fetchWalletBalance, stopRouteChecking]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(checkActiveRide, POLL_INTERVAL_MS);
  }, [stopPolling, checkActiveRide]);

  // Reverse geocode coords to address
  const reverseGeocode = useCallback((coords, callback) => {
    if (!window.google?.maps?.Geocoder) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: coords }, (results, status) => {
      if (status === 'OK' && results[0]) {
        callback(results[0].formatted_address);
      }
    });
  }, []);

  // Map click handler
  const handleMapClick = useCallback((coords) => {
    if (clickMode === 'pickup') {
      setPickupCoords(coords);
      reverseGeocode(coords, setPickupAddr);
      setMapCenter(coords);
      setClickMode('dropoff');
    } else {
      setDropoffCoords(coords);
      reverseGeocode(coords, setDropoffAddr);
      setMapCenter(coords);
    }
  }, [clickMode, reverseGeocode]);

  // Use My Location
  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPickupCoords(coords);
        reverseGeocode(coords, setPickupAddr);
        setClickMode('dropoff');
        setError(null);
      },
      (err) => {
        if (err.code === 1) {
          setError('Location access denied. Allow location in your browser settings, or click on the map.');
        } else {
          setError('Could not get your location. Click on the map instead.');
        }
      }
    );
  }, [reverseGeocode]);

  // Get fare estimate + route preview
  const handleGetEstimate = useCallback(async () => {
    if (!pickupCoords || !dropoffCoords) {
      setError('Please set both pickup and dropoff on the map');
      return false;
    }
    if (!pickupAddr.trim() || !dropoffAddr.trim()) {
      setError('Please enter both pickup and dropoff addresses');
      return false;
    }
    setError(null);
    setLoading(true);
    try {
      const [fareRes, routeResult] = await Promise.all([
        ridesAPI.getFareEstimate(
          pickupCoords.lat, pickupCoords.lng,
          dropoffCoords.lat, dropoffCoords.lng
        ),
        fetchRoutePreview(
          pickupCoords.lat, pickupCoords.lng,
          dropoffCoords.lat, dropoffCoords.lng
        ),
      ]);

      const fareData = fareRes.data;
      // Route distance is now used by backend for fare calculation
      // routeResult is still fetched for map polyline rendering via RouteContext

      setFareEstimate(fareData);
      setRidePhase('confirming');
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to get fare estimate');
      return false;
    } finally {
      setLoading(false);
    }
  }, [pickupCoords, dropoffCoords, pickupAddr, dropoffAddr, fetchRoutePreview]);

  // Confirm ride request
  const handleConfirmRide = useCallback(async () => {
    if (ridePhaseRef.current !== 'confirming') return false;
    setError(null);
    setLoading(true);
    try {
      const res = await ridesAPI.createRequest({
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        pickup_addr: pickupAddr,
        dropoff_lat: dropoffCoords.lat,
        dropoff_lng: dropoffCoords.lng,
        dropoff_addr: dropoffAddr,
        promo_code: promoCode || undefined,
        vehicle_type: vehicleType,
        scheduled_time: scheduledTime || undefined,
      });

      if (res.data.request.status === 'scheduled') {
        // Scheduled ride — reset to idle and show success
        const st = new Date(res.data.request.scheduled_time);
        setScheduleSuccess(`Ride scheduled for ${st.toLocaleDateString()} at ${st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        setRidePhase('idle');
        setPickupAddr('');
        setDropoffAddr('');
        setPickupCoords(null);
        setDropoffCoords(null);
        setFareEstimate(null);
        setPromoCode('');
        setPromoResult(null);
        setVehicleType('economy');
        setScheduledTime(null);
        sessionStorage.removeItem(STORAGE_KEY);
        fetchScheduledRides();
        return 'scheduled';
      }

      setActiveRequest(res.data.request);
      setRidePhase('searching');
      startPolling();
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create ride request');
      return false;
    } finally {
      setLoading(false);
    }
  }, [pickupCoords, dropoffCoords, pickupAddr, dropoffAddr, promoCode, vehicleType, scheduledTime, startPolling]);

  // Validate promo code
  const handleValidatePromo = useCallback(async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    try {
      const res = await walletAPI.validatePromo(promoCode, fareEstimate.estimated_fare);
      setPromoResult(res.data);
    } catch {
      setPromoResult({ valid: false });
    } finally {
      setPromoLoading(false);
    }
  }, [promoCode, fareEstimate]);

  // Cancel ride request
  const handleCancelRequest = useCallback(async () => {
    if (!activeRequest?.request_id) return;
    try {
      await ridesAPI.cancelRequest(activeRequest.request_id);
      stopPolling();
      resetBooking();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel request');
    }
  }, [activeRequest, stopPolling]);

  // Fetch scheduled rides
  const fetchScheduledRides = useCallback(async () => {
    try {
      const res = await ridesAPI.getScheduledRides();
      setScheduledRides(res.data.requests || []);
    } catch {
      // ignore
    }
  }, []);

  // Cancel a scheduled ride
  const handleCancelScheduledRide = useCallback(async (requestId) => {
    try {
      await ridesAPI.cancelRequest(requestId);
      fetchScheduledRides();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel scheduled ride');
    }
  }, [fetchScheduledRides]);

  // Reset to idle
  const resetBooking = useCallback(() => {
    setRidePhase('idle');
    setPickupAddr('');
    setDropoffAddr('');
    setPickupCoords(null);
    setDropoffCoords(null);
    setClickMode('pickup');
    setFareEstimate(null);
    setActiveRequest(null);
    setActiveRide(null);
    setError(null);
    setStatusMessage(null);
    setPromoCode('');
    setPromoResult(null);
    setVehicleType('economy');
    setScheduledTime(null);
    setDriverLocation(null);
    stopPolling();
    stopRiderLocationTracking();
    clearRoute();
    fetchWalletBalance();
    sessionStorage.removeItem(STORAGE_KEY);
  }, [stopPolling, stopRiderLocationTracking, clearRoute, fetchWalletBalance]);

  // Rating actions
  const fetchMyRating = useCallback(async () => {
    try {
      const res = await ratingsAPI.getMyRating();
      setUserRating({
        rating_avg: res.data.rating_avg,
        rating_count: res.data.rating_count,
      });
    } catch (err) {
      console.error('fetchMyRating error:', err);
    }
  }, []);

  const handleSubmitRating = useCallback(async (score) => {
    if (!ratingTarget) return;
    setRatingLoading(true);
    try {
      await ratingsAPI.submit(ratingTarget.rideId, ratingTarget.rateeUserId, score);
      // Brief delay to show success state
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

  // Cancellation actions
  const initiateCancelRide = useCallback(async () => {
    const rideId = activeRide?.ride_id;
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
    const rideId = activeRide?.ride_id;
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
      // Reset to idle
      setRidePhase('idle');
      setPickupCoords(null);
      setDropoffCoords(null);
      setPickupAddr('');
      setDropoffAddr('');
      setActiveRequest(null);
      setActiveRide(null);
      setDriverLocation(null);
      stopPolling();
      stopRiderLocationTracking();
      clearRoute();
      stopRouteChecking();
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      setCancelLoading(false);
      setShowCancelReason(false);
      setError(err.response?.data?.error || 'Failed to cancel ride');
    }
  }, [activeRide, stopPolling, stopRiderLocationTracking, clearRoute, stopRouteChecking, fetchWalletBalance]);

  const abortCancel = useCallback(() => {
    setShowCancelConfirm(false);
    setCancelFee(null);
  }, []);

  // Handle mutual cancellation (called from ChatPanel)
  const handleMutualCancellation = useCallback(() => {
    fetchWalletBalance();
    setRidePhase('idle');
    setPickupCoords(null);
    setDropoffCoords(null);
    setPickupAddr('');
    setDropoffAddr('');
    setActiveRequest(null);
    setActiveRide(null);
    setDriverLocation(null);
    stopPolling();
    stopRiderLocationTracking();
    clearRoute();
    stopRouteChecking();
    sessionStorage.removeItem(STORAGE_KEY);
  }, [stopPolling, stopRiderLocationTracking, clearRoute, stopRouteChecking, fetchWalletBalance]);

  // On mount: check for existing active ride + geolocation + wallet + rating
  useEffect(() => {
    // Check if this is a test account
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.email && isTestAccount(user.email)) {
      isTestAccRef.current = true;
      setIsTestAcc(true);
    }

    fetchWalletBalance();
    fetchMyRating();
    fetchScheduledRides();
    checkActiveRide().then(() => {
      if (['searching', 'matched', 'in_progress'].includes(ridePhaseRef.current)) {
        startPolling();
      }
    });
    startRiderLocationTracking();
    return () => {
      stopPolling();
      stopRiderLocationTracking();
      if (riderWatchIdRef.current != null) {
        navigator.geolocation.clearWatch(riderWatchIdRef.current);
      }
      if (testLocationPollRef.current) {
        clearInterval(testLocationPollRef.current);
      }
      if (riderSyncIntervalRef.current) {
        clearInterval(riderSyncIntervalRef.current);
      }
    };
  }, []);

  const value = {
    // Phase
    ridePhase, setRidePhase, ridePhaseRef,
    // Booking form
    pickupAddr, setPickupAddr, dropoffAddr, setDropoffAddr,
    pickupCoords, setPickupCoords, dropoffCoords, setDropoffCoords,
    clickMode, setClickMode, mapCenter, setMapCenter,
    // Fare
    fareEstimate,
    // Active ride
    activeRequest, activeRide, statusMessage, setStatusMessage,
    // UI
    error, setError, loading, userLocation,
    // Wallet & Promo
    walletBalance, promoCode, setPromoCode, promoResult, setPromoResult, promoLoading,
    // Vehicle type
    vehicleType, setVehicleType,
    // Scheduled rides
    scheduledTime, setScheduledTime, scheduledRides, scheduleSuccess, setScheduleSuccess,
    fetchScheduledRides, handleCancelScheduledRide,
    // Nearby vehicles
    nearbyVehicles,
    // Driver live location (for rider tracking)
    driverLocation,
    // Rider live location (for test account location simulation and ride tracking)
    riderLocation,
    // Actions
    handleMapClick, handleUseMyLocation, handleGetEstimate,
    handleConfirmRide, handleValidatePromo, handleCancelRequest,
    resetBooking, fetchWalletBalance, stopPolling,
    startPolling, checkActiveRide,
    // Route (re-exported for convenience)
    routePath, routeInfo, routeLoading, eta, wasRerouted,
    // Rating
    showRatingModal, ratingTarget, ratingLoading, userRating,
    handleSubmitRating, handleSkipRating, fetchMyRating,
    // Cancellation
    showCancelConfirm, showCancelReason, cancelFee, cancelLoading,
    initiateCancelRide, confirmCancelRide, submitCancelReason, abortCancel,
    handleMutualCancellation,
  };

  return (
    <RideContext.Provider value={value}>
      {children}
    </RideContext.Provider>
  );
}

// Layout route wrapper that renders child routes inside the provider
export function RideProviderLayout() {
  return (
    <RideProvider>
      <Outlet />
    </RideProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRide() {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide must be used within a RideProvider');
  return ctx;
}

export default RideContext;
