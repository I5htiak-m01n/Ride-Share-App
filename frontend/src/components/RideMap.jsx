import { useState, useCallback } from 'react';
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from '@react-google-maps/api';

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '100%',
  borderRadius: '12px',
};

const DEFAULT_ZOOM = 14;

const DRIVER_ICON = {
  path: 'M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
  fillColor: '#000000',
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 3,
  scale: 1,
};

function RideMap({ driverLocation, rideRequests = [], onAccept, onReject }) {
  const [selectedRequest, setSelectedRequest] = useState(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  const handleMapClick = useCallback(() => {
    setSelectedRequest(null);
  }, []);

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

  const center = driverLocation || { lat: 23.8103, lng: 90.4125 };

  return (
    <div style={{ position: 'relative' }}>
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={center}
        zoom={DEFAULT_ZOOM}
        onClick={handleMapClick}
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
      </GoogleMap>

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
        <span>
          <span style={{ color: '#E11900', fontWeight: 'bold' }}>&#9679;</span> Requests ({rideRequests.length})
        </span>
      </div>
    </div>
  );
}

export default RideMap;
