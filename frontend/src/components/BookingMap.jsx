import { useCallback, useRef, useEffect } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import RoutePolyline from './RoutePolyline';
import RouteInfo from './RouteInfo';

// Stable reference so useJsApiLoader doesn't reload on every render
const LIBRARIES = ['places'];

const DEFAULT_STYLE = {
  width: '100%',
  height: '400px',
  borderRadius: '12px',
};

const FULLSCREEN_STYLE = {
  width: '100%',
  height: '100%',
  borderRadius: '12px',
};

const FILL_PARENT_STYLE = {
  width: '100%',
  height: '100%',
  borderRadius: 0,
};

const PICKUP_ICON = {
  path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
  fillColor: '#05944F',
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 3,
  scale: 1.2,
};

const DROPOFF_ICON = {
  path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
  fillColor: '#E11900',
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 3,
  scale: 1.2,
};

const USER_DOT_ICON = {
  path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
  fillColor: '#276EF1',
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 3,
  scale: 1.3,
};

// Car-shaped SVG path for miniature vehicles
const VEHICLE_ICON = {
  path: 'M29.395,0H17.636c-3.117,0-5.643,3.467-5.643,6.584v34.804c0,3.116,2.526,5.644,5.643,5.644h11.759c3.116,0,5.644-2.527,5.644-5.644V6.584C35.037,3.467,32.511,0,29.395,0z M34.05,14.188v11.665l-2.729,0.351v-4.806L34.05,14.188z M32.618,10.773c-1.016,3.9-2.219,8.51-2.219,8.51H16.631l-2.222-8.51C14.41,10.773,23.293,7.755,32.618,10.773z M15.501,21.2v4.806l-2.73-0.349V14.188L15.501,21.2z M13.749,46.986h3.085v-1.604h13.358v1.604h3.085c0.87,0,1.581-0.716,1.581-1.589V28.059l-2.504-3.082H15.671l-2.503,3.082v17.337C13.168,46.27,13.879,46.986,13.749,46.986z',
  fillColor: '#333333',
  fillOpacity: 0.85,
  strokeColor: '#FFFFFF',
  strokeWeight: 0.5,
  scale: 0.45,
  anchor: { x: 24, y: 24 },
  rotation: 0,
};

