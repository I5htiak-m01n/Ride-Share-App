import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

export default function AdminAnalytics() {
  const navigate = useNavigate();

  const [topDrivers, setTopDrivers] = useState([]);
  const [promoPerformance, setPromoPerformance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [driversRes, promosRes] = await Promise.all([
          analyticsAPI.getTopDrivers(),
          analyticsAPI.getPromoPerformance(),
        ]);
        setTopDrivers(driversRes.data.top_drivers);
        setPromoPerformance(promosRes.data.promo_performance);
      } catch {
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  return (
    <div className="dashboard-container">
      <NavBar brandText="Admin Analytics" />

      <div className="dashboard-content" style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={() => navigate('/admin/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Analytics</h1>
        </div>
        {loading && <p>Loading analytics…</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}

        {!loading && !error && (
          <>
            {/* ── Complex Query 1: Top Drivers by Earnings ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ marginBottom: 16 }}>Top Drivers by Earnings</h2>
              {/* <p style={{ color: '#666', marginBottom: 16 }}>
                Aggregates completed ride earnings per driver using JOIN across
                <code> drivers</code>, <code>users</code>, and <code>rides</code>.
              </p> */}
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={theadRowStyle}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Driver</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Rating</th>
                      <th style={thStyle}>Total Rides</th>
                      <th style={thStyle}>Total Earnings (BDT)</th>
                      <th style={thStyle}>Avg Fare (BDT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDrivers.length === 0 ? (
                      <tr><td colSpan={7} style={emptyStyle}>No data available</td></tr>
                    ) : topDrivers.map((d, i) => (
                      <tr key={d.driver_id} style={i % 2 === 0 ? evenRowStyle : {}}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}>{d.driver_name}</td>
                        <td style={tdStyle}>{d.email}</td>
                        <td style={tdStyle}>{d.rating_avg ?? '—'}</td>
                        <td style={tdStyle}>{d.total_rides}</td>
                        <td style={tdStyle}>{Number(d.total_earnings).toFixed(2)}</td>
                        <td style={tdStyle}>{Number(d.avg_fare).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Complex Query 2: Promo Performance ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ marginBottom: 16 }}>Promo Code Performance</h2>
              {/* <p style={{ color: '#666', marginBottom: 16 }}>
                Aggregates promo usage stats using JOIN across
                <code> promos</code>, <code>promo_redemptions</code>, and <code>rides</code>.
              </p> */}
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={theadRowStyle}>
                      <th style={thStyle}>Code</th>
                      <th style={thStyle}>Discount (BDT)</th>
                      <th style={thStyle}>Max Uses</th>
                      <th style={thStyle}>Active</th>
                      <th style={thStyle}>Expiry</th>
                      <th style={thStyle}>Times Used</th>
                      <th style={thStyle}>Total Discount Given (BDT)</th>
                      <th style={thStyle}>Avg Discount/Use (BDT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoPerformance.length === 0 ? (
                      <tr><td colSpan={8} style={emptyStyle}>No data available</td></tr>
                    ) : promoPerformance.map((p, i) => (
                      <tr key={p.promo_id} style={i % 2 === 0 ? evenRowStyle : {}}>
                        <td style={tdStyle}><strong>{p.code}</strong></td>
                        <td style={tdStyle}>{p.discount_amount}</td>
                        <td style={tdStyle}>{p.max_uses ?? '∞'}</td>
                        <td style={tdStyle}>{p.is_active ? 'Yes' : 'No'}</td>
                        <td style={tdStyle}>{p.expiry_date ? new Date(p.expiry_date).toLocaleDateString() : '—'}</td>
                        <td style={tdStyle}>{p.times_used}</td>
                        <td style={tdStyle}>{Number(p.total_discount_given).toFixed(2)}</td>
                        <td style={tdStyle}>{Number(p.avg_discount_per_use).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
  background: '#fff',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  overflow: 'hidden',
};

const theadRowStyle = {
  background: '#1a1a1a',
  color: '#fff',
};

const thStyle = {
  padding: '12px 16px',
  textAlign: 'left',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #f0f0f0',
  verticalAlign: 'middle',
};

const evenRowStyle = {
  background: '#fafafa',
};

const emptyStyle = {
  padding: '24px 16px',
  textAlign: 'center',
  color: '#888',
};
