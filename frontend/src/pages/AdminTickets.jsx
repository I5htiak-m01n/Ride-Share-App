import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../api/client';
import './Dashboard.css';

export default function AdminTickets() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState('');
  const [staffForAssign, setStaffForAssign] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getTickets(ticketFilter || undefined);
      setTickets(data.tickets);
    } catch {
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [ticketFilter]);

  const fetchStaffForAssign = useCallback(async () => {
    try {
      const { data } = await adminAPI.getSupportStaff();
      setStaffForAssign(data.staff);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchStaffForAssign();
  }, [fetchTickets, fetchStaffForAssign]);

  const handleSetPriority = async (ticketId, priority) => {
    try {
      await adminAPI.setTicketPriority(ticketId, priority);
      fetchTickets();
    } catch {
      setError('Failed to set priority');
    }
  };

  const handleAssignTicket = async (ticketId, staffId) => {
    if (!staffId) return;
    try {
      await adminAPI.assignTicket(ticketId, staffId);
      fetchTickets();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign ticket');
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
          <button className="page-back-btn" onClick={() => navigate('/admin/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Support Tickets</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="admin-filter-row">
          <label>Filter:</label>
          <select value={ticketFilter} onChange={e => setTicketFilter(e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {tickets.length === 0 && !loading ? (
          <div className="empty-state"><h3>No tickets</h3><p>No support tickets found.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>User</th>
                <th>Description</th>
                <th>Priority</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.ticket_id}>
                  <td>{t.type}</td>
                  <td>{t.first_name} {t.last_name}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</td>
                  <td>
                    <select
                      className="priority-select"
                      value={t.priority}
                      onChange={e => handleSetPriority(t.ticket_id, parseInt(e.target.value))}
                    >
                      {[1,2,3,4,5].map(p => <option key={p} value={p}>P{p}</option>)}
                    </select>
                  </td>
                  <td>
                    {t.staff_first_name
                      ? <span>{t.staff_first_name} {t.staff_last_name} (L{t.staff_level})</span>
                      : <select
                          className="priority-select"
                          value=""
                          onChange={e => handleAssignTicket(t.ticket_id, e.target.value)}
                        >
                          <option value="" disabled>Assign...</option>
                          {staffForAssign
                            .filter(s => s.level >= t.priority && s.is_active)
                            .map(s => (
                              <option key={s.support_staff_id} value={s.support_staff_id}>
                                {s.first_name} {s.last_name} (L{s.level})
                              </option>
                            ))}
                        </select>
                    }
                  </td>
                  <td><span className={`status-pill ${t.status}`}>{t.status}</span></td>
                  <td>{fmtDate(t.created_at)}</td>
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
