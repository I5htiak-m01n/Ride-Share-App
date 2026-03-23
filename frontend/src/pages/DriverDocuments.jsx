import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { driversAPI } from '../api/client';
import './Dashboard.css';

const DOC_TYPES = [
  { value: 'driving_license', label: 'Driving License' },
  { value: 'nid', label: 'National ID' },
  { value: 'other', label: 'Other' },
];

const ALL_DOC_TYPE_LABELS = {
  driving_license: 'Driving License',
  nid: 'National ID',
  vehicle_registration: 'Vehicle Registration',
  insurance: 'Insurance',
  other: 'Other',
};

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

  // Category filter state
  const [docCategory, setDocCategory] = useState('all');

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [docType, setDocType] = useState('driving_license');
  const [imageUrl, setImageUrl] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await driversAPI.getDocuments(docCategory === 'all' ? undefined : docCategory);
      setDocuments(res.data.documents || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [docCategory]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

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

  const formatDocType = (type) => ALL_DOC_TYPE_LABELS[type] || type;

  const isVehicleDoc = (docType) => ['vehicle_registration', 'insurance'].includes(docType);

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare Driver</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'Driver'}</span>
        </div>
      </nav>

      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={() => navigate('/driver/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Documents</h1>
          {!showForm && (
            <button
              className="card-button"
              onClick={() => { setShowForm(true); setError(null); setSuccess(null); }}
              style={{ marginLeft: 'auto' }}
            >
              Add Document
            </button>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="info-banner">{success}</div>}

        {/* Category Filter */}
        <div className="admin-filter-row" style={{ marginBottom: 20 }}>
          <label>Show:</label>
          <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
            <option value="all">All Documents</option>
            <option value="driver">Driver Documents</option>
            <option value="vehicle">Vehicle Documents</option>
          </select>
        </div>

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
            <h3>No documents found</h3>
            <p>
              {docCategory === 'vehicle'
                ? 'No vehicle documents yet. Add a vehicle from the My Vehicles page.'
                : docCategory === 'driver'
                ? 'No driver documents uploaded yet.'
                : 'Add your driving license, NID, and other required documents.'}
            </p>
          </div>
        ) : (
          <div className="document-list">
            {documents.map((doc, idx) => (
              <div key={`${doc.doc_type}-${doc.plate_number || idx}`} className="document-card">
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
                  {doc.vehicle_name && (
                    <p className="doc-detail">
                      <span>Vehicle:</span> {doc.vehicle_name} ({doc.vehicle_type})
                    </p>
                  )}
                  {doc.plate_number && (
                    <p className="doc-detail">
                      <span>Plate:</span> {doc.plate_number}
                    </p>
                  )}
                  <p className="doc-detail">
                    <span>URL:</span>{' '}
                    <a href={doc.image_url} target="_blank" rel="noopener noreferrer">
                      View Document
                    </a>
                  </p>
                </div>
                {/* Only show delete for driver docs — vehicle docs are managed in My Vehicles */}
                {!isVehicleDoc(doc.doc_type) && (
                  <div className="doc-card-actions">
                    <button
                      onClick={() => handleDelete(doc.doc_type)}
                      className="doc-delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DriverDocuments;
