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
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [responseMsg, setResponseMsg] = useState('');
  const [responseStatus, setResponseStatus] = useState('');
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

  const fetchTicketDetail = useCallback(async (ticketId) => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getTicketDetail(ticketId);
      setTicketDetail(data);
    } catch {
      setError('Failed to load ticket detail');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleOpenTicket = (ticketId) => {
    setSelectedTicketId(ticketId);
    fetchTicketDetail(ticketId);
  };

  const handleRespondTicket = async () => {
    if (!responseMsg.trim()) return;
    try {
      await adminAPI.respondToTicket(selectedTicketId, responseMsg.trim(), responseStatus || undefined);
      setResponseMsg('');
      setResponseStatus('');
      fetchTicketDetail(selectedTicketId);
      fetchTickets();
    } catch {
      setError('Failed to send response');
    }
  };

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
          <button
            className="admin-btn unban"
            onClick={() => navigate('/admin/dashboard')}
            style={{ padding: '8px 16px' }}
          >
            &larr; Back to Dashboard
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Support Tickets</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* Ticket list view */}
        {!selectedTicketId && (
          <>
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
                    <th>Actions</th>
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
                              defaultValue=""
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
                      <td><button className="admin-btn approve" onClick={() => handleOpenTicket(t.ticket_id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* Ticket detail view */}
        {selectedTicketId && ticketDetail && (
          <div className="admin-ticket-detail">
            <button className="admin-btn unban" onClick={() => { setSelectedTicketId(null); setTicketDetail(null); }} style={{ marginBottom: 16 }}>
              &larr; Back to list
            </button>

            <h2 style={{ margin: '0 0 4px' }}>{ticketDetail.ticket.type}</h2>
            <p style={{ color: 'var(--uber-gray-50)', margin: '0 0 8px', fontSize: 14 }}>
              By {ticketDetail.ticket.first_name} {ticketDetail.ticket.last_name} ({ticketDetail.ticket.email})
            </p>
            <span className={`status-pill ${ticketDetail.ticket.status}`}>{ticketDetail.ticket.status}</span>

            {ticketDetail.ticket.description && (
              <div style={{ margin: '16px 0', padding: 16, background: 'var(--uber-gray-10)', borderRadius: 8, fontSize: 14 }}>
                {ticketDetail.ticket.description}
              </div>
            )}

            <h3 style={{ margin: '24px 0 12px', fontSize: 16 }}>Responses</h3>
            <div className="admin-response-timeline">
              {ticketDetail.responses.length === 0 && <p style={{ color: 'var(--uber-gray-50)', fontSize: 13 }}>No responses yet.</p>}
              {ticketDetail.responses.map(r => (
                <div key={r.response_id} className={`admin-response-item${r.role === 'admin' ? ' admin-reply' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{r.first_name} {r.last_name} ({r.role})</strong>
                    <span style={{ fontSize: 12, color: 'var(--uber-gray-50)' }}>{fmtDate(r.created_at)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14 }}>{r.message}</p>
                </div>
              ))}
            </div>

            <div className="admin-response-form">
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Reply</h3>
              <textarea
                value={responseMsg}
                onChange={e => setResponseMsg(e.target.value)}
                placeholder="Type your response..."
                maxLength={2000}
              />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <select value={responseStatus} onChange={e => setResponseStatus(e.target.value)} style={{ padding: '10px 16px', border: '1px solid var(--uber-gray-30)', borderRadius: 8, fontSize: 14 }}>
                  <option value="">Keep status</option>
                  <option value="in_progress">Set In Progress</option>
                  <option value="resolved">Set Resolved</option>
                  <option value="closed">Set Closed</option>
                </select>
                <button className="admin-btn approve" onClick={handleRespondTicket} disabled={!responseMsg.trim()}>Send Response</button>
              </div>
            </div>
          </div>
        )}

        {loading && <p style={{ textAlign: 'center', color: 'var(--uber-gray-50)', marginTop: 20 }}>Loading...</p>}
      </div>
    </div>
  );
}
