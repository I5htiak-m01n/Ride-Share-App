import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supportStaffAPI } from '../api/client';
import NotificationDropdown from '../components/NotificationDropdown';
import './Dashboard.css';

const PRIORITY_LABELS = { 1: 'Low', 2: 'Normal', 3: 'Medium', 4: 'High', 5: 'Critical' };

export default function SupportDashboard() {
  const { user, logout } = useAuth();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ticket detail view
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reply form
  const [replyMessage, setReplyMessage] = useState('');
  const [replyStatus, setReplyStatus] = useState('');
  const [replying, setReplying] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supportStaffAPI.getAssignedTickets();
      setTickets(res.data.tickets || []);
    } catch {
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleSelectTicket = async (ticketId) => {
    if (selectedTicketId === ticketId) {
      setSelectedTicketId(null);
      setTicketDetail(null);
      return;
    }
    setSelectedTicketId(ticketId);
    setDetailLoading(true);
    try {
      const res = await supportStaffAPI.getTicketDetail(ticketId);
      setTicketDetail(res.data);
    } catch {
      setError('Failed to load ticket detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicketId) return;

    setReplying(true);
    try {
      await supportStaffAPI.respondToTicket(
        selectedTicketId,
        replyMessage.trim(),
        replyStatus || undefined
      );
      setReplyMessage('');
      setReplyStatus('');
      // Refresh detail
      const res = await supportStaffAPI.getTicketDetail(selectedTicketId);
      setTicketDetail(res.data);
      fetchTickets();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send response');
    } finally {
      setReplying(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const parseSubject = (desc) => {
    if (!desc) return { subject: 'No subject', body: '' };
    const match = desc.match(/^\[(.+?)\]\s*([\s\S]*)$/);
    if (match) return { subject: match[1], body: match[2] };
    return { subject: desc.slice(0, 50), body: desc };
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand"><h2>RideShare Support</h2></div>
        <div className="nav-user">
          <NotificationDropdown />
          <span>Hi, {user?.name || 'Staff'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="dashboard-header">
          <div>
            <h1>Assigned Tickets</h1>
            <p>Manage and respond to support tickets assigned to you</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading...</p>
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <h3>No assigned tickets</h3>
            <p>You have no tickets assigned to you at the moment.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>User</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Responses</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => {
                const { subject } = parseSubject(t.description);
                return (
                  <tr
                    key={t.ticket_id}
                    onClick={() => handleSelectTicket(t.ticket_id)}
                    style={{ cursor: 'pointer', background: selectedTicketId === t.ticket_id ? 'var(--uber-gray-10)' : undefined }}
                  >
                    <td style={{ fontWeight: 600 }}>{subject}</td>
                    <td>{t.first_name} {t.last_name}</td>
                    <td><span className={`priority-badge p${t.priority}`}>P{t.priority} — {PRIORITY_LABELS[t.priority]}</span></td>
                    <td><span className={`status-pill ${t.status}`}>{t.status}</span></td>
                    <td>{t.response_count}</td>
                    <td>{fmtDate(t.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Ticket Detail Panel */}
        {selectedTicketId && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>Ticket Detail</h2>
            {detailLoading ? (
              <p style={{ color: '#6B6B6B' }}>Loading...</p>
            ) : ticketDetail ? (
              <>
                <div style={{ background: 'var(--uber-gray-10)', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                  <p><strong>Type:</strong> {ticketDetail.ticket.type}</p>
                  <p><strong>Priority:</strong> <span className={`priority-badge p${ticketDetail.ticket.priority}`}>P{ticketDetail.ticket.priority}</span></p>
                  <p><strong>Status:</strong> <span className={`status-pill ${ticketDetail.ticket.status}`}>{ticketDetail.ticket.status}</span></p>
                  <p><strong>From:</strong> {ticketDetail.ticket.first_name} {ticketDetail.ticket.last_name} ({ticketDetail.ticket.email})</p>
                  <p><strong>Created:</strong> {fmtDate(ticketDetail.ticket.created_at)}</p>
                  <p style={{ marginTop: 8 }}><strong>Description:</strong></p>
                  <p style={{ color: 'var(--uber-gray-50)' }}>{ticketDetail.ticket.description}</p>
                </div>

                {/* Response Timeline */}
                <h3 style={{ fontSize: 16, marginBottom: 12 }}>Responses</h3>
                {ticketDetail.responses.length === 0 ? (
                  <p style={{ color: '#6B6B6B', fontSize: 13, marginBottom: 16 }}>No responses yet.</p>
                ) : (
                  <div className="admin-response-timeline" style={{ marginBottom: 16 }}>
                    {ticketDetail.responses.map(r => (
                      <div key={r.response_id} className="response-item">
                        <div className="response-header">
                          <strong>{r.first_name} {r.last_name}</strong>
                          <span className={`status-pill ${r.role}`}>{r.role}</span>
                          <span className="response-date">{fmtDate(r.created_at)}</span>
                        </div>
                        <p className="response-message">{r.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Form */}
                {ticketDetail.ticket.status !== 'closed' && (
                  <form onSubmit={handleReply} className="complaint-form" style={{ marginTop: 0 }}>
                    <h3>Reply</h3>
                    <div className="form-group">
                      <textarea
                        value={replyMessage}
                        onChange={e => setReplyMessage(e.target.value)}
                        placeholder="Type your response..."
                        rows={3}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Update Status (optional)</label>
                      <select value={replyStatus} onChange={e => setReplyStatus(e.target.value)}>
                        <option value="">No change</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div className="complaint-form-actions">
                      <button type="submit" className="card-button" disabled={replying || !replyMessage.trim()}>
                        {replying ? 'Sending...' : 'Send Response'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
