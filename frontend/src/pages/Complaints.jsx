import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ridesAPI, complaintsAPI } from '../api/client';
import './Dashboard.css';

const CATEGORIES = [
  'Safety',
  'Payment',
  'Driver Behavior',
  'Rider Behavior',
  'Vehicle Issue',
  'Route Issue',
  'Lost Item',
  'Other',
];

export default function Complaints() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDriver = user?.role === 'driver';

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [rides, setRides] = useState([]);
  const [selectedRide, setSelectedRide] = useState('');
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // My complaints
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Detail view
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [complaintDetail, setComplaintDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load rides for the dropdown and complaints list
  useEffect(() => {
    const load = async () => {
      try {
        const [historyRes, complaintsRes] = await Promise.all([
          isDriver ? ridesAPI.getDriverHistory() : ridesAPI.getRiderHistory(),
          complaintsAPI.getMine(),
        ]);
        setRides(historyRes.data.rides || []);
        setComplaints(complaintsRes.data.complaints || []);
      } catch {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isDriver]);

  // Pre-select ride from URL param
  useEffect(() => {
    const rideParam = searchParams.get('ride');
    if (rideParam) {
      setSelectedRide(rideParam);
      setShowForm(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRide || !category || !details.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await complaintsAPI.file(selectedRide, category, details.trim());
      setSuccess('Complaint filed successfully');
      setSelectedRide('');
      setCategory('');
      setDetails('');
      setShowForm(false);
      // Refresh complaints list
      const res = await complaintsAPI.getMine();
      setComplaints(res.data.complaints || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to file complaint');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetail = async (ticketId) => {
    setSelectedTicketId(ticketId);
    setDetailLoading(true);
    try {
      const { data } = await complaintsAPI.getDetail(ticketId);
      setComplaintDetail(data);
    } catch {
      setError('Failed to load complaint details');
      setSelectedTicketId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedTicketId(null);
    setComplaintDetail(null);
  };

  const goBack = () => navigate(isDriver ? '/driver/dashboard' : '/rider/dashboard');

  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand"><h2>{isDriver ? 'RideShare Driver' : 'RideShare'}</h2></div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'User'}</span>
          <button onClick={goBack} className="logout-btn">Back</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="dashboard-header">
          <div>
            <h1>Complaints</h1>
            <p>File and track your complaints</p>
          </div>
          {!showForm && !selectedTicketId && (
            <button className="card-button" onClick={() => setShowForm(true)}>File a Complaint</button>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="info-banner">{success}</div>}

        {/* File Complaint Form */}
        {showForm && !selectedTicketId && (
          <form className="complaint-form" onSubmit={handleSubmit}>
            <h3>File a Complaint</h3>

            <div className="form-group">
              <label>Select Ride</label>
              <select value={selectedRide} onChange={e => setSelectedRide(e.target.value)} required>
                <option value="">Choose a ride...</option>
                {rides.map(r => (
                  <option key={r.ride_id} value={r.ride_id}>
                    {r.pickup_addr || 'Unknown'} → {r.dropoff_addr || 'Unknown'} ({fmtDate(r.completed_at || r.started_at)})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} required>
                <option value="">Select category...</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Details</label>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Describe your issue in detail..."
                maxLength={2000}
                rows={4}
                required
              />
            </div>

            <div className="complaint-form-actions">
              <button type="button" className="card-button secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="card-button" disabled={submitting || !selectedRide || !category || !details.trim()}>
                {submitting ? 'Submitting...' : 'Submit Complaint'}
              </button>
            </div>
          </form>
        )}

        {/* Complaint Detail View */}
        {selectedTicketId && (
          <div style={{ marginTop: 16 }}>
            <button
              className="admin-btn unban"
              onClick={handleCloseDetail}
              style={{ marginBottom: 16, padding: '8px 16px' }}
            >
              &larr; Back to complaints
            </button>

            {detailLoading && (
              <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading...</p>
            )}

            {complaintDetail && (
              <>
                <div className="history-item" style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{complaintDetail.complaint.category}</h2>
                      <span className={`status-pill ${complaintDetail.complaint.complaint_status}`}>
                        {complaintDetail.complaint.complaint_status}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--uber-gray-50)' }}>
                      Filed {fmtDate(complaintDetail.complaint.filed_at)}
                    </span>
                  </div>

                  {/* Ride info */}
                  <div style={{ padding: '12px 16px', background: 'var(--uber-gray-10)', borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--uber-gray-50)', marginBottom: 6 }}>Ride Details</div>
                    <div style={{ fontSize: 14 }}>
                      {complaintDetail.complaint.pickup_addr || 'Unknown'} &rarr; {complaintDetail.complaint.dropoff_addr || 'Unknown'}
                    </div>
                    {complaintDetail.complaint.completed_at && (
                      <div style={{ fontSize: 13, color: 'var(--uber-gray-50)', marginTop: 4 }}>
                        Completed: {fmtDate(complaintDetail.complaint.completed_at)}
                      </div>
                    )}
                  </div>

                  {/* Complaint details */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--uber-gray-50)', marginBottom: 6 }}>Your Complaint</div>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    {complaintDetail.complaint.details}
                  </div>
                </div>

                {/* Staff Responses */}
                <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Feedback</h3>
                <div className="admin-response-timeline">
                  {complaintDetail.responses.length === 0 ? (
                    <p style={{ color: 'var(--uber-gray-50)', fontSize: 13 }}>No feedback yet.</p>
                  ) : (
                    complaintDetail.responses.map(r => (
                      <div key={r.response_id} className="admin-response-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <strong style={{ fontSize: 13 }}>
                            {r.first_name} {r.last_name} ({r.role})
                          </strong>
                          <span style={{ fontSize: 12, color: 'var(--uber-gray-50)' }}>{fmtDate(r.created_at)}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 14 }}>{r.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* My Complaints List */}
        {!selectedTicketId && (
          <>
            <h2 style={{ margin: '32px 0 16px', fontSize: 20 }}>My Complaints</h2>
            {loading ? (
              <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading...</p>
            ) : complaints.length === 0 ? (
              <div className="empty-state">
                <h3>No complaints</h3>
                <p>You haven't filed any complaints yet.</p>
              </div>
            ) : (
              <div className="history-list">
                {complaints.map(c => (
                  <div
                    key={c.ticket_id}
                    className="history-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleViewDetail(c.ticket_id)}
                  >
                    <div className="history-item-main">
                      <div className="history-route">
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{c.category}</div>
                        <div style={{ fontSize: 13, color: 'var(--uber-gray-50)' }}>
                          {c.pickup_addr || 'Unknown'} → {c.dropoff_addr || 'Unknown'}
                        </div>
                      </div>
                      <div className="history-meta">
                        <span className="history-date">{fmtDate(c.filed_at)}</span>
                        <span className={`status-pill ${c.complaint_status}`}>{c.complaint_status}</span>
                      </div>
                    </div>
                    {c.details && (
                      <div style={{ padding: '12px 0 0', fontSize: 14, color: 'var(--uber-gray-50)', borderTop: '1px solid var(--uber-gray-20)', marginTop: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
