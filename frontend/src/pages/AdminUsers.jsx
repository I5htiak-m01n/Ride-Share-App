import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

const USER_FILTERS = [
  { value: '', label: 'All' },
  { value: 'rider', label: 'Rider' },
  { value: 'driver', label: 'Driver' },
  { value: 'admin', label: 'Admin' },
  { value: 'support', label: 'Support Staff' },
  { value: 'banned', label: 'Banned' },
  { value: 'unbanned', label: 'Unbanned' },
];

export default function AdminUsers() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userFilter, setUserFilter] = useState(searchParams.get('filter') || '');

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getUsers();
      setUsers(data.users);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleFilterChange = (value) => {
    setUserFilter(value);
    // Update URL without full navigation
    if (value) {
      setSearchParams({ filter: value });
    } else {
      setSearchParams({});
    }
  };

  const handleToggleBan = async (userId) => {
    try {
      await adminAPI.toggleBanUser(userId);
      fetchUsers();
    } catch {
      setError('Failed to update user');
    }
  };

  // Client-side filtering
  const filteredUsers = users.filter(u => {
    if (!userFilter) return true;
    switch (userFilter) {
      case 'rider': return u.role === 'rider';
      case 'driver': return u.role === 'driver';
      case 'admin': return u.role === 'admin';
      case 'support': return u.role === 'support';
      case 'banned': return u.is_banned;
      case 'unbanned': return !u.is_banned;
      default: return true;
    }
  });

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="dashboard-container">
      <NavBar brandText="RideShare Admin" />

      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={() => navigate('/admin/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Users</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="admin-filter-row">
          <label>Filter:</label>
          <select value={userFilter} onChange={e => handleFilterChange(e.target.value)}>
            {USER_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {filteredUsers.length === 0 && !loading ? (
          <div className="empty-state"><h3>No users</h3><p>No users found{userFilter ? ` for filter "${USER_FILTERS.find(f => f.value === userFilter)?.label}"` : ''}.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.user_id}>
                  <td>{u.first_name} {u.last_name}</td>
                  <td>{u.email}</td>
                  <td>{u.phone_number}</td>
                  <td>{u.role}</td>
                  <td>{fmtDate(u.created_at)}</td>
                  <td>
                    <span className={`status-pill ${u.is_banned ? 'banned' : 'active-user'}`}>
                      {u.is_banned ? 'Banned' : 'Active'}
                    </span>
                  </td>
                  <td>
                    {u.role !== 'admin' && (
                      <button
                        className={`admin-btn ${u.is_banned ? 'unban' : 'ban'}`}
                        onClick={() => handleToggleBan(u.user_id)}
                      >
                        {u.is_banned ? 'Unban' : 'Ban'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {loading && <p style={{ textAlign: 'center', color: 'var(--uber-gray-50)', marginTop: 20 }}>Loading...</p>}
      </div>
    </div>
  );
}
