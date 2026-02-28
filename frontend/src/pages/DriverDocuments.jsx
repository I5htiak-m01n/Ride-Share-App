import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { driversAPI } from '../api/client';
import './Dashboard.css';

const DOC_TYPES = [
  { value: 'driving_license', label: 'Driving License' },
  { value: 'vehicle_registration', label: 'Vehicle Registration' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'nid', label: 'National ID' },
  { value: 'other', label: 'Other' },
];

const STATUS_COLORS = {
  valid: '#05944F',
  pending: '#F5A623',
  expired: '#E11900',
  rejected: '#E11900',
};

function DriverDocuments() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [docType, setDocType] = useState('driving_license');
  const [imageUrl, setImageUrl] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await driversAPI.getDocuments();
      setDocuments(res.data.documents || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!imageUrl.trim()) {
      setError('Document URL is required');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await driversAPI.addDocument({
        doc_type: docType,
        image_url: imageUrl.trim(),
        expiry_date: expiryDate || null,
      });
      setSuccess('Document added successfully');
      setImageUrl('');
      setExpiryDate('');
      setShowForm(false);
      fetchDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (docType) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    setError(null);
    setSuccess(null);
    try {
      await driversAPI.deleteDocument(docType);
      setSuccess('Document deleted');
      setDocuments((prev) => prev.filter((d) => d.doc_type !== docType));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete document');
    }
  };

  const formatDocType = (type) => {
    const found = DOC_TYPES.find((d) => d.value === type);
    return found ? found.label : type;
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare Driver</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'Driver'}</span>
          <button onClick={() => navigate('/driver/dashboard')} className="logout-btn">
            Back
          </button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="dashboard-header">
          <div>
            <h1>Documents</h1>
            <p>Upload and manage your driver documents</p>
          </div>
          {!showForm && (
            <button
              className="card-button"
              onClick={() => { setShowForm(true); setError(null); setSuccess(null); }}
            >
              Add Document
            </button>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="info-banner">{success}</div>}

        {/* Add Document Form */}
        {showForm && (
          <div className="add-document-form">
            <h3>Add New Document</h3>
            <form onSubmit={handleAdd}>
              <div className="form-group">
                <label>Document Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="doc-select"
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Document Image URL</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/document.jpg"
                />
              </div>

              <div className="form-group">
                <label>Expiry Date (optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>

              <div className="booking-actions">
                <button type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Document List */}
        {loading ? (
          <p style={{ color: '#6B6B6B', textAlign: 'center', padding: '40px' }}>
            Loading documents...
          </p>
        ) : documents.length === 0 && !showForm ? (
          <div className="empty-state">
            <h3>No documents uploaded</h3>
            <p>Add your driving license, vehicle registration, and other required documents.</p>
          </div>
        ) : (
          <div className="document-list">
            {documents.map((doc) => (
              <div key={doc.doc_type} className="document-card">
                <div className="doc-card-header">
                  <h4>{formatDocType(doc.doc_type)}</h4>
                  <span
                    className="document-status"
                    style={{
                      background: `${STATUS_COLORS[doc.status] || '#6B6B6B'}18`,
                      color: STATUS_COLORS[doc.status] || '#6B6B6B',
                    }}
                  >
                    {doc.status}
                  </span>
                </div>
                <div className="doc-card-body">
                  {doc.expiry_date && (
                    <p className="doc-detail">
                      <span>Expires:</span> {new Date(doc.expiry_date).toLocaleDateString()}
                    </p>
                  )}
                  <p className="doc-detail">
                    <span>URL:</span>{' '}
                    <a href={doc.image_url} target="_blank" rel="noopener noreferrer">
                      View Document
                    </a>
                  </p>
                </div>
                <div className="doc-card-actions">
                  <button
                    onClick={() => handleDelete(doc.doc_type)}
                    className="doc-delete-btn"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DriverDocuments;
