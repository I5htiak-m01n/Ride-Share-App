import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SERVER_URL = API_URL.replace(/\/api\/?$/, '');

function getImageFullUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${SERVER_URL}${imageUrl}`;
}

export default function AdminDocuments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [documents, setDocuments] = useState([]);
  const [docFilter, setDocFilter] = useState(searchParams.get('filter') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rejectModal, setRejectModal] = useState(null); // { driverId, driverName }
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null); // full URL string

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getDocuments(docFilter || undefined);
      setDocuments(data.documents);
    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [docFilter]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Group documents by driver_id for onboarding package view
  const grouped = documents.reduce((acc, doc) => {
    if (!acc[doc.driver_id]) {
      acc[doc.driver_id] = {
        driver_id: doc.driver_id,
        name: `${doc.first_name} ${doc.last_name}`,
        email: doc.email,
        docs: [],
        hasPending: false,
      };
    }
    acc[doc.driver_id].docs.push(doc);
    if (doc.status === 'pending') acc[doc.driver_id].hasPending = true;
    return acc;
  }, {});
  const driverGroups = Object.values(grouped);

  const handleVerifyDoc = async (driverId, docType, status) => {
    try {
      await adminAPI.verifyDocument(driverId, docType, status);
      fetchDocuments();
    } catch {
      setError('Failed to update document');
    }
  };

  const handleApproveAll = async (driverId) => {
    setActionLoading(true);
    try {
      await adminAPI.approveOnboarding(driverId);
      fetchDocuments();
    } catch {
      setError('Failed to approve onboarding');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectAll = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await adminAPI.rejectOnboarding(rejectModal.driverId, rejectReason.trim());
      setRejectModal(null);
      setRejectReason('');
      fetchDocuments();
    } catch {
      setError('Failed to reject onboarding');
    } finally {
      setActionLoading(false);
    }
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
          <h1 style={{ margin: 0, fontSize: 28 }}>Documents</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="admin-filter-row">
          <label>Filter:</label>
          <select value={docFilter} onChange={e => setDocFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="valid">Valid</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {driverGroups.length === 0 && !loading ? (
          <div className="empty-state"><h3>No documents</h3><p>No driver documents found.</p></div>
        ) : (
          driverGroups.map((group) => (
            <div key={group.driver_id} className="admin-driver-group">
              <div className="admin-driver-group-header">
                <div>
                  <strong>{group.name}</strong>
                  <span style={{ color: '#6b7280', marginLeft: 12, fontSize: 14 }}>{group.email}</span>
                </div>
                {group.hasPending && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="admin-btn approve"
                      disabled={actionLoading}
                      onClick={() => handleApproveAll(group.driver_id)}
                    >
                      Approve All
                    </button>
                    <button
                      className="admin-btn reject"
                      disabled={actionLoading}
                      onClick={() => setRejectModal({ driverId: group.driver_id, driverName: group.name })}
                    >
                      Reject All
                    </button>
                  </div>
                )}
              </div>

              <table className="admin-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Doc Type</th>
                    <th>Vehicle</th>
                    <th>Expiry</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.docs.map(d => (
                    <tr key={`${d.driver_id}-${d.doc_type}`}>
                      <td>{d.doc_type}</td>
                      <td>{d.vehicle_name ? `${d.vehicle_name} (${d.vehicle_type}) - ${d.plate_number}` : '—'}</td>
                      <td>{fmtDate(d.expiry_date)}</td>
                      <td><span className={`status-pill ${d.status}`}>{d.status}</span></td>
                      <td>
                        {d.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="admin-btn approve" onClick={() => handleVerifyDoc(d.driver_id, d.doc_type, 'valid')}>Approve</button>
                            <button className="admin-btn reject" onClick={() => handleVerifyDoc(d.driver_id, d.doc_type, 'rejected')}>Reject</button>
                          </div>
                        )}
                        {d.image_url && (
                          <button
                            className="admin-btn view-btn"
                            onClick={() => setPreviewImage(getImageFullUrl(d.image_url))}
                            style={{ fontSize: 13, marginLeft: 6 }}
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}

        {loading && <p style={{ textAlign: 'center', color: 'var(--uber-gray-50)', marginTop: 20 }}>Loading...</p>}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)}>
          <div className="modal-content image-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Document Preview</h3>
              <button
                className="admin-btn unban"
                onClick={() => setPreviewImage(null)}
                style={{ padding: '4px 12px', fontSize: 13 }}
              >
                Close
              </button>
            </div>
            <img
              src={previewImage}
              alt="Document preview"
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block', margin: '0 auto' }}
            />
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Reject Documents for {rejectModal.driverName}</h3>
            <p style={{ color: '#6b7280', margin: '8px 0 16px' }}>Provide a reason so the driver knows what to fix.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              style={{
                width: '100%', padding: 12, border: '1px solid #d1d5db',
                borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="admin-btn unban" onClick={() => { setRejectModal(null); setRejectReason(''); }}>
                Cancel
              </button>
              <button
                className="admin-btn reject"
                disabled={!rejectReason.trim() || actionLoading}
                onClick={handleRejectAll}
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
