import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../api/client';
import './Dashboard.css';

export default function AdminPromos() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [form, setForm] = useState({
    promo_code: '',
    discount_amount: '',
    usage_per_user: '1',
    total_usage_limit: '',
    expiry_date: '',
    is_active: true,
  });

  const fetchPromos = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getPromos();
      setPromos(data.promos);
    } catch {
      setError('Failed to load promos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  const resetForm = () => {
    setForm({
      promo_code: '',
      discount_amount: '',
      usage_per_user: '1',
      total_usage_limit: '',
      expiry_date: '',
      is_active: true,
    });
    setEditingPromo(null);
    setShowForm(false);
  };

  const handleEdit = (promo) => {
    setEditingPromo(promo);
    setForm({
      promo_code: promo.promo_code,
      discount_amount: promo.discount_amount,
      usage_per_user: String(promo.usage_per_user),
      total_usage_limit: promo.total_usage_limit != null ? String(promo.total_usage_limit) : '',
      expiry_date: promo.expiry_date ? new Date(promo.expiry_date).toISOString().slice(0, 16) : '',
      is_active: promo.is_active,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const payload = {
      promo_code: form.promo_code,
      discount_amount: parseFloat(form.discount_amount),
      usage_per_user: parseInt(form.usage_per_user) || 1,
      total_usage_limit: form.total_usage_limit ? parseInt(form.total_usage_limit) : null,
      expiry_date: form.expiry_date || null,
      is_active: form.is_active,
    };

    try {
      if (editingPromo) {
        await adminAPI.updatePromo(editingPromo.promo_id, payload);
        setSuccessMsg('Promo updated successfully');
      } else {
        await adminAPI.createPromo(payload);
        setSuccessMsg('Promo created successfully');
      }
      resetForm();
      fetchPromos();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save promo');
    }
  };

  const handleDelete = async (promoId) => {
    if (!window.confirm('Are you sure you want to deactivate this promo?')) return;
    setError(null);
    try {
      await adminAPI.deletePromo(promoId);
      setSuccessMsg('Promo deactivated');
      fetchPromos();
    } catch {
      setError('Failed to deactivate promo');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';

  const isExpired = (d) => d && new Date(d) < new Date();

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              className="admin-btn unban"
              onClick={() => navigate('/admin/dashboard')}
              style={{ padding: '8px 16px' }}
            >
              &larr; Back to Dashboard
            </button>
            <h1 style={{ margin: 0, fontSize: 28 }}>Promo Codes</h1>
          </div>
          <button
            className="admin-btn approve"
            onClick={() => { resetForm(); setShowForm(true); }}
            style={{ padding: '10px 24px', fontSize: 14 }}
          >
            + New Promo
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {successMsg && (
          <div style={{
            background: '#e8f5e9', color: '#2e7d32', padding: '12px 16px',
            borderRadius: 8, marginBottom: 16, fontSize: 14,
          }}>
            {successMsg}
          </div>
        )}

        {/* ── Create / Edit Form ─────────────────────── */}
        {showForm && (
          <div style={{
            background: 'var(--uber-gray-10, #f6f6f6)', padding: 24, borderRadius: 12,
            marginBottom: 24, border: '1px solid var(--uber-gray-20, #e0e0e0)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>
              {editingPromo ? 'Edit Promo' : 'Create New Promo'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    Promo Code *
                  </label>
                  <input
                    type="text"
                    value={form.promo_code}
                    onChange={e => setForm({ ...form, promo_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SAVE20"
                    required
                    style={{
                      width: '100%', padding: '10px 12px', border: '1px solid #ccc',
                      borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    Discount Amount (BDT) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.discount_amount}
                    onChange={e => setForm({ ...form, discount_amount: e.target.value })}
                    placeholder="e.g. 50"
                    required
                    style={{
                      width: '100%', padding: '10px 12px', border: '1px solid #ccc',
                      borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    Uses Per User
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.usage_per_user}
                    onChange={e => setForm({ ...form, usage_per_user: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 12px', border: '1px solid #ccc',
                      borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    Total Usage Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.total_usage_limit}
                    onChange={e => setForm({ ...form, total_usage_limit: e.target.value })}
                    placeholder="Unlimited"
                    style={{
                      width: '100%', padding: '10px 12px', border: '1px solid #ccc',
                      borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    Expiry Date
                  </label>
                  <input
                    type="datetime-local"
                    value={form.expiry_date}
                    onChange={e => setForm({ ...form, expiry_date: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 12px', border: '1px solid #ccc',
                      borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>

                {editingPromo && (
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                      Status
                    </label>
                    <select
                      value={form.is_active ? 'active' : 'inactive'}
                      onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid #ccc',
                        borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                      }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                <button type="submit" className="admin-btn approve" style={{ padding: '10px 28px' }}>
                  {editingPromo ? 'Update Promo' : 'Create Promo'}
                </button>
                <button type="button" className="admin-btn unban" onClick={resetForm} style={{ padding: '10px 28px' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Promos Table ────────────────────────────── */}
        {promos.length === 0 && !loading ? (
          <div className="empty-state">
            <h3>No promo codes</h3>
            <p>Create your first promo code to get started.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Per User</th>
                <th>Global Limit</th>
                <th>Redemptions</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map(p => (
                <tr key={p.promo_id}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>{p.promo_code}</td>
                  <td>{parseFloat(p.discount_amount).toFixed(0)} BDT</td>
                  <td>{p.usage_per_user}</td>
                  <td>{p.total_usage_limit != null ? p.total_usage_limit : '∞'}</td>
                  <td>{p.total_redemptions}</td>
                  <td>
                    {p.expiry_date ? (
                      <span style={{ color: isExpired(p.expiry_date) ? '#d32f2f' : 'inherit' }}>
                        {fmtDate(p.expiry_date)}
                        {isExpired(p.expiry_date) && ' (expired)'}
                      </span>
                    ) : 'No expiry'}
                  </td>
                  <td>
                    <span className={`status-pill ${p.is_active && !isExpired(p.expiry_date) ? 'active-user' : 'banned'}`}>
                      {p.is_active && !isExpired(p.expiry_date) ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="admin-btn approve" onClick={() => handleEdit(p)}>Edit</button>
                      {p.is_active && (
                        <button className="admin-btn reject" onClick={() => handleDelete(p.promo_id)}>
                          Deactivate
                        </button>
                      )}
                    </div>
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
