function RatingBadge({ ratingAvg, ratingCount }) {
  const hasRating = ratingAvg !== null && ratingAvg !== undefined;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '13px',
        fontWeight: 500,
        color: hasRating ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.5)',
        background: 'rgba(255, 255, 255, 0.12)',
        padding: '4px 10px',
        borderRadius: '20px',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={hasRating ? '#F5A623' : 'none'}
        stroke={hasRating ? '#F5A623' : 'rgba(255,255,255,0.5)'}
        strokeWidth="2"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      {hasRating ? ratingAvg.toFixed(1) : '--'}
      {hasRating && ratingCount !== undefined && (
        <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
          ({ratingCount})
        </span>
      )}
    </span>
  );
}

export default RatingBadge;
