/**
 * RouteInfo — displays route summary (distance, duration, ETA).
 *
 * Props:
 *   routeInfo    – { distance_text, duration_text }
 *   eta          – { remaining_text, progress_percent } (optional, for active rides)
 *   wasRerouted  – Boolean, show reroute indicator
 *   loading      – Boolean, show loading state
 *   style        – Additional styles for the container
 *   compact      – Boolean, show minimal version
 */
function RouteInfo({ routeInfo, eta, wasRerouted, loading, style, compact = false }) {
  if (loading) {
    return (
      <div style={{ ...styles.container, ...style }}>
        <div style={styles.loadingText}>Calculating route...</div>
      </div>
    );
  }

  if (!routeInfo) return null;

  if (compact) {
    return (
      <div style={{ ...styles.compactContainer, ...style }}>
        <span style={styles.compactIcon}>🛣️</span>
        <span style={styles.compactText}>
          {eta?.remaining_text || routeInfo.duration_text}
        </span>
        <span style={styles.compactDivider}>·</span>
        <span style={styles.compactText}>
          {routeInfo.distance_text}
        </span>
        {wasRerouted && <span style={styles.rerouteChip}>Rerouted</span>}
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, ...style }}>
      {/* Duration and Distance */}
      <div style={styles.mainRow}>
        <div style={styles.durationBlock}>
          <div style={styles.durationText}>
            {eta?.remaining_text || routeInfo.duration_text}
          </div>
          <div style={styles.label}>
            {eta ? 'Time remaining' : 'Estimated time'}
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.distanceBlock}>
          <div style={styles.distanceText}>
            {routeInfo.distance_text}
          </div>
          <div style={styles.label}>Distance</div>
        </div>
      </div>

      {/* Progress bar (when ETA is available) */}
      {eta && typeof eta.progress_percent === 'number' && (
        <div style={styles.progressRow}>
          <div style={styles.progressBarBg}>
            <div
              style={{
                ...styles.progressBarFill,
                width: `${Math.min(Math.max(eta.progress_percent, 0), 100)}%`,
              }}
            />
          </div>
          <span style={styles.progressLabel}>{eta.progress_percent}%</span>
        </div>
      )}

      {/* Reroute indicator */}
      {wasRerouted && (
        <div style={styles.rerouteRow}>
          <span style={styles.rerouteChip}>⚡ Route updated</span>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: 'rgba(255, 255, 255, 0.96)',
    borderRadius: '12px',
    padding: '12px 16px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    minWidth: '200px',
  },
  compactContainer: {
    background: 'rgba(255, 255, 255, 0.96)',
    borderRadius: '20px',
    padding: '6px 14px',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  compactIcon: {
    fontSize: '14px',
  },
  compactText: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#000',
  },
  compactDivider: {
    color: '#9AA0A6',
    fontSize: '13px',
  },
  mainRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  durationBlock: {
    flex: 1,
  },
  durationText: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#000',
    lineHeight: '28px',
  },
  label: {
    fontSize: '12px',
    color: '#6B6B6B',
    lineHeight: '16px',
    marginTop: '2px',
  },
  divider: {
    width: '1px',
    height: '36px',
    background: '#E2E2E2',
  },
  distanceBlock: {
    flex: 1,
    textAlign: 'right',
  },
  distanceText: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#000',
    lineHeight: '24px',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '10px',
  },
  progressBarBg: {
    flex: 1,
    height: '4px',
    background: '#E2E2E2',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: '#276EF1',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
  progressLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#6B6B6B',
    minWidth: '32px',
    textAlign: 'right',
  },
  rerouteRow: {
    marginTop: '8px',
  },
  rerouteChip: {
    display: 'inline-block',
    background: '#FFF3E0',
    color: '#E65100',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '10px',
  },
  loadingText: {
    fontSize: '13px',
    color: '#6B6B6B',
    textAlign: 'center',
    padding: '4px 0',
  },
};

export default RouteInfo;