function BookingMap({
  pickupLocation,
  dropoffLocation,
  onMapClick,
  centerLocation,
  panTo,
  fullscreen = false,
  fullHeight = false,
  userLocation,
  nearbyVehicles = [],
  driverLocation = null,
  riderLocation = null,
  routePath = [],
  routeInfo = null,
  routeLoading = false,
  eta = null,
  wasRerouted = false,
  // Phase-aware route props (optional — backwards-compatible)
  ridePhase = null,
  driverToPickupRoute = null,
  riderToPickupRoute = null,
  inProgressRoute = null,
}) {
  const mapRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
  });

  // Pan the map when panTo changes
  useEffect(() => {
    if (panTo && mapRef.current) {
      mapRef.current.panTo(panTo);
      mapRef.current.setZoom(15);
    }
  }, [panTo]);

  // Fit bounds to active route(s) when they change
  useEffect(() => {
    if (!mapRef.current) return;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    // Phase-aware: use phase-specific routes when available
    if (ridePhase === 'matched') {
      [driverToPickupRoute, riderToPickupRoute].forEach((route) => {
        if (route && route.length > 1) {
          route.forEach((p) => bounds.extend(p));
          hasPoints = true;
        }
      });
      if (pickupLocation) { bounds.extend(pickupLocation); hasPoints = true; }
    } else if (ridePhase === 'in_progress' && inProgressRoute && inProgressRoute.length > 1) {
      inProgressRoute.forEach((p) => bounds.extend(p));
      hasPoints = true;
    } else if (routePath.length > 1) {
      routePath.forEach((point) => bounds.extend(point));
      hasPoints = true;
    }

    if (driverLocation) { bounds.extend(driverLocation); hasPoints = true; }
    if (hasPoints) {
      mapRef.current.fitBounds(bounds, { top: 60, bottom: 60, left: 40, right: 40 });
    }
  }, [routePath, driverLocation, ridePhase, driverToPickupRoute, riderToPickupRoute, inProgressRoute, pickupLocation]);

  const handleLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const handleClick = useCallback((e) => {
    if (onMapClick) {
      onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, [onMapClick]);

  const containerStyle = fullHeight ? FILL_PARENT_STYLE : fullscreen ? FULLSCREEN_STYLE : DEFAULT_STYLE;

  if (loadError) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#E11900', background: '#FFF0EE', borderRadius: '12px', fontSize: '14px' }}>
        Failed to load Google Maps. Check your API key.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', color: '#6B6B6B', fontSize: '14px' }}>
        Loading map...
      </div>
    );
  }

  const center = centerLocation || userLocation || pickupLocation || { lat: 23.8103, lng: 90.4125 };

  return (
  <div style={{ position: 'relative', ...containerStyle }}>
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '12px' }}
      center={center}
      zoom={fullscreen ? 15 : 14}
      onClick={handleClick}
      onLoad={handleLoad}
      options={{
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: !fullscreen,
        zoomControl: true,
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
        ],
      }}
    >
      {/* User / Rider location blue dot */}
      {!ridePhase && userLocation && !pickupLocation && (
        <Marker position={userLocation} icon={USER_DOT_ICON} title="Your location" zIndex={15} />
      )}
      {ridePhase && (riderLocation || userLocation) && (
        <Marker position={riderLocation || userLocation} icon={USER_DOT_ICON} title="Your location" zIndex={15} />
      )}

      {/* Pickup marker — hide during in_progress phase (already passed) */}
      {pickupLocation && ridePhase !== 'in_progress' && (
        <Marker position={pickupLocation} icon={PICKUP_ICON} title="Pickup" zIndex={10} />
      )}
      {/* Grayed-out pickup during in_progress */}
      {pickupLocation && ridePhase === 'in_progress' && (
        <Marker position={pickupLocation} icon={{ ...PICKUP_ICON, fillOpacity: 0.35, strokeWeight: 1 }} title="Pickup (passed)" zIndex={6} />
      )}

      {/* Dropoff marker — hidden during matched phase */}
      {dropoffLocation && (!ridePhase || (ridePhase !== 'matched')) && (
        <Marker position={dropoffLocation} icon={DROPOFF_ICON} title="Dropoff" zIndex={9} />
      )}

      {/* Route polylines — phase-aware */}
      {ridePhase === 'matched' && (
        <>
          {driverToPickupRoute && driverToPickupRoute.length > 1 && (
            <RoutePolyline path={driverToPickupRoute} active={false} />
          )}
          {riderToPickupRoute && riderToPickupRoute.length > 1 && (
            <RoutePolyline path={riderToPickupRoute} active />
          )}
        </>
      )}
      {ridePhase === 'in_progress' && inProgressRoute && inProgressRoute.length > 1 && (
        <RoutePolyline path={inProgressRoute} active />
      )}
      {/* Default route (booking/confirming/searching or no phase) */}
      {(!ridePhase || ridePhase === 'booking' || ridePhase === 'confirming' || ridePhase === 'searching') && routePath.length > 1 && (
        <RoutePolyline path={routePath} active />
      )}

      {/* Driver live location marker (for rider tracking) */}
      {driverLocation && (
        <Marker
          position={driverLocation}
          icon={{ ...VEHICLE_ICON, fillColor: '#000000', fillOpacity: 1, scale: 0.6 }}
          title="Your driver"
          zIndex={12}
        />
      )}

      {/* Nearby vehicle markers */}
      {nearbyVehicles.map((v, i) => (
        <Marker
          key={`vehicle-${i}`}
          position={{ lat: v.lat, lng: v.lng }}
          icon={{ ...VEHICLE_ICON, rotation: v.rotation || 0 }}
          title="Nearby driver"
          zIndex={5}
        />
      ))}
    </GoogleMap>

    {/* Route info overlay */}
    {(routeInfo || routeLoading) && (
      <RouteInfo
        routeInfo={routeInfo}
        eta={eta}
        wasRerouted={wasRerouted}
        loading={routeLoading}
        compact={fullscreen}
        style={{
          position: 'absolute',
          bottom: fullscreen ? '16px' : '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 5,
        }}
      />
    )}
  </div>
  );
}

export default BookingMap;
