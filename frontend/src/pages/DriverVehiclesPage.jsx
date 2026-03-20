import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import { driversAPI, ridesAPI } from '../api/client';
import RatingBadge from '../components/RatingBadge';
import NotificationDropdown from '../components/NotificationDropdown';
import './Dashboard.css';

const STATUS_COLORS = {
  approved: '#05944F',
  pending: '#F5A623',
  rejected: '#E11900',
};

function DriverVehiclesPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    vehicles, vehiclesLoading, fetchVehicles,
    activateVehicle, deactivateVehicle,
    userRating, error: ctxError,
  } = useDriver();

  const [showForm, setShowForm] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({
    vehicle_model: '',
    vehicle_type: 'economy',
    plate_number: '',
    insurance_expiry: '',
  });
  const [files, setFiles] = useState({
    registration_file: null,
    insurance_file: null,
  });

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  // Fetch vehicle types for dropdown
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const { data } = await ridesAPI.getVehicleTypes();
        if (!cancelled) setVehicleTypes(data.vehicle_types || []);
      } catch {
        // fallback options are in the JSX
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileChange = (e) => {
    setFiles((prev) => ({ ...prev, [e.target.name]: e.target.files[0] || null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!files.registration_file || !files.insurance_file) {
      setError('Both vehicle registration and insurance documents are required.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('vehicle_model', form.vehicle_model);
      formData.append('vehicle_type', form.vehicle_type);
      formData.append('plate_number', form.plate_number);
      formData.append('insurance_expiry', form.insurance_expiry || '');
      formData.append('registration_file', files.registration_file);
      formData.append('insurance_file', files.insurance_file);

      await driversAPI.addVehicle(formData);
      setSuccess('Vehicle submitted for review!');
      setForm({ vehicle_model: '', vehicle_type: 'economy', plate_number: '', insurance_expiry: '' });
      setFiles({ registration_file: null, insurance_file: null });
      setShowForm(false);
      fetchVehicles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>My Vehicles</h2>
        </div>
        <div className="nav-user">
          <NotificationDropdown />
          <RatingBadge ratingAvg={userRating.rating_avg} ratingCount={userRating.rating_count} />
          <span>Hi, {user?.name || 'Driver'}</span>
          <button className="card-button secondary" onClick={() => navigate('/driver/dashboard')} style={{ marginRight: 8 }}>
            ← Dashboard
          </button>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content" style={{ padding: '32px 40px', maxWidth: 700 }}>
        <div className="dashboard-header">
          <div>
            <h1>Vehicle Management</h1>
            <p>Add vehicles and activate one to start accepting rides</p>
          </div>
          {!showForm && (
            <button
              className="card-button"
              onClick={() => { setShowForm(true); setError(null); setSuccess(null); }}
            >
              Add New Vehicle
            </button>
          )}
        </div>

        {(error || ctxError) && <div className="error-banner">{error || ctxError}</div>}
        {success && <div className="info-banner">{success}</div>}

        {/* Add Vehicle Form */}
        {showForm && (
          <div className="add-document-form" style={{ marginBottom: 24 }}>
            <h3>Add New Vehicle</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Vehicle Model *</label>
                <input
                  type="text" name="vehicle_model" value={form.vehicle_model}
                  onChange={handleChange} placeholder="e.g. Toyota Corolla 2022" required
                />
              </div>

              <div className="form-group">
                <label>Vehicle Type *</label>
                <select name="vehicle_type" value={form.vehicle_type} onChange={handleChange} required className="doc-select">
                  {vehicleTypes.length > 0 ? (
                    vehicleTypes.map((vt) => (
                      <option key={vt.type_key} value={vt.type_key}>
                        {vt.label} — {vt.description} ({vt.capacity} seats)
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="economy">Economy</option>
                      <option value="sedan">Sedan</option>
                      <option value="suv">SUV</option>
                      <option value="premium">Premium</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Plate Number *</label>
                <input
                  type="text" name="plate_number" value={form.plate_number}
                  onChange={handleChange} placeholder="e.g. DHA-12-3456" required
                />
              </div>

              <div className="form-group">
                <label>Vehicle Registration Document *</label>
                <input
                  type="file" name="registration_file" accept="image/*"
                  onChange={handleFileChange} required
                />
                {files.registration_file && <span className="file-name">{files.registration_file.name}</span>}
              </div>

              <div className="form-group">
                <label>Insurance Document *</label>
                <input
                  type="file" name="insurance_file" accept="image/*"
                  onChange={handleFileChange} required
                />
                {files.insurance_file && <span className="file-name">{files.insurance_file.name}</span>}
              </div>

              <div className="form-group">
                <label>Insurance Expiry Date</label>
                <input
                  type="date" name="insurance_expiry" value={form.insurance_expiry}
                  onChange={handleChange}
                />
              </div>

              <div className="booking-actions">
                <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Vehicle'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Vehicle List */}
        {vehiclesLoading ? (
          <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading vehicles...</p>
        ) : vehicles.length === 0 && !showForm ? (
          <div className="empty-state">
            <h3>No vehicles yet</h3>
            <p>Add a vehicle to get started.</p>
          </div>
        ) : (
          <div className="vehicle-list">
            {vehicles.map((v) => (
              <div key={v.vehicle_id} className={`vehicle-card${v.is_active ? ' active-vehicle' : ''}`}>
                <div className="vehicle-card-header">
                  <h4>{v.model}</h4>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Approval status pill */}
                    {v.approval_status !== 'approved' && (
                      <span
                        className="status-pill"
                        style={{
                          background: `${STATUS_COLORS[v.approval_status] || '#6B6B6B'}18`,
                          color: STATUS_COLORS[v.approval_status] || '#6B6B6B',
                        }}
                      >
                        {v.approval_status === 'pending' ? 'Pending Review' : 'Rejected'}
                      </span>
                    )}
                    {/* Active/Inactive pill for approved vehicles */}
                    {v.approval_status === 'approved' && (
                      <span className={`status-pill ${v.is_active ? 'valid' : ''}`}>
                        {v.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="vehicle-card-body">
                  <p><span>Type:</span> {v.type_label || v.type}</p>
                  <p><span>Plate:</span> {v.plate_number}</p>
                  {v.fare_multiplier && (
                    <p><span>Fare:</span> {v.fare_multiplier}x multiplier</p>
                  )}
                  {v.approval_status === 'rejected' && v.rejection_reason && (
                    <p style={{ color: '#E11900', marginTop: 8 }}>
                      <span>Reason:</span> {v.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="vehicle-card-actions">
                  {v.approval_status === 'approved' && (
                    v.is_active ? (
                      <button onClick={() => deactivateVehicle(v.vehicle_id)}
                              className="vehicle-deactivate-btn">
                        Deactivate
                      </button>
                    ) : (
                      <button onClick={() => activateVehicle(v.vehicle_id)}
                              className="vehicle-activate-btn">
                        Set as Active
                      </button>
                    )
                  )}
                  {v.approval_status === 'pending' && (
                    <span style={{ color: '#F5A623', fontSize: 14 }}>Awaiting admin approval</span>
                  )}
                  {v.approval_status === 'rejected' && (
                    <button
                      className="card-button"
                      style={{ fontSize: 13 }}
                      onClick={() => { setShowForm(true); setForm({ vehicle_model: v.model, vehicle_type: v.type, plate_number: v.plate_number, insurance_expiry: '' }); setError(null); setSuccess(null); }}
                    >
                      Resubmit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DriverVehiclesPage;
