import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');

function UserDropdown({ onLogout, ratingAvg, ratingCount }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const displayName = user?.name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'User';
  const initial = (user?.first_name || user?.name || 'U').charAt(0).toUpperCase();
  const role = user?.role || 'rider';
  const hasRating = ratingAvg !== null && ratingAvg !== undefined;
  const avatarUrl = user?.avatar_url ? `${API_BASE}${user.avatar_url}` : null;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    if (onLogout) {
      await onLogout();
    } else {
      await logout();
      navigate('/login');
    }
  };

  const handleNavigate = (path) => {
    setOpen(false);
    navigate(path);
  };

  // Role-based menu items
  const menuItems = [];
  if (['rider', 'driver', 'mixed'].includes(role)) {
    menuItems.push(
      { label: 'Help', path: '/support/tickets', icon: 'help' },
      { label: 'Wallet', path: '/wallet', icon: 'wallet' },
      { label: 'Profile', path: '/rider/profile', icon: 'profile' },
    );
  } else if (role === 'admin') {
    menuItems.push(
      { label: 'Analytics', path: '/admin/analytics', icon: 'analytics' },
    );
  }

  const renderIcon = (type) => {
    switch (type) {
      case 'help':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'wallet':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        );
      case 'profile':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M20 21a8 8 0 1 0-16 0" />
          </svg>
        );
      case 'analytics':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="user-dropdown-wrapper" ref={wrapperRef}>
      <button
        className="user-dropdown-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="user-dropdown-trigger-avatar">
          {avatarUrl ? <img src={avatarUrl} alt="" className="user-dropdown-avatar-img" /> : initial}
        </div>
        <span className="user-dropdown-trigger-name">{displayName}</span>
        <svg
          className={`user-dropdown-chevron${open ? ' user-dropdown-chevron--open' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="user-dropdown-panel" role="menu">
          <div className="user-dropdown-header">
            <div className="user-dropdown-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" className="user-dropdown-avatar-img" /> : initial}
            </div>
            <div className="user-dropdown-header-info">
              <div className="user-dropdown-name">{displayName}</div>
              {user?.email && (
                <div className="user-dropdown-email">{user.email}</div>
              )}
              {hasRating && (
                <div className="user-dropdown-rating">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span>{ratingAvg.toFixed(1)}</span>
                  {ratingCount !== undefined && ratingCount !== null && (
                    <span className="user-dropdown-rating-count">({ratingCount})</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {menuItems.length > 0 && (
            <>
              <div className="user-dropdown-divider" />
              <div className="user-dropdown-menu" role="menu">
                {menuItems.map((item) => (
                  <button
                    key={item.path}
                    className="user-dropdown-item"
                    onClick={() => handleNavigate(item.path)}
                    role="menuitem"
                  >
                    {renderIcon(item.icon)}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="user-dropdown-divider" />
          <button
            className="user-dropdown-signout"
            onClick={handleSignOut}
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default UserDropdown;
