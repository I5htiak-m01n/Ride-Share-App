export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Estimate travel time in minutes (assume 40 km/h average driving speed)
export function estimateTime(distanceKm) {
  const averageSpeed = 40;
  const timeHours = distanceKm / averageSpeed;
  return Math.max(1, Math.round(timeHours * 60));
}

// Format distance for display ("500m" or "1.2 km")
export function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)}m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

// Check if two coordinates are within a proximity threshold (meters)
export function isWithinProximity(lat1, lng1, lat2, lng2, thresholdMeters) {
  const distanceMeters = haversineDistance(lat1, lng1, lat2, lng2);
  return distanceMeters <= thresholdMeters;
}
