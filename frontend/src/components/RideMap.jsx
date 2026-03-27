import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from '@react-google-maps/api';
import RoutePolyline from './RoutePolyline';
import RouteInfo from './RouteInfo';

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '100%',
  borderRadius: '12px',
};

// Must match the LIBRARIES array in BookingMap so useJsApiLoader gets identical options
const LIBRARIES = ['places'];

const DEFAULT_ZOOM = 14;

const DRIVER_ICON = {
  path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
  fillColor: '#000000',
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 3,
  scale: 1,
};

const RIDER_ICON = {
  path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
  fillColor: '#7B61FF',
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 3,
  scale: 1,
};

function RideMap({
  driverLocation,
  rideRequests = [],
  onAccept,
  onReject,
  routePath = [],
  routeInfo = null,
  routeLoading = false,
  eta = null,
  wasRerouted = false,
  pickupLocation = null,
  dropoffLocation = null,
  riderLocation = null,
  rideStatus = null,
  driverToPickupRoute = null,
  riderToPickupRoute = null,
}) {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const mapRef = useRef(null);
  // Capture initial center once so location updates don't jerk the map
  const [initialCenter] = useState(
    () => driverLocation || { lat: 23.8103, lng: 90.4125 }
  );

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
  });

  const handleMapClick = useCallback(() => {
    setSelectedRequest(null);
  }, []);

  const handleMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // Fit bounds once per ride status when routes first become available
  const hasFitBoundsRef = useRef(false);
  const lastStatusRef = useRef(rideStatus);

  useEffect(() => {
    // Reset when status changes so new status gets one fitBounds
    if (rideStatus !== lastStatusRef.current) {
      hasFitBoundsRef.current = false;
      lastStatusRef.current = rideStatus;
    }
    if (hasFitBoundsRef.current) return;
    if (!mapRef.current) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    if (rideStatus === 'driver_assigned') {
      if (driverToPickupRoute && driverToPickupRoute.length > 1) {
        driverToPickupRoute.forEach((p) => bounds.extend(p));
        hasPoints = true;
      }
      if (pickupLocation) { bounds.extend(pickupLocation); hasPoints = true; }
    } else if (routePath.length > 1) {
      routePath.forEach((point) => bounds.extend(point));
      hasPoints = true;
    }

    if (hasPoints) {
      mapRef.current.fitBounds(bounds, { top: 60, bottom: 80, left: 40, right: 40 });
      hasFitBoundsRef.current = true;
    }
  }, [routePath, rideStatus, driverToPickupRoute, riderToPickupRoute, pickupLocation]);

  if (loadError) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#E11900', background: '#FFF0EE', borderRadius: '12px', fontSize: '14px' }}>
        Failed to load Google Maps. Check your API key in <code>frontend/.env</code>.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ height: '480px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', borderRadius: '12px', color: '#6B6B6B', fontSize: '14px' }}>
        Loading map...
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={initialCenter}
        zoom={DEFAULT_ZOOM}
        onClick={handleMapClick}
        onLoad={handleMapLoad}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
          ],
        }}
      >
        {driverLocation && (
          <Marker
            position={driverLocation}
            icon={DRIVER_ICON}
            title="Your location"
            zIndex={10}
          />
        )}

        {rideRequests.map((req) => (
          <Marker
            key={req.request_id}
            position={{ lat: parseFloat(req.pickup_lat), lng: parseFloat(req.pickup_lng) }}
            title={`Pickup: ${req.pickup_addr}`}
            onClick={() => setSelectedRequest(req)}
          />
        ))}

        {selectedRequest && (
          <InfoWindow
            position={{
              lat: parseFloat(selectedRequest.pickup_lat),
              lng: parseFloat(selectedRequest.pickup_lng),
            }}
            onCloseClick={() => setSelectedRequest(null)}
          >
            <div style={{ minWidth: '220px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', color: '#000' }}>
              <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '15px' }}>
                {selectedRequest.rider_name}
              </div>
              <div style={{ fontSize: '13px', color: '#6B6B6B', marginBottom: '4px' }}>
                From: {selectedRequest.pickup_addr}
              </div>
              <div style={{ fontSize: '13px', color: '#6B6B6B', marginBottom: '4px' }}>
                To: {selectedRequest.dropoff_addr}
              </div>
              <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                Distance:{' '}
                <strong>{(selectedRequest.distance_meters / 1000).toFixed(1)} km</strong>
              </div>
              {selectedRequest.estimated_fare && (
                <div style={{ fontSize: '15px', marginBottom: '10px', fontWeight: 700 }}>
                  {selectedRequest.estimated_fare} BDT
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    onAccept(selectedRequest.request_id);
                    setSelectedRequest(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                  }}
                >
                  Accept
                </button>
                <button
                  onClick={() => {
                    onReject(selectedRequest.request_id);
                    setSelectedRequest(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#F6F6F6',
                    color: '#000',
                    border: '1px solid #E2E2E2',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          </InfoWindow>
        )}

        {/* Route polylines — phase-aware */}
        {rideStatus === 'driver_assigned' && driverToPickupRoute && driverToPickupRoute.length > 1 && (
          <RoutePolyline path={driverToPickupRoute} active />
        )}
        {rideStatus === 'started' && routePath.length > 1 && (
          <RoutePolyline path={routePath} active />
        )}
        {!rideStatus && routePath.length > 1 && (
          <RoutePolyline path={routePath} active />
        )}

        {/* Pickup marker — phase-aware */}
        {pickupLocation && rideStatus !== 'started' && (
          <Marker
            position={pickupLocation}
            icon={{
              path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
              fillColor: '#05944F',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
              scale: 1.2,
            }}
            title="Pickup"
            zIndex={8}
          />
        )}
        {pickupLocation && rideStatus === 'started' && (
          <Marker
            position={pickupLocation}
            icon={{
              path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
              fillColor: '#05944F',
              fillOpacity: 0.35,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              scale: 1.2,
            }}
            title="Pickup (passed)"
            zIndex={6}
          />
        )}

        {/* Dropoff marker — hidden during driver_assigned */}
        {dropoffLocation && rideStatus !== 'driver_assigned' && (
          <Marker
            position={dropoffLocation}
            icon={{
              path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
              fillColor: '#E11900',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
              scale: 1.2,
            }}
            title="Dropoff"
            zIndex={8}
          />
        )}

        {/* Rider location marker (purple dot) */}
        {riderLocation && rideStatus !== 'driver_assigned' && (
          <Marker
            position={riderLocation}
            icon={RIDER_ICON}
            title="Rider"
            zIndex={9}
          />
        )}
      </GoogleMap>

      {/* Route polyline */}
      {/* We render it outside GoogleMap children workaround — actually it must be inside */}

      {/* Route info overlay */}
      {(routeInfo || routeLoading) && (
        <RouteInfo
          routeInfo={routeInfo}
          eta={eta}
          wasRerouted={wasRerouted}
          loading={routeLoading}
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
          }}
        />
      )}

      {/* Recenter button */}
      {driverLocation && (
        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.panTo(driverLocation);
              mapRef.current.setZoom(15);
            }
          }}
          title="Center on my location"
          style={{
            position: 'absolute', bottom: '60px', left: '14px', zIndex: 5,
            width: '40px', height: '40px', borderRadius: '50%',
            background: '#fff', border: '1px solid #E2E2E2',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </button>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '14px',
        left: '14px',
        background: 'rgba(255,255,255,0.96)',
        borderRadius: '8px',
        padding: '8px 14px',
        fontSize: '12px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        display: 'flex',
        gap: '14px',
        alignItems: 'center',
        color: '#000',
        fontWeight: 500,
      }}>
        <span>
          <span style={{ fontWeight: 'bold' }}>&#9679;</span> You
        </span>
        {riderLocation && (
          <span>
            <span style={{ color: '#7B61FF', fontWeight: 'bold' }}>&#9679;</span> Rider
          </span>
        )}
        <span>
          <span style={{ color: '#E11900', fontWeight: 'bold' }}>&#9679;</span> Requests ({rideRequests.length})
        </span>
      </div>
    </div>
  );
}

export default RideMap;
