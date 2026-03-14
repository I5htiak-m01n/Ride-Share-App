import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../api/client';
import './Dashboard.css';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents', path: '/admin/documents' },
  { key: 'tickets', label: 'Support Tickets', path: '/admin/tickets' },
  { key: 'complaints', label: 'Complaints', path: '/admin/complaints' },
  { key: 'users', label: 'Users', path: '/admin/users' },
  { key: 'staff', label: 'Staff', path: '/admin/staff' },
  { key: 'promos', label: 'Promos', path: '/admin/promos' },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getStats();
      setStats(data.stats);
    } catch {
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleTabClick = (tab) => {
    if (tab.path) {
      navigate(tab.path);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand"><h2>RideShare Admin</h2></div>
        <div className="nav-user">
          <span>{user?.first_name || 'Admin'}</span>
          <Link to="/admin/analytics" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>
            Analytics
          </Link>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="admin-tab-bar">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`admin-tab${t.key === 'overview' ? ' active' : ''}`}
              onClick={() => handleTabClick(t)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* ── OVERVIEW ─────────────────────────────────── */}
        {stats && (
          <div className="quick-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card"><div className="stat-number">{stats.total_users}</div><div className="stat-label">Total Users</div></div>
            <div className="stat-card"><div className="stat-number">{stats.total_drivers}</div><div className="stat-label">Drivers</div></div>
            <div className="stat-card"><div className="stat-number">{stats.total_riders}</div><div className="stat-label">Riders</div></div>
            <div className="stat-card"><div className="stat-number">{stats.total_rides}</div><div className="stat-label">Total Rides</div></div>
            <div className="stat-card"><div className="stat-number">{stats.active_rides}</div><div className="stat-label">Active Rides</div></div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/tickets')}>
              <div className="stat-number">{stats.open_tickets}</div><div className="stat-label">Open Tickets</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/documents')}>
              <div className="stat-number">{stats.pending_documents}</div><div className="stat-label">Pending Docs</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/complaints')}>
              <div className="stat-number">{stats.open_complaints}</div><div className="stat-label">Open Complaints</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/users')}>
              <div className="stat-number">{stats.banned_users}</div><div className="stat-label">Banned Users</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/promos')}>
              <div className="stat-number">{stats.active_promos || 0}</div>
              <div className="stat-label">Active Promos</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/staff')}>
              <div className="stat-number">{stats.active_support_staff || 0}</div>
              <div className="stat-label">Support Staff</div>
            </div>
          </div>
        )}
        {!stats && !loading && (
          <div className="empty-state"><h3>No data</h3><p>Could not load dashboard stats.</p></div>
        )}

        {loading && <p style={{ textAlign: 'center', color: 'var(--uber-gray-50)', marginTop: 20 }}>Loading...</p>}
      </div>
    </div>
  );
}
