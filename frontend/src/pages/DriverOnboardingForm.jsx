import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { driversAPI, ridesAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function DriverOnboardingForm() {
  const navigate = useNavigate();

  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    license_number: '',
    license_expiry: '',
    vehicle_model: '',
    vehicle_type: 'economy',
    plate_number: '',
    insurance_expiry: '',
  });

  const [files, setFiles] = useState({
    license_file: null,
    nid_file: null,
    registration_file: null,
    insurance_file: null,
  });

  // Check onboarding status on mount — redirect if not applicable
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { data } = await driversAPI.getOnboardingStatus();
        if (cancelled) return;
        if (data.status === 'approved') {
          navigate('/driver/dashboard', { replace: true });
        } else if (data.status === 'pending_review') {
          navigate('/driver/onboarding/pending', { replace: true });
        }
        // needs_documents or rejected — stay on this page
      } catch {
        // stay on page
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [navigate]);

  // Fetch vehicle types for dropdown
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const { data } = await ridesAPI.getVehicleTypes();
        if (!cancelled) setVehicleTypes(data.vehicle_types || []);
      } catch {
        // fallback
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

    if (!files.license_file || !files.nid_file || !files.registration_file || !files.insurance_file) {
      setError('All document images are required.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('license_number', form.license_number);
      formData.append('license_expiry', form.license_expiry || '');
      formData.append('vehicle_model', form.vehicle_model);
      formData.append('vehicle_type', form.vehicle_type);
      formData.append('plate_number', form.plate_number);
      formData.append('insurance_expiry', form.insurance_expiry || '');
      formData.append('license_file', files.license_file);
      formData.append('nid_file', files.nid_file);
      formData.append('registration_file', files.registration_file);
      formData.append('insurance_file', files.insurance_file);

      await driversAPI.submitOnboarding(formData);
      navigate('/driver/onboarding/pending');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit documents');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <NavBar />

      <div className="dashboard-content">
        <div className="onboarding-container">
          <div className="onboarding-header">
            <h1>Add Vehicle and Documents</h1>
            <p>Submit your documents to start driving with RideShare</p>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit} className="onboarding-form">
            <div className="onboarding-section">
              <h3>Driver Documents</h3>

              <div className="form-group">
                <label>Driving License Number *</label>
                <input
                  type="text" name="license_number" value={form.license_number}
                  onChange={handleChange} placeholder="e.g. DL-123456" required
                />
              </div>

              <div className="form-group">
                <label>Driving License Image *</label>
                <input
                  type="file" name="license_file" accept="image/*"
                  onChange={handleFileChange} required
                />
                {files.license_file && <span className="file-name">{files.license_file.name}</span>}
              </div>

              <div className="form-group">
                <label>License Expiry Date</label>
                <input
                  type="date" name="license_expiry" value={form.license_expiry}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>National ID (NID) Image *</label>
                <input
                  type="file" name="nid_file" accept="image/*"
                  onChange={handleFileChange} required
                />
                {files.nid_file && <span className="file-name">{files.nid_file.name}</span>}
              </div>
            </div>

            <div className="onboarding-section">
              <h3>Vehicle Information</h3>

              <div className="form-group">
                <label>Vehicle Model *</label>
                <input
                  type="text" name="vehicle_model" value={form.vehicle_model}
                  onChange={handleChange} placeholder="e.g. Toyota Corolla 2022" required
                />
              </div>

              <div className="form-group">
                <label>Vehicle Type *</label>
                <select name="vehicle_type" value={form.vehicle_type} onChange={handleChange} required>
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
            </div>

            <div className="onboarding-section">
              <h3>Vehicle Documents</h3>

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
            </div>

            <div className="onboarding-actions">
              <button type="submit" disabled={loading} className="onboarding-submit-btn">
                {loading ? 'Submitting...' : 'Submit Documents'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default DriverOnboardingForm;
