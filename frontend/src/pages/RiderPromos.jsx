import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ridesAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

export default function RiderPromos() {
  const navigate = useNavigate();

  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPromos = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await ridesAPI.getAvailablePromos();
      setPromos(data.promos);
    } catch {
      setError('Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }) : null;

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).catch(() => {});
  };

  return (
    <div className="dashboard-container">
      <NavBar />

      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={() => navigate('/rider/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Available Promos</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading && (
          <p style={{ textAlign: 'center', color: '#6B6B6B', marginTop: 40 }}>Loading promos...</p>
        )}

        {!loading && promos.length === 0 && (
          <div className="empty-state">
            <h3>No promos available</h3>
            <p>Check back later for new discount offers!</p>
          </div>
        )}

        {!loading && promos.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}>
            {promos.map(p => (
              <div
                key={p.promo_id}
                style={{
                  background: '#fff',
                  border: '2px dashed #000',
                  borderRadius: 12,
                  padding: 24,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Discount badge */}
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  background: '#000', color: '#fff',
                  padding: '6px 16px', borderBottomLeftRadius: 12,
                  fontSize: 13, fontWeight: 600,
                }}>
                  {parseFloat(p.discount_amount).toFixed(0)} BDT OFF
                </div>

                {/* Promo code */}
                <div style={{
                  fontFamily: 'monospace', fontSize: 22, fontWeight: 700,
                  letterSpacing: 2, marginBottom: 12, marginTop: 4,
                }}>
                  {p.promo_code}
                </div>

                {/* Details */}
                <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Remaining uses:</span>
                    <strong style={{ color: p.remaining_uses <= 1 ? '#d32f2f' : '#2e7d32' }}>
                      {p.remaining_uses}
                    </strong>
                  </div>
                  {p.expiry_date && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Valid until:</span>
                      <strong>{fmtDate(p.expiry_date)}</strong>
                    </div>
                  )}
                </div>

                {/* Copy button */}
                <button
                  onClick={() => copyCode(p.promo_code)}
                  style={{
                    marginTop: 16, width: '100%', padding: '10px 0',
                    background: '#000', color: '#fff', border: 'none',
                    borderRadius: 8, cursor: 'pointer', fontWeight: 600,
                    fontSize: 14, transition: 'background 0.15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#333'}
                  onMouseOut={e => e.currentTarget.style.background = '#000'}
                >
                  Copy Code
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
