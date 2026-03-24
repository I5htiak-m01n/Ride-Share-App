import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supportAPI, ridesAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

const PRIORITY_LABELS = { 1: 'Low', 2: 'Normal', 3: 'Medium', 4: 'High', 5: 'Critical' };

export default function SupportTickets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDriver = user?.role === 'driver';

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [rideId, setRideId] = useState('');
  const [rides, setRides] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Ticket list
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Expanded ticket detail
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [ticketsRes, historyRes] = await Promise.all([
          supportAPI.getMyTickets(),
          isDriver ? ridesAPI.getDriverHistory() : ridesAPI.getRiderHistory(),
        ]);
        setTickets(ticketsRes.data.tickets || []);
        setRides(historyRes.data.rides || []);
      } catch {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isDriver]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await supportAPI.createTicket({
        subject: subject.trim(),
        description: description.trim(),
        ride_id: rideId || undefined,
      });
      setSuccess('Support ticket created successfully');
      setSubject('');
      setDescription('');
      setRideId('');
      setShowForm(false);
      const res = await supportAPI.getMyTickets();
      setTickets(res.data.tickets || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpand = async (ticketId) => {
    if (expandedId === ticketId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(ticketId);
    setDetailLoading(true);
    try {
      const res = await supportAPI.getTicketDetail(ticketId);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const goBack = () => navigate(isDriver ? '/driver/dashboard' : '/rider/dashboard');

  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  // Extract subject from description format "[subject] details"
  const parseSubject = (desc) => {
    if (!desc) return { subject: 'No subject', body: '' };
    const match = desc.match(/^\[(.+?)\]\s*([\s\S]*)$/);
    if (match) return { subject: match[1], body: match[2] };
    return { subject: desc.slice(0, 50), body: desc };
  };

  return (
    <div className="dashboard-container">
      <NavBar brandText={isDriver ? 'RideShare Driver' : 'RideShare'} />

      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={goBack}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Support</h1>
          {!showForm && (
            <button className="card-button" onClick={() => setShowForm(true)} style={{ marginLeft: 'auto' }}>Ask for Support</button>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="info-banner">{success}</div>}

        {showForm && (
          <form className="complaint-form" onSubmit={handleSubmit}>
            <h3>Ask for Support</h3>

            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Brief summary of your issue..."
                maxLength={100}
                required
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe your issue in detail..."
                maxLength={2000}
                rows={4}
                required
              />
            </div>

            <div className="form-group">
              <label>Related Ride (optional)</label>
              <select value={rideId} onChange={e => setRideId(e.target.value)}>
                <option value="">None</option>
                {rides.map(r => (
                  <option key={r.ride_id} value={r.ride_id}>
                    {r.pickup_addr || 'Unknown'} → {r.dropoff_addr || 'Unknown'} ({fmtDate(r.completed_at || r.started_at)})
                  </option>
                ))}
              </select>
            </div>

            <div className="complaint-form-actions">
              <button type="button" className="card-button secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="card-button" disabled={submitting || !subject.trim() || !description.trim()}>
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </form>
        )}

        <h2 style={{ margin: '32px 0 16px', fontSize: 20 }}>Previous Requests</h2>
        {loading ? (
          <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading...</p>
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <h3>No requests</h3>
            <p>You haven&apos;t submitted any support requests yet.</p>
          </div>
        ) : (
          <div className="history-list">
            {tickets.map(t => {
              const { subject: subj, body } = parseSubject(t.description);
              const isExpanded = expandedId === t.ticket_id;
              return (
                <div key={t.ticket_id} className="history-item" style={{ cursor: 'pointer' }} onClick={() => handleExpand(t.ticket_id)}>
                  <div className="history-item-main">
                    <div className="history-route">
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{subj}</div>
                      <div style={{ fontSize: 13, color: 'var(--uber-gray-50)' }}>
                        {body.slice(0, 80)}{body.length > 80 ? '...' : ''}
                      </div>
                    </div>
                    <div className="history-meta">
                      <span className="history-date">{fmtDate(t.created_at)}</span>
                      <span className={`priority-badge p${t.priority}`}>P{t.priority}</span>
                      <span className={`status-pill ${t.status}`}>{t.status}</span>
                      {t.response_count > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--uber-gray-50)' }}>
                          {t.response_count} response{t.response_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ paddingTop: 16, borderTop: '1px solid var(--uber-gray-20)', marginTop: 12 }} onClick={e => e.stopPropagation()}>
                      {detailLoading ? (
                        <p style={{ color: '#6B6B6B', fontSize: 13 }}>Loading responses...</p>
                      ) : detail?.responses?.length > 0 ? (
                        <div className="admin-response-timeline">
                          {detail.responses.map(r => (
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
                      ) : (
                        <p style={{ color: '#6B6B6B', fontSize: 13 }}>No responses yet. Our support team will get back to you soon.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
