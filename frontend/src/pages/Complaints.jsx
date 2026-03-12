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
          {!showForm && (
            <button className="card-button" onClick={() => setShowForm(true)}>File a Complaint</button>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="info-banner">{success}</div>}

        {/* File Complaint Form */}
        {showForm && (
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

        {/* My Complaints List */}
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
              <div key={c.ticket_id} className="history-item">
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
                  <div style={{ padding: '12px 0 0', fontSize: 14, color: 'var(--uber-gray-50)', borderTop: '1px solid var(--uber-gray-20)', marginTop: 12 }}>
                    {c.details}
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
