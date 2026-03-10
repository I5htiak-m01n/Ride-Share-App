import { useState } from 'react';

const starStyle = {
  cursor: 'pointer',
  transition: 'transform 0.1s ease',
  userSelect: 'none',
};

function StarIcon({ filled, hovered, size = 36, onClick, onMouseEnter, onMouseLeave }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled || hovered ? '#F5A623' : 'none'}
      stroke={filled || hovered ? '#F5A623' : '#BDC1C6'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        ...starStyle,
        transform: hovered && !filled ? 'scale(1.15)' : 'scale(1)',
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function RatingModal({ rateeName, onSubmit, onSkip, loading: externalLoading }) {
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (selectedRating === 0) return;
    setError(null);
    try {
      await onSubmit(selectedRating);
      setSubmitted(true);
    } catch (err) {
      setError(err?.message || 'Failed to submit rating');
    }
  };

  if (submitted) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600 }}>
            Thanks for rating!
          </h3>
          <p style={{ color: '#6B6B6B', fontSize: '14px', margin: 0 }}>
            Your feedback helps improve the experience.
          </p>
        </div>
      </div>
    );
  }

  const isLoading = externalLoading;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700 }}>
          Rate your ride
        </h3>
        <p style={{ color: '#6B6B6B', fontSize: '14px', margin: '0 0 24px' }}>
          How was your experience with <strong>{rateeName}</strong>?
        </p>

        {/* Star selector */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <StarIcon
              key={star}
              size={44}
              filled={star <= selectedRating}
              hovered={star <= hoverRating && star > selectedRating}
              onClick={() => setSelectedRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
            />
          ))}
        </div>

        {selectedRating > 0 && (
          <p style={{ color: '#000', fontSize: '15px', fontWeight: 500, margin: '0 0 20px' }}>
            {selectedRating === 1 && 'Poor'}
            {selectedRating === 2 && 'Below Average'}
            {selectedRating === 3 && 'Average'}
            {selectedRating === 4 && 'Good'}
            {selectedRating === 5 && 'Excellent'}
          </p>
        )}

        {error && (
          <p style={{ color: '#E11900', fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onSkip}
            disabled={isLoading}
            style={{
              padding: '12px 28px',
              background: '#fff',
              color: '#000',
              border: '1px solid #E2E2E2',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '14px',
            }}
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedRating === 0 || isLoading}
            style={{
              padding: '12px 28px',
              background: selectedRating > 0 ? '#000' : '#E2E2E2',
              color: selectedRating > 0 ? '#fff' : '#6B6B6B',
              border: 'none',
              borderRadius: '8px',
              cursor: selectedRating > 0 ? 'pointer' : 'default',
              fontWeight: 600,
              fontSize: '14px',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Submitting...' : 'Submit Rating'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle = {
  background: '#fff',
  borderRadius: '16px',
  padding: '32px 40px',
  textAlign: 'center',
  maxWidth: '400px',
  width: '90%',
  boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2)',
};

export default RatingModal;
