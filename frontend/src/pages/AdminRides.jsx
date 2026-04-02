import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminAPI } from '../api/client';
import NavBar from '../components/NavBar';
import './Dashboard.css';

const RIDE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function AdminRides() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rideFilter, setRideFilter] = useState(searchParams.get('filter') || '');

  const fetchRides = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getRides(rideFilter || undefined);
      setRides(data.rides);
    } catch {
      setError('Failed to load rides');
    } finally {
      setLoading(false);
    }
  }, [rideFilter]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const handleFilterChange = (value) => {
    setRideFilter(value);
    if (value) {
      setSearchParams({ filter: value });
    } else {
      setSearchParams({});
    }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '—';

  const getStatusClass = (status) => {
    switch (status) {
      case 'completed': return 'active-user';
      case 'cancelled': return 'banned';
      case 'started':
      case 'driver_assigned': return 'in_progress';
      default: return 'open';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'driver_assigned': return 'Driver Assigned';
      case 'started': return 'In Progress';
      default: return status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    }
  };

  return (
    <div className="dashboard-container">
      <NavBar brandText="RideShare Admin" />

      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="page-back-btn" onClick={() => navigate('/admin/dashboard')}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: 28 }}>Ride History</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="admin-filter-row">
          <label>Filter:</label>
          <select value={rideFilter} onChange={e => handleFilterChange(e.target.value)}>
            {RIDE_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {rides.length === 0 && !loading ? (
          <div className="empty-state">
            <h3>No rides</h3>
            <p>No rides found{rideFilter ? ` with status "${RIDE_FILTERS.find(f => f.value === rideFilter)?.label}"` : ''}.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Driver</th>
                <th>Pickup</th>
                <th>Dropoff</th>
                <th>Fare</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rides.map(r => (
                <tr key={r.ride_id}>
                  <td>{r.rider_first_name} {r.rider_last_name}</td>
                  <td>{r.driver_first_name ? `${r.driver_first_name} ${r.driver_last_name}` : '—'}</td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.pickup_addr || '—'}
                  </td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.dropoff_addr || '—'}
                  </td>
                  <td>{r.total_fare ? `${parseFloat(r.total_fare).toFixed(0)} BDT` : '—'}</td>
                  <td>
                    <span className={`status-pill ${getStatusClass(r.status)}`}>
                      {getStatusLabel(r.status)}
                    </span>
                  </td>
                  <td>{fmtDate(r.created_at)}</td>
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
