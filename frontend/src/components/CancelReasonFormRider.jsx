import { useState } from 'react';

const REASONS = [
  'Faulty Vehicle',
  'Driver not responding',
  'Changed plans',
  'Safety concern',
  'Long wait time',
  'Other',
];

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
  maxWidth: '440px',
  width: '90%',
  boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2)',
};

function CancelReasonForm({ onSubmit, loading }) {
  const [selected, setSelected] = useState(null);
  const [otherText, setOtherText] = useState('');

  const handleSubmit = () => {
    if (!selected) return;
    const reason = selected === 'Other' ? (otherText.trim() || 'Other') : selected;
    onSubmit(reason);
  };

  const canSubmit = selected && (selected !== 'Other' || otherText.trim());

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700 }}>
          Why did you cancel?
        </h3>
        <p style={{ color: '#6B6B6B', fontSize: '14px', margin: '0 0 20px' }}>
          Your feedback helps us improve the experience.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
          {REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => setSelected(reason)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: selected === reason ? '2px solid #000' : '1px solid #E2E2E2',
                background: selected === reason ? '#000' : '#fff',
                color: selected === reason ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: selected === reason ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {reason}
            </button>
          ))}
        </div>

        {selected === 'Other' && (
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Please describe..."
            maxLength={300}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '12px',
              border: '1px solid #E2E2E2',
              borderRadius: '8px',
              fontSize: '14px',
              resize: 'vertical',
              marginBottom: '16px',
              boxSizing: 'border-box',
            }}
          />
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          style={{
            padding: '12px 32px',
            background: canSubmit ? '#000' : '#E2E2E2',
            color: canSubmit ? '#fff' : '#6B6B6B',
            border: 'none',
            borderRadius: '8px',
            cursor: canSubmit ? 'pointer' : 'default',
            fontWeight: 600,
            fontSize: '14px',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

export default CancelReasonForm;
