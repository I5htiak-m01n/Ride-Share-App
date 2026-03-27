import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');

function ProfileSettings() {
  const { user, updateUser: setAuthUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const initial = (user?.first_name || '?')[0].toUpperCase();

  const fullAvatarUrl = avatarPreview || (avatarUrl ? `${API_BASE}${avatarUrl}` : null);

  const syncUser = (updated) => {
    setAuthUser(updated);
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarPreview(URL.createObjectURL(file));
    setUploadingAvatar(true);
    setError(null);

    try {
      const res = await userAPI.uploadAvatar(user.user_id, file);
      const updated = res.data.user;
      setAvatarUrl(updated.avatar_url);
      setAvatarPreview(null);
      syncUser(updated);
      setSuccess('Avatar updated');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload avatar');
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    setError(null);
    try {
      const res = await userAPI.updateUser(user.user_id, { avatar_url: null });
      const updated = res.data.user;
      setAvatarUrl('');
      setAvatarPreview(null);
      syncUser(updated);
      setSuccess('Avatar removed');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const updates = { first_name: firstName.trim(), last_name: lastName.trim() };
      if (phone.trim()) updates.phone_number = phone.trim();

      const res = await userAPI.updateUser(user.user_id, updates);
      const updated = res.data.user;
      syncUser(updated);
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
      <NavBar />

      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={goBack}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>User Profile</h1>
        </div>

        <div className="profile-page">
          {/* Avatar */}
          <div className="profile-avatar-section">
            <button
              type="button"
              className="profile-avatar"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
            >
              {fullAvatarUrl ? (
                <img src={fullAvatarUrl} alt="Avatar" className="profile-avatar-img" />
              ) : (
                <span className="profile-avatar-initials">{initial}</span>
              )}
              <div className="profile-avatar-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              {uploadingAvatar && <div className="profile-avatar-spinner" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarChange}
              hidden
            />
            <h2 className="profile-name">{user?.first_name} {user?.last_name}</h2>
            <p className="profile-role">{user?.role}</p>
            {fullAvatarUrl && !uploadingAvatar && (
              <button
                type="button"
                className="profile-remove-avatar-btn"
                onClick={handleRemoveAvatar}
              >
                Remove photo
              </button>
            )}
          </div>

          {/* Banners */}
          {error && <div className="error-banner">{error}</div>}
          {success && <div className="info-banner">{success}</div>}

          {/* Form */}
          <form className="profile-form" onSubmit={handleSave}>
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

            <div className="form-row">
              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter your first name"
                />
              </div>

              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter your last name"
                />
              </div>
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
