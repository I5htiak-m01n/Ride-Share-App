import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../api/client';
import './Dashboard.css';

export default function AdminComplaints() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [complaints, setComplaints] = useState([]);
  const [complaintFilter, setComplaintFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchComplaints = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getComplaints(complaintFilter || undefined);
      setComplaints(data.complaints);
    } catch {
      setError('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  }, [complaintFilter]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleResolveComplaint = async (ticketId, status) => {
    try {
      await adminAPI.resolveComplaint(ticketId, status);
      fetchComplaints();
    } catch {
      setError('Failed to update complaint');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

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
          <button
            className="admin-btn unban"
            onClick={() => navigate('/admin/dashboard')}
            style={{ padding: '8px 16px' }}
          >
            &larr; Back to Dashboard
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Complaints</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="admin-filter-row">
          <label>Filter:</label>
          <select value={complaintFilter} onChange={e => setComplaintFilter(e.target.value)}>
            <option value="">All</option>
            <option value="filed">Filed</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {complaints.length === 0 && !loading ? (
          <div className="empty-state"><h3>No complaints</h3><p>No complaints found.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Filed By</th>
                <th>Details</th>
                <th>Status</th>
                <th>Filed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map(c => (
                <tr key={c.ticket_id}>
                  <td>{c.category}</td>
                  <td>{c.first_name} {c.last_name}</td>
                  <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.details || '—'}</td>
                  <td><span className={`status-pill ${c.complaint_status}`}>{c.complaint_status}</span></td>
                  <td>{fmtDate(c.filed_at)}</td>
                  <td>
                    {(c.complaint_status === 'filed' || c.complaint_status === 'under_review') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="admin-btn approve" onClick={() => handleResolveComplaint(c.ticket_id, 'resolved')}>Resolve</button>
                        <button className="admin-btn reject" onClick={() => handleResolveComplaint(c.ticket_id, 'rejected')}>Reject</button>
                      </div>
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
