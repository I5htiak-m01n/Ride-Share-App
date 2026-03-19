import { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { driversAPI } from '../api/client';

function OnboardingGuard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { data } = await driversAPI.getOnboardingStatus();
        if (!cancelled) setStatus(data.status);
      } catch {
        // On error, allow through to avoid blocking approved drivers
        if (!cancelled) setStatus('approved');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (status === 'approved') return <Outlet />;
  if (status === 'needs_documents' || status === 'rejected') return <Navigate to="/driver/onboarding/documents" replace />;
  if (status === 'pending_review') return <Navigate to="/driver/onboarding/pending" replace />;

  return <Outlet />;
}

export default OnboardingGuard;
