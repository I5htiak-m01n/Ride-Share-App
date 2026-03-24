import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { driversAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

function DriverOnboardingRejected() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [reason, setReason] = useState('');

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
        } else if (data.status === 'needs_documents') {
          navigate('/driver/onboarding/documents', { replace: true });
        } else if (data.status === 'rejected') {
          setReason(data.reason || 'Your documents were rejected.');
        }
      } catch {
        // stay on page
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleResubmit = () => {
    navigate('/driver/onboarding/documents');
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
          <div className="onboarding-status-icon">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="38" stroke="#ef4444" strokeWidth="4" />
              <path d="M28 28l24 24M52 28L28 52" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>

          <div className="onboarding-header">
            <h1>Documents Rejected</h1>
            <p>Unfortunately, your submitted documents did not pass our review.</p>
          </div>

          <div className="onboarding-rejection-reason">
            <h3>Reason</h3>
            <p>{reason}</p>
          </div>

          <div className="onboarding-actions">
            <button onClick={handleResubmit} className="onboarding-submit-btn">
              Resubmit Documents
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DriverOnboardingRejected;
