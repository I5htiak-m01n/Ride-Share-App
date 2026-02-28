import { useCallback } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';

const DEFAULT_STYLE = {
  width: '100%',
  height: '400px',
  borderRadius: '12px',
};

const FULLSCREEN_STYLE = {
  width: '100%',
  height: 'calc(100vh - 64px)',
  borderRadius: '0',
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
  fullscreen = false,
  userLocation,
  nearbyVehicles = [],
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  const handleClick = useCallback((e) => {
    if (onMapClick) {
      onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, [onMapClick]);

  const containerStyle = fullscreen ? FULLSCREEN_STYLE : DEFAULT_STYLE;

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
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={fullscreen ? 15 : 14}
      onClick={handleClick}
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
      {/* User location blue dot */}
      {userLocation && !pickupLocation && (
        <Marker position={userLocation} icon={USER_DOT_ICON} title="Your location" zIndex={15} />
      )}

      {/* Pickup marker */}
      {pickupLocation && (
        <Marker position={pickupLocation} icon={PICKUP_ICON} title="Pickup" zIndex={10} />
      )}

      {/* Dropoff marker */}
      {dropoffLocation && (
        <Marker position={dropoffLocation} icon={DROPOFF_ICON} title="Dropoff" zIndex={9} />
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
  );
}

export default BookingMap;
