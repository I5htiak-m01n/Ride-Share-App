import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

export default function AdminComplaints() {
  const navigate = useNavigate();

  const [complaints, setComplaints] = useState([]);
  const [complaintFilter, setComplaintFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Detail view
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const handleOpenDetail = async (ticketId) => {
    setSelectedTicketId(ticketId);
    setDetailLoading(true);
    try {
      const { data } = await adminAPI.getComplaintDetail(ticketId);
      setTicketDetail(data);
    } catch {
      setError('Failed to load complaint detail');
      setSelectedTicketId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedTicketId(null);
    setTicketDetail(null);
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="dashboard-container">
      <NavBar brandText="RideShare Admin" />

      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={() => navigate('/admin/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Complaints</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* List view */}
        {!selectedTicketId && (
          <>
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
                      <td><button className="admin-btn approve" onClick={() => handleOpenDetail(c.ticket_id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* Detail view */}
        {selectedTicketId && (
          <div>
            <button className="page-back-btn" onClick={handleCloseDetail} style={{ marginBottom: 16 }}>
              &larr; Back to list
            </button>

            {detailLoading && <p style={{ color: 'var(--uber-gray-50)', textAlign: 'center', padding: 40 }}>Loading...</p>}

            {ticketDetail && (
              <>
                {/* Complaint info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{ticketDetail.ticket.category}</h2>
                    <p style={{ color: 'var(--uber-gray-50)', margin: '0 0 8px', fontSize: 14 }}>
                      Filed by {ticketDetail.ticket.first_name} {ticketDetail.ticket.last_name} ({ticketDetail.ticket.email})
                    </p>
                    <span className={`status-pill ${ticketDetail.ticket.complaint_status}`}>{ticketDetail.ticket.complaint_status}</span>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--uber-gray-50)' }}>
                    Filed {fmtDate(ticketDetail.ticket.filed_at)}
                  </span>
                </div>

                {/* Ride info */}
                {ticketDetail.ticket.ride_id && (
                  <div style={{ padding: '12px 16px', background: 'var(--uber-gray-10)', borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--uber-gray-50)', marginBottom: 6 }}>Ride Details</div>
                    <div style={{ fontSize: 14 }}>
                      {ticketDetail.ticket.pickup_addr || 'Unknown'} &rarr; {ticketDetail.ticket.dropoff_addr || 'Unknown'}
                    </div>
                    {ticketDetail.ticket.total_fare && (
                      <div style={{ fontSize: 13, color: 'var(--uber-gray-50)', marginTop: 4 }}>
                        Fare: ৳{Number(ticketDetail.ticket.total_fare).toFixed(2)}
                      </div>
                    )}
                    {ticketDetail.ticket.completed_at && (
                      <div style={{ fontSize: 13, color: 'var(--uber-gray-50)', marginTop: 4 }}>
                        Completed: {fmtDate(ticketDetail.ticket.completed_at)}
                      </div>
                    )}
                  </div>
                )}

                {/* Complaint details */}
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--uber-gray-50)', marginBottom: 6 }}>Complaint Details</div>
                <div style={{ margin: '0 0 24px', padding: 16, background: 'var(--uber-gray-10)', borderRadius: 8, fontSize: 14, lineHeight: 1.5 }}>
                  {ticketDetail.ticket.complaint_details || ticketDetail.ticket.description}
                </div>

                {/* Staff Responses */}
                <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Staff Responses</h3>
                <div className="admin-response-timeline">
                  {ticketDetail.responses.length === 0 ? (
                    <p style={{ color: 'var(--uber-gray-50)', fontSize: 13 }}>No responses yet.</p>
                  ) : (
                    ticketDetail.responses.map(r => (
                      <div key={r.response_id} className={`admin-response-item${r.role === 'admin' ? ' admin-reply' : ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <strong style={{ fontSize: 13 }}>{r.first_name} {r.last_name} ({r.role})</strong>
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

        {loading && <p style={{ textAlign: 'center', color: 'var(--uber-gray-50)', marginTop: 20 }}>Loading...</p>}
      </div>
    </div>
  );
}
