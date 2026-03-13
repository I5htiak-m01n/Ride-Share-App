import { useState, useEffect, useRef, useCallback } from 'react';
import { notificationsAPI } from '../api/client';

function formatTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notificationsAPI.getUnreadCount();
      setUnreadCount(res.data.count);
    } catch (err) {
      console.error('fetchUnreadCount error:', err);
    }
  }, []);

  // Fetch unread count on mount
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = async () => {
    if (!open) {
      setLoading(true);
      try {
        const res = await notificationsAPI.getAll();
        setNotifications(res.data.notifications);
        // Mark all as read
        if (unreadCount > 0) {
          await notificationsAPI.markAllRead();
          setUnreadCount(0);
        }
      } catch (err) {
        console.error('fetchNotifications error:', err);
      } finally {
        setLoading(false);
      }
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className="notif-dropdown-wrapper" ref={wrapperRef}>
      <button className="notif-bell-btn" onClick={handleToggle} title="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>Notifications</span>
          </div>
          <div className="notif-panel-list">
            {loading && <p className="notif-empty">Loading...</p>}
            {!loading && notifications.length === 0 && (
              <p className="notif-empty">No notifications yet</p>
            )}
            {!loading && notifications.map((n) => (
              <div key={n.notif_id} className={`notif-item ${n.is_read ? '' : 'unread'}`}>
                <div className="notif-item-title">{n.title}</div>
                {n.body && <div className="notif-item-body">{n.body}</div>}
                <div className="notif-item-time">{formatTimeAgo(n.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationDropdown;
