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
  maxWidth: '420px',
  width: '90%',
  boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2)',
};

function CancelConfirmModal({ fee, currency = 'BDT', onConfirm, onCancel, loading }) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E11900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700 }}>
          Cancel Ride?
        </h3>
        <p style={{ color: '#6B6B6B', fontSize: '14px', margin: '0 0 8px', lineHeight: '1.5' }}>
          A cancellation fee will be charged from your wallet and paid to the other party.
        </p>
        <p style={{ fontSize: '22px', fontWeight: 700, color: '#E11900', margin: '8px 0 24px' }}>
          {fee} {currency}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            disabled={loading}
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
            Go Back
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '12px 28px',
              background: '#E11900',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Cancelling...' : 'Confirm Cancellation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CancelConfirmModal;
