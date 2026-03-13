import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analyticsAPI } from '../api/client';
import './Dashboard.css';

export default function AdminAnalytics() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [topDrivers, setTopDrivers] = useState([]);
  const [zoneRevenue, setZoneRevenue] = useState([]);
  const [promoPerformance, setPromoPerformance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [driversRes, zonesRes, promosRes] = await Promise.all([
          analyticsAPI.getTopDrivers(),
          analyticsAPI.getZoneRevenue(),
          analyticsAPI.getPromoPerformance(),
        ]);
        setTopDrivers(driversRes.data.top_drivers);
        setZoneRevenue(zonesRes.data.zone_revenue);
        setPromoPerformance(promosRes.data.promo_performance);
      } catch {
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand"><h2>Admin Analytics</h2></div>
        <div className="nav-user">
          <span>Welcome, {user?.first_name}</span>
          <Link to="/admin/dashboard" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
            ← Dashboard
          </Link>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="dashboard-content" style={{ padding: '32px 40px' }}>
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

            {/* ── Complex Query 2: Ride Volume & Revenue by Zone ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ marginBottom: 16 }}>Ride Volume & Revenue by Zone</h2>
              {/* <p style={{ color: '#666', marginBottom: 16 }}>
                Aggregates ride counts and revenue per pricing zone using JOIN across
                <code> pricing_zones</code>, <code>rides</code>, and <code>invoices</code>.
              </p> */}
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={theadRowStyle}>
                      <th style={thStyle}>Zone</th>
                      <th style={thStyle}>Base Rate</th>
                      <th style={thStyle}>Total Rides</th>
                      <th style={thStyle}>Total Revenue (BDT)</th>
                      <th style={thStyle}>Avg Fare (BDT)</th>
                      <th style={thStyle}>Driver Earnings (BDT)</th>
                      <th style={thStyle}>Platform Fees (BDT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoneRevenue.length === 0 ? (
                      <tr><td colSpan={7} style={emptyStyle}>No data available</td></tr>
                    ) : zoneRevenue.map((z, i) => (
                      <tr key={z.zone_id} style={i % 2 === 0 ? evenRowStyle : {}}>
                        <td style={tdStyle}>{z.zone_name}</td>
                        <td style={tdStyle}>{z.base_rate}</td>
                        <td style={tdStyle}>{z.total_rides}</td>
                        <td style={tdStyle}>{Number(z.total_revenue).toFixed(2)}</td>
                        <td style={tdStyle}>{Number(z.avg_fare_per_ride).toFixed(2)}</td>
                        <td style={tdStyle}>{Number(z.total_driver_earnings).toFixed(2)}</td>
                        <td style={tdStyle}>{Number(z.total_platform_fees).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Complex Query 3: Promo Performance ── */}
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
