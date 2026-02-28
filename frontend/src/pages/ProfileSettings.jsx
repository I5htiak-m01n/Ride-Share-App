import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../api/client';
import './Dashboard.css';

function ProfileSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const updates = { name: name.trim() };
      if (phone.trim()) updates.phone_number = phone.trim();

      const res = await userAPI.updateUser(user.user_id, updates);
      const updated = res.data.user;

      // Update sessionStorage so nav and context reflect the change
      const stored = JSON.parse(sessionStorage.getItem('user') || '{}');
      const merged = { ...stored, ...updated };
      sessionStorage.setItem('user', JSON.stringify(merged));

      setSuccess('Profile updated successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    const role = user?.role;
    if (role === 'driver') navigate('/driver/dashboard');
    else navigate('/rider/dashboard');
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'User'}</span>
          <button onClick={goBack} className="logout-btn">Back</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="dashboard-header">
          <div>
            <h1>Profile Settings</h1>
            <p>Update your account information</p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="info-banner">{success}</div>}

        <div className="profile-form">
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="input-disabled"
              />
              <span className="form-hint">Email cannot be changed</span>
            </div>

            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
              />
            </div>

            <div className="form-group">
              <label>Role</label>
              <input
                type="text"
                value={user?.role || ''}
                disabled
                className="input-disabled"
                style={{ textTransform: 'capitalize' }}
              />
            </div>

            <button
              type="submit"
              className="profile-save-btn"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ProfileSettings;
