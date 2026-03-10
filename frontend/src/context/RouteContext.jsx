import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ridesAPI } from '../api/client';
import { decodePolyline } from '../utils/polyline';

const RouteContext = createContext(null);

export function RouteProvider({ children }) {
  // Current route data from Google Directions
  const [routeData, setRouteData] = useState(null);
  // Decoded polyline path for rendering
  const [routePath, setRoutePath] = useState([]);
  // Route metadata
  const [routeInfo, setRouteInfo] = useState(null);
  // Loading state
  const [routeLoading, setRouteLoading] = useState(false);
  // Error state
  const [routeError, setRouteError] = useState(null);
  // Remaining ETA info (for in-progress rides)
  const [eta, setEta] = useState(null);
  // Whether the last check detected an off-route condition
  const [wasRerouted, setWasRerouted] = useState(false);

  const routeCheckIntervalRef = useRef(null);

  /**
   * Fetch a route preview between two points (for fare estimation / booking).
   */
  const fetchRoutePreview = useCallback(async (originLat, originLng, destLat, destLng) => {
    setRouteLoading(true);
    setRouteError(null);
    try {
      const res = await ridesAPI.getDirections(originLat, originLng, destLat, destLng);
      const route = res.data.route;

      setRouteData(route);
      setRoutePath(decodePolyline(route.overview_polyline));
      setRouteInfo({
        distance_text: route.distance_text,
        distance_meters: route.distance_meters,
        duration_text: route.duration_text,
        duration_seconds: route.duration_seconds,
        bounds: route.bounds,
      });
      setEta(null);
      setWasRerouted(false);

      return route;
    } catch (err) {
      console.error('fetchRoutePreview error:', err);
      setRouteError(err.response?.data?.error || 'Failed to get route');
      return null;
    } finally {
      setRouteLoading(false);
    }
  }, []);

  /**
   * Load a stored route for an active ride (from backend DB).
   */
  const fetchRideRoute = useCallback(async (rideId) => {
    if (!rideId) return null;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const res = await ridesAPI.getRideRoute(rideId);
      const route = res.data.route;

      setRouteData(route);
      setRoutePath(decodePolyline(route.overview_polyline));
      setRouteInfo({
        distance_text: route.distance_text,
        distance_meters: route.distance_meters,
        duration_text: route.duration_text,
        duration_seconds: route.duration_seconds,
        bounds: {
          northeast: { lat: parseFloat(route.bounds_ne_lat), lng: parseFloat(route.bounds_ne_lng) },
          southwest: { lat: parseFloat(route.bounds_sw_lat), lng: parseFloat(route.bounds_sw_lng) },
        },
      });

      return route;
    } catch (err) {
      console.error('fetchRideRoute error:', err);
      // Don't show error for 404 (no route yet)
      if (err.response?.status !== 404) {
        setRouteError(err.response?.data?.error || 'Failed to get route');
      }
      return null;
    } finally {
      setRouteLoading(false);
    }
  }, []);

  /**
   * Check route progress and trigger reroute if driver is off-route.
   * Called periodically during an active ride.
   */
  const checkRouteProgress = useCallback(async (rideId, driverLat, driverLng) => {
    if (!rideId || !driverLat || !driverLng) return null;
    try {
      const res = await ridesAPI.checkRoute(rideId, driverLat, driverLng);
      const data = res.data;

      // Update ETA
      setEta({
        remaining_seconds: data.remaining_seconds,
        remaining_meters: data.remaining_meters,
        remaining_text: data.remaining_text,
        progress_percent: data.progress_percent,
      });

      // If rerouted, update the polyline
      if (data.rerouted && data.directions) {
        setRouteData(data.directions);
        setRoutePath(decodePolyline(data.directions.overview_polyline));
        setRouteInfo({
          distance_text: data.directions.distance_text,
          distance_meters: data.directions.distance_meters,
          duration_text: data.directions.duration_text,
          duration_seconds: data.directions.duration_seconds,
          bounds: data.directions.bounds,
        });
        setWasRerouted(true);
      } else {
        setWasRerouted(false);
      }

      return data;
    } catch (err) {
      console.error('checkRouteProgress error:', err);
      return null;
    }
  }, []);

  /**
   * Stop periodic route checking.
   */
  const stopRouteChecking = useCallback(() => {
    if (routeCheckIntervalRef.current) {
      clearInterval(routeCheckIntervalRef.current);
      routeCheckIntervalRef.current = null;
    }
  }, []);

  /**
   * Start periodic route checking (every 30s).
   */
  const startRouteChecking = useCallback((rideId, getDriverLocation) => {
    stopRouteChecking();
    routeCheckIntervalRef.current = setInterval(async () => {
      const loc = typeof getDriverLocation === 'function' ? getDriverLocation() : getDriverLocation;
      if (loc?.lat && loc?.lng) {
        await checkRouteProgress(rideId, loc.lat, loc.lng);
      }
    }, 30000);
  }, [checkRouteProgress, stopRouteChecking]);

  /**
   * Clear all route state.
   */
  const clearRoute = useCallback(() => {
    setRouteData(null);
    setRoutePath([]);
    setRouteInfo(null);
    setRouteError(null);
    setEta(null);
    setWasRerouted(false);
    stopRouteChecking();
  }, [stopRouteChecking]);

  const value = {
    // State
    routeData,
    routePath,
    routeInfo,
    routeLoading,
    routeError,
    eta,
    wasRerouted,
    // Actions
    fetchRoutePreview,
    fetchRideRoute,
    checkRouteProgress,
    startRouteChecking,
    stopRouteChecking,
    clearRoute,
  };

  return (
    <RouteContext.Provider value={value}>
      {children}
    </RouteContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRoute() {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute must be used within a RouteProvider');
  return ctx;
}

export default RouteContext;
