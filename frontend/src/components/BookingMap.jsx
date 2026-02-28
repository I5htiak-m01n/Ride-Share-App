import { useCallback } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '400px',
  borderRadius: '12px',
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

function BookingMap({ pickupLocation, dropoffLocation, onMapClick, centerLocation }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  const handleClick = useCallback((e) => {
    if (onMapClick) {
      onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, [onMapClick]);

  if (loadError) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#E11900', background: '#FFF0EE', borderRadius: '12px', fontSize: '14px' }}>
        Failed to load Google Maps. Check your API key.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F6', borderRadius: '12px', color: '#6B6B6B', fontSize: '14px' }}>
        Loading map...
      </div>
    );
  }

  const center = centerLocation || pickupLocation || { lat: 23.8103, lng: 90.4125 };

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={center}
      zoom={14}
      onClick={handleClick}
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
      {pickupLocation && (
        <Marker position={pickupLocation} icon={PICKUP_ICON} title="Pickup" zIndex={10} />
      )}
      {dropoffLocation && (
        <Marker position={dropoffLocation} icon={DROPOFF_ICON} title="Dropoff" zIndex={9} />
      )}
    </GoogleMap>
  );
}

export default BookingMap;
