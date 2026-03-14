import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../api/client';
import './Dashboard.css';

export default function AdminDocuments() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [docFilter, setDocFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const handleVerifyDoc = async (driverId, docType, status) => {
    try {
      await adminAPI.verifyDocument(driverId, docType, status);
      fetchDocuments();
    } catch {
      setError('Failed to update document');
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

        {documents.length === 0 && !loading ? (
          <div className="empty-state"><h3>No documents</h3><p>No driver documents found.</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Email</th>
                <th>Doc Type</th>
                <th>Vehicle</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(d => (
                <tr key={`${d.driver_id}-${d.doc_type}`}>
                  <td>{d.first_name} {d.last_name}</td>
                  <td>{d.email}</td>
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
                    {d.image_url && <a href={d.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, marginLeft: 6 }}>View</a>}
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
