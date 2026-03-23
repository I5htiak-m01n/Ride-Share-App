import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../api/client';
import './Dashboard.css';

export default function AdminStaff() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getSupportStaff();
      setStaffList(data.staff);
    } catch {
      setError('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleUpdateStaffLevel = async (staffId, level) => {
    try {
      await adminAPI.updateStaffLevel(staffId, level);
      fetchStaff();
    } catch {
      setError('Failed to update staff level');
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
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={() => navigate('/admin/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Support Staff</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {staffList.length === 0 && !loading ? (
          <div className="empty-state"><h3>No support staff</h3><p>No support staff members found. Create users with the &apos;support&apos; role and add them to the support_staff table.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Level</th>
                <th>Active Tickets</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map(s => (
                <tr key={s.support_staff_id}>
                  <td>{s.first_name} {s.last_name}</td>
                  <td>{s.email}</td>
                  <td><span className={`priority-badge p${s.level}`}>Level {s.level}</span></td>
                  <td>{s.active_tickets}</td>
                  <td><span className={`status-pill ${s.is_active ? 'active-user' : 'banned'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="admin-btn approve"
                        disabled={s.level >= 5}
                        onClick={() => handleUpdateStaffLevel(s.support_staff_id, s.level + 1)}
                      >
                        Promote
                      </button>
                      <button
                        className="admin-btn reject"
                        disabled={s.level <= 1}
                        onClick={() => handleUpdateStaffLevel(s.support_staff_id, s.level - 1)}
                      >
                        Demote
                      </button>
                    </div>
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
