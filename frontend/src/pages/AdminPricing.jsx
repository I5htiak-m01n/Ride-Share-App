import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

const FIELDS = [
  { key: 'base_fare', label: 'Base Fare (BDT)', step: '0.01', hint: 'Starting price for any ride' },
  { key: 'rate_first', label: 'Rate — First Segment (BDT/km)', step: '0.01', hint: 'Per-km rate for the first segment' },
  { key: 'first_km', label: 'First Segment Distance (km)', step: '0.01', hint: 'Distance threshold before rate changes' },
  { key: 'rate_after', label: 'Rate — After Threshold (BDT/km)', step: '0.01', hint: 'Per-km rate beyond the first segment' },
  { key: 'platform_fee_pct', label: 'Platform Fee (%)', step: '0.01', hint: 'Percentage deducted as platform fee' },
  { key: 'surge_factor', label: 'Surge Multiplier', step: '0.01', hint: 'Fare multiplier during high demand' },
  { key: 'surge_range_km', label: 'Surge Detection Range (km)', step: '0.1', hint: 'Radius to check ride request density' },
  { key: 'surge_density_threshold', label: 'Surge Density Threshold (requests/sq km)', step: '1', hint: 'Minimum density to trigger surge pricing' },
  { key: 'cancellation_pct', label: 'Cancellation Fee (%)', step: '0.01', hint: 'Percentage of estimated fare charged on ride cancellation' },
];

export default function AdminPricing() {
  const navigate = useNavigate();

  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchPricing = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getPricing();
      if (data.pricing) {
        setForm(data.pricing);
      }
    } catch {
      setError('Failed to load pricing standards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPricing(); }, [fetchPricing]);

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await adminAPI.updatePricing({
        base_fare: parseFloat(form.base_fare),
        rate_first: parseFloat(form.rate_first),
        first_km: parseFloat(form.first_km),
        rate_after: parseFloat(form.rate_after),
        platform_fee_pct: parseFloat(form.platform_fee_pct),
        surge_factor: parseFloat(form.surge_factor),
        surge_range_km: parseFloat(form.surge_range_km),
        surge_density_threshold: parseInt(form.surge_density_threshold),
        cancellation_pct: parseFloat(form.cancellation_pct),
      });
      setSuccessMsg('Pricing standards updated successfully');
    } catch {
      setError('Failed to update pricing standards');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-container">
      <NavBar brandText="Pricing Standards" />

      <div className="dashboard-content" style={{ padding: '32px 40px', maxWidth: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={() => navigate('/admin/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Pricing Configuration</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {successMsg && <div className="info-banner">{successMsg}</div>}

        {loading ? (
          <p style={{ color: '#6B6B6B', textAlign: 'center', padding: 40 }}>Loading...</p>
        ) : (
          <form onSubmit={handleSubmit} className="complaint-form">
            {FIELDS.map(f => (
              <div className="form-group" key={f.key}>
                <label>{f.label}</label>
                <input
                  type="number"
                  step={f.step}
                  min="0"
                  value={form[f.key] ?? ''}
                  onChange={e => handleChange(f.key, e.target.value)}
                  required
                />
                <small style={{ color: '#6B6B6B', marginTop: 2, display: 'block' }}>{f.hint}</small>
              </div>
            ))}

            <div className="complaint-form-actions">
              <button type="submit" className="card-button" disabled={saving}>
                {saving ? 'Saving...' : 'Update Pricing'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
