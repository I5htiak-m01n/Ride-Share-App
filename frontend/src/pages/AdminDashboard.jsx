import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../api/client';
import './Dashboard.css';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
  { key: 'tickets', label: 'Support Tickets' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'users', label: 'Users' },
  { key: 'staff', label: 'Staff' },
  { key: 'promos', label: 'Promos' },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  // Overview
  const [stats, setStats] = useState(null);

  // Documents
  const [documents, setDocuments] = useState([]);
  const [docFilter, setDocFilter] = useState('');

  // Tickets
  const [tickets, setTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [responseMsg, setResponseMsg] = useState('');
  const [responseStatus, setResponseStatus] = useState('');

  // Complaints
  const [complaints, setComplaints] = useState([]);
  const [complaintFilter, setComplaintFilter] = useState('');

  // Users
  const [users, setUsers] = useState([]);

  // Support Staff
  const [staffList, setStaffList] = useState([]);
  const [staffForAssign, setStaffForAssign] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* ── Fetchers ─────────────────────────────────────────── */

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getStats();
      setStats(data.stats);
    } catch {
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getDocuments(docFilter || undefined);
      setDocuments(data.documents);
    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [docFilter]);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getTickets(ticketFilter || undefined);
      setTickets(data.tickets);
    } catch {
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [ticketFilter]);

  const fetchTicketDetail = useCallback(async (ticketId) => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getTicketDetail(ticketId);
      setTicketDetail(data);
    } catch {
      setError('Failed to load ticket detail');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchComplaints = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getComplaints(complaintFilter || undefined);
      setComplaints(data.complaints);
    } catch {
      setError('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  }, [complaintFilter]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getUsers();
      setUsers(data.users);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getSupportStaff();
      setStaffList(data.staff);
    } catch {
      setError('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch staff for assign dropdown (on tickets tab)
  const fetchStaffForAssign = useCallback(async () => {
    try {
      const { data } = await adminAPI.getSupportStaff();
      setStaffForAssign(data.staff);
    } catch {
      // silent
    }
  }, []);

  /* ── Tab change ────────────────────────────────────────── */

  useEffect(() => {
    setError(null);
    setSelectedTicketId(null);
    setTicketDetail(null);
    if (activeTab === 'promos') {
      navigate('/admin/promos');
      return;
    }
    switch (activeTab) {
      case 'overview': fetchStats(); break;
      case 'documents': fetchDocuments(); break;
      case 'tickets': fetchTickets(); fetchStaffForAssign(); break;
      case 'complaints': fetchComplaints(); break;
      case 'users': fetchUsers(); break;
      case 'staff': fetchStaff(); break;
    }
  }, [activeTab, fetchStats, fetchDocuments, fetchTickets, fetchComplaints, fetchUsers, fetchStaff, fetchStaffForAssign, navigate]);

  // Refetch on filter change
  useEffect(() => { if (activeTab === 'documents') fetchDocuments(); }, [docFilter, fetchDocuments, activeTab]);
  useEffect(() => { if (activeTab === 'tickets') fetchTickets(); }, [ticketFilter, fetchTickets, activeTab]);
  useEffect(() => { if (activeTab === 'complaints') fetchComplaints(); }, [complaintFilter, fetchComplaints, activeTab]);

  /* ── Handlers ─────────────────────────────────────────── */

  const handleVerifyDoc = async (driverId, docType, status) => {
    try {
      await adminAPI.verifyDocument(driverId, docType, status);
      fetchDocuments();
    } catch {
      setError('Failed to update document');
    }
  };

  const handleOpenTicket = (ticketId) => {
    setSelectedTicketId(ticketId);
    fetchTicketDetail(ticketId);
  };

  const handleRespondTicket = async () => {
    if (!responseMsg.trim()) return;
    try {
      await adminAPI.respondToTicket(selectedTicketId, responseMsg.trim(), responseStatus || undefined);
      setResponseMsg('');
      setResponseStatus('');
      fetchTicketDetail(selectedTicketId);
      fetchTickets();
    } catch {
      setError('Failed to send response');
    }
  };

  const handleResolveComplaint = async (ticketId, status) => {
    try {
      await adminAPI.resolveComplaint(ticketId, status);
      fetchComplaints();
    } catch {
      setError('Failed to update complaint');
    }
  };

  const handleToggleBan = async (userId) => {
    try {
      await adminAPI.toggleBanUser(userId);
      fetchUsers();
    } catch {
      setError('Failed to update user');
    }
  };

  const handleSetPriority = async (ticketId, priority) => {
    try {
      await adminAPI.setTicketPriority(ticketId, priority);
      fetchTickets();
    } catch {
      setError('Failed to set priority');
    }
  };

  const handleAssignTicket = async (ticketId, staffId) => {
    if (!staffId) return;
    try {
      await adminAPI.assignTicket(ticketId, staffId);
      fetchTickets();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign ticket');
    }
  };

  const handleUpdateStaffLevel = async (staffId, level) => {
    try {
      await adminAPI.updateStaffLevel(staffId, level);
      fetchStaff();
    } catch {
      setError('Failed to update staff level');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand"><h2>RideShare Admin</h2></div>
        <div className="nav-user">
          <span>{user?.first_name || 'Admin'}</span>
          <Link to="/admin/analytics" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>
            Analytics
          </Link>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="admin-tab-bar">
          {TABS.map(t => (
            <button key={t.key} className={`admin-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* ── OVERVIEW ─────────────────────────────────── */}
        {activeTab === 'overview' && stats && (
          <div className="quick-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card"><div className="stat-number">{stats.total_users}</div><div className="stat-label">Total Users</div></div>
            <div className="stat-card"><div className="stat-number">{stats.total_drivers}</div><div className="stat-label">Drivers</div></div>
            <div className="stat-card"><div className="stat-number">{stats.total_riders}</div><div className="stat-label">Riders</div></div>
            <div className="stat-card"><div className="stat-number">{stats.total_rides}</div><div className="stat-label">Total Rides</div></div>
            <div className="stat-card"><div className="stat-number">{stats.active_rides}</div><div className="stat-label">Active Rides</div></div>
            <div className="stat-card"><div className="stat-number">{stats.open_tickets}</div><div className="stat-label">Open Tickets</div></div>
            <div className="stat-card"><div className="stat-number">{stats.pending_documents}</div><div className="stat-label">Pending Docs</div></div>
            <div className="stat-card"><div className="stat-number">{stats.open_complaints}</div><div className="stat-label">Open Complaints</div></div>
            <div className="stat-card"><div className="stat-number">{stats.banned_users}</div><div className="stat-label">Banned Users</div></div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/promos')}>
              <div className="stat-number">{stats.active_promos || 0}</div>
              <div className="stat-label">Active Promos</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('staff')}>
              <div className="stat-number">{stats.active_support_staff || 0}</div>
              <div className="stat-label">Support Staff</div>
            </div>
          </div>
        )}
        {activeTab === 'overview' && !stats && !loading && (
          <div className="empty-state"><h3>No data</h3><p>Could not load dashboard stats.</p></div>
        )}

        {/* ── DOCUMENTS ────────────────────────────────── */}
        {activeTab === 'documents' && (
          <>
            <div className="admin-filter-row">
              <label>Filter:</label>
              <select value={docFilter} onChange={e => setDocFilter(e.target.value)}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="valid">Valid</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            {documents.length === 0 ? (
              <div className="empty-state"><h3>No documents</h3><p>No driver documents found.</p></div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Email</th>
                    <th>Doc Type</th>
                    <th>Vehicle</th>
                    <th>Expiry</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(d => (
                    <tr key={`${d.driver_id}-${d.doc_type}`}>
                      <td>{d.first_name} {d.last_name}</td>
                      <td>{d.email}</td>
                      <td>{d.doc_type}</td>
                      <td>{d.vehicle_name ? `${d.vehicle_name} (${d.vehicle_type}) - ${d.plate_number}` : '\u2014'}</td>
                      <td>{fmtDate(d.expiry_date)}</td>
                      <td><span className={`status-pill ${d.status}`}>{d.status}</span></td>
                      <td>
                        {d.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="admin-btn approve" onClick={() => handleVerifyDoc(d.driver_id, d.doc_type, 'valid')}>Approve</button>
                            <button className="admin-btn reject" onClick={() => handleVerifyDoc(d.driver_id, d.doc_type, 'rejected')}>Reject</button>
                          </div>
                        )}
                        {d.image_url && <a href={d.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, marginLeft: 6 }}>View</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── SUPPORT TICKETS ──────────────────────────── */}
        {activeTab === 'tickets' && !selectedTicketId && (
          <>
            <div className="admin-filter-row">
              <label>Filter:</label>
              <select value={ticketFilter} onChange={e => setTicketFilter(e.target.value)}>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            {tickets.length === 0 ? (
              <div className="empty-state"><h3>No tickets</h3><p>No support tickets found.</p></div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>User</th>
                    <th>Description</th>
                    <th>Priority</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.ticket_id}>
                      <td>{t.type}</td>
                      <td>{t.first_name} {t.last_name}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</td>
                      <td>
                        <select
                          className="priority-select"
                          value={t.priority}
                          onChange={e => handleSetPriority(t.ticket_id, parseInt(e.target.value))}
                        >
                          {[1,2,3,4,5].map(p => <option key={p} value={p}>P{p}</option>)}
                        </select>
                      </td>
                      <td>
                        {t.staff_first_name
                          ? <span>{t.staff_first_name} {t.staff_last_name} (L{t.staff_level})</span>
                          : <select
                              className="priority-select"
                              defaultValue=""
                              onChange={e => handleAssignTicket(t.ticket_id, e.target.value)}
                            >
                              <option value="" disabled>Assign...</option>
                              {staffForAssign
                                .filter(s => s.level >= t.priority && s.is_active)
                                .map(s => (
                                  <option key={s.support_staff_id} value={s.support_staff_id}>
                                    {s.first_name} {s.last_name} (L{s.level})
                                  </option>
                                ))}
                            </select>
                        }
                      </td>
                      <td><span className={`status-pill ${t.status}`}>{t.status}</span></td>
                      <td>{fmtDate(t.created_at)}</td>
                      <td><button className="admin-btn approve" onClick={() => handleOpenTicket(t.ticket_id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* Ticket detail view */}
        {activeTab === 'tickets' && selectedTicketId && ticketDetail && (
          <div className="admin-ticket-detail">
            <button className="admin-btn unban" onClick={() => { setSelectedTicketId(null); setTicketDetail(null); }} style={{ marginBottom: 16 }}>
              &larr; Back to list
            </button>

            <h2 style={{ margin: '0 0 4px' }}>{ticketDetail.ticket.type}</h2>
            <p style={{ color: 'var(--uber-gray-50)', margin: '0 0 8px', fontSize: 14 }}>
              By {ticketDetail.ticket.first_name} {ticketDetail.ticket.last_name} ({ticketDetail.ticket.email})
            </p>
            <span className={`status-pill ${ticketDetail.ticket.status}`}>{ticketDetail.ticket.status}</span>

            {ticketDetail.ticket.description && (
              <div style={{ margin: '16px 0', padding: 16, background: 'var(--uber-gray-10)', borderRadius: 8, fontSize: 14 }}>
                {ticketDetail.ticket.description}
              </div>
            )}

            <h3 style={{ margin: '24px 0 12px', fontSize: 16 }}>Responses</h3>
            <div className="admin-response-timeline">
              {ticketDetail.responses.length === 0 && <p style={{ color: 'var(--uber-gray-50)', fontSize: 13 }}>No responses yet.</p>}
              {ticketDetail.responses.map(r => (
                <div key={r.response_id} className={`admin-response-item${r.role === 'admin' ? ' admin-reply' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{r.first_name} {r.last_name} ({r.role})</strong>
                    <span style={{ fontSize: 12, color: 'var(--uber-gray-50)' }}>{fmtDate(r.created_at)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14 }}>{r.message}</p>
                </div>
              ))}
            </div>

            <div className="admin-response-form">
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Reply</h3>
              <textarea
                value={responseMsg}
                onChange={e => setResponseMsg(e.target.value)}
                placeholder="Type your response..."
                maxLength={2000}
              />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <select value={responseStatus} onChange={e => setResponseStatus(e.target.value)} style={{ padding: '10px 16px', border: '1px solid var(--uber-gray-30)', borderRadius: 8, fontSize: 14 }}>
                  <option value="">Keep status</option>
                  <option value="in_progress">Set In Progress</option>
                  <option value="resolved">Set Resolved</option>
                  <option value="closed">Set Closed</option>
                </select>
                <button className="admin-btn approve" onClick={handleRespondTicket} disabled={!responseMsg.trim()}>Send Response</button>
              </div>
            </div>
          </div>
        )}

        {/* ── COMPLAINTS ───────────────────────────────── */}
        {activeTab === 'complaints' && (
          <>
            <div className="admin-filter-row">
              <label>Filter:</label>
              <select value={complaintFilter} onChange={e => setComplaintFilter(e.target.value)}>
                <option value="">All</option>
                <option value="filed">Filed</option>
                <option value="under_review">Under Review</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            {complaints.length === 0 ? (
              <div className="empty-state"><h3>No complaints</h3><p>No complaints found.</p></div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Filed By</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Filed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map(c => (
                    <tr key={c.ticket_id}>
                      <td>{c.category}</td>
                      <td>{c.first_name} {c.last_name}</td>
                      <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.details || '—'}</td>
                      <td><span className={`status-pill ${c.complaint_status}`}>{c.complaint_status}</span></td>
                      <td>{fmtDate(c.filed_at)}</td>
                      <td>
                        {(c.complaint_status === 'filed' || c.complaint_status === 'under_review') && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="admin-btn approve" onClick={() => handleResolveComplaint(c.ticket_id, 'resolved')}>Resolve</button>
                            <button className="admin-btn reject" onClick={() => handleResolveComplaint(c.ticket_id, 'rejected')}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── USERS ────────────────────────────────────── */}
        {activeTab === 'users' && (
          <>
            {users.length === 0 ? (
              <div className="empty-state"><h3>No users</h3><p>No users found.</p></div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id}>
                      <td>{u.first_name} {u.last_name}</td>
                      <td>{u.email}</td>
                      <td>{u.phone_number}</td>
                      <td>{u.role}</td>
                      <td>{fmtDate(u.created_at)}</td>
                      <td>
                        <span className={`status-pill ${u.is_banned ? 'banned' : 'active-user'}`}>
                          {u.is_banned ? 'Banned' : 'Active'}
                        </span>
                      </td>
                      <td>
                        {u.role !== 'admin' && (
                          <button
                            className={`admin-btn ${u.is_banned ? 'unban' : 'ban'}`}
                            onClick={() => handleToggleBan(u.user_id)}
                          >
                            {u.is_banned ? 'Unban' : 'Ban'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── SUPPORT STAFF ──────────────────────────────── */}
        {activeTab === 'staff' && (
          <>
            {staffList.length === 0 ? (
              <div className="empty-state"><h3>No support staff</h3><p>No support staff members found. Create users with the &apos;support&apos; role and add them to the support_staff table.</p></div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Level</th>
                    <th>Active Tickets</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map(s => (
                    <tr key={s.support_staff_id}>
                      <td>{s.first_name} {s.last_name}</td>
                      <td>{s.email}</td>
                      <td><span className={`priority-badge p${s.level}`}>Level {s.level}</span></td>
                      <td>{s.active_tickets}</td>
                      <td><span className={`status-pill ${s.is_active ? 'active-user' : 'banned'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="admin-btn approve"
                            disabled={s.level >= 5}
                            onClick={() => handleUpdateStaffLevel(s.support_staff_id, s.level + 1)}
                          >
                            Promote
                          </button>
                          <button
                            className="admin-btn reject"
                            disabled={s.level <= 1}
                            onClick={() => handleUpdateStaffLevel(s.support_staff_id, s.level - 1)}
                          >
                            Demote
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {loading && <p style={{ textAlign: 'center', color: 'var(--uber-gray-50)', marginTop: 20 }}>Loading...</p>}
      </div>
    </div>
  );
}
