import { Polyline } from '@react-google-maps/api';

const ACTIVE_STYLE = {
  strokeColor: '#276EF1',
  strokeOpacity: 1.0,
  strokeWeight: 5,
  zIndex: 10,
};

const ACTIVE_OUTLINE = {
  strokeColor: '#1A4DB0',
  strokeOpacity: 1.0,
  strokeWeight: 8,
  zIndex: 5,
};

const INACTIVE_STYLE = {
  strokeColor: '#BDC1C6',
  strokeOpacity: 0.8,
  strokeWeight: 4,
  zIndex: 2,
};

const INACTIVE_OUTLINE = {
  strokeColor: '#80868B',
  strokeOpacity: 0.8,
  strokeWeight: 7,
  zIndex: 1,
};

/**
 * RoutePolyline — renders a Google Maps polyline for a route.
 *
 * Props:
 *   path     – Array of { lat, lng } coordinate points
 *   active   – Whether this is the active/primary route (default true)
 *   onClick  – Optional click handler
 */
function RoutePolyline({ path, active = true, dashed = false, color, onClick }) {
  if (!path || path.length < 2) return null;

  if (dashed) {
    const dashColor = color || (active ? '#276EF1' : '#BDC1C6');
    return (
      <Polyline
        path={path}
        options={{
          strokeColor: dashColor,
          strokeOpacity: 0,
          strokeWeight: 4,
          zIndex: active ? 10 : 2,
          icons: [{
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
            offset: '0',
            repeat: '14px',
          }],
        }}
        onClick={onClick}
      />
    );
  }

  let outerStyle = active ? ACTIVE_OUTLINE : INACTIVE_OUTLINE;
  let innerStyle = active ? ACTIVE_STYLE : INACTIVE_STYLE;

  if (color) {
    innerStyle = { ...innerStyle, strokeColor: color };
    outerStyle = { ...outerStyle, strokeColor: color, strokeOpacity: 0.4 };
  }

  return (
    <>
      {/* Outer stroke (border effect) */}
      <Polyline
        path={path}
        options={outerStyle}
        onClick={onClick}
      />
      {/* Inner stroke (fill) */}
      <Polyline
        path={path}
        options={innerStyle}
        onClick={onClick}
      />
    </>
  );
}

export default RoutePolyline;
