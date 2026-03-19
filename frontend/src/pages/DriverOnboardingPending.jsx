import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { driversAPI } from '../api/client';
import './Dashboard.css';

function DriverOnboardingPending() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [documents, setDocuments] = useState([]);
  const intervalRef = useRef(null);

  // Check status and redirect if not pending
  const checkStatus = async () => {
    try {
      const { data } = await driversAPI.getOnboardingStatus();
      if (data.status === 'approved') {
        navigate('/driver/dashboard', { replace: true });
      } else if (data.status === 'rejected') {
        navigate('/driver/onboarding/rejected', { replace: true });
      } else if (data.status === 'needs_documents') {
        navigate('/driver/onboarding/documents', { replace: true });
      }
      // else pending_review — stay
    } catch {
      // stay on page
    } finally {
      setChecking(false);
    }
  };

  // Fetch submitted documents for display
  const fetchDocs = async () => {
    try {
      const { data } = await driversAPI.getDocuments();
      setDocuments(data.documents || []);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    checkStatus();
    fetchDocs();

    // Poll every 30 seconds
    intervalRef.current = setInterval(checkStatus, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleLogout = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await logout();
    navigate('/login');
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  const docLabels = {
    driving_license: 'Driving License',
    nid: 'National ID',
    vehicle_registration: 'Vehicle Registration',
    insurance: 'Insurance',
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand"><h2>RideShare</h2></div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'Driver'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="onboarding-container">
          <div className="onboarding-status-icon">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="38" stroke="#f59e0b" strokeWidth="4" />
              <path d="M38 24h4v20h-4zM38 50h4v4h-4z" fill="#f59e0b" />
            </svg>
          </div>

          <div className="onboarding-header">
            <h1>Documents Under Inspection</h1>
            <p>Your documents have been submitted and are being reviewed by our team. This usually takes 1-2 business days.</p>
          </div>

          {documents.length > 0 && (
            <div className="onboarding-doc-list">
              <h3>Submitted Documents</h3>
              {documents.map((doc) => (
                <div key={doc.doc_type} className="onboarding-doc-item">
                  <span className="doc-label">{docLabels[doc.doc_type] || doc.doc_type}</span>
                  <span className={`doc-status status-${doc.status}`}>{doc.status}</span>
                </div>
              ))}
            </div>
          )}

          <p className="onboarding-hint">This page will automatically update when your documents are reviewed.</p>
        </div>
      </div>
    </div>
  );
}

export default DriverOnboardingPending;
