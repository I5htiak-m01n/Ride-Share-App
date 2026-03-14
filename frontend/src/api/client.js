import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration — only auto-logout on 401 (missing/expired token).
// 403 means permission denied (wrong role) which shouldn't force a logout.
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't intercept login or register requests — let the caller handle the error
      if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/register')) {
        return Promise.reject(error);
      }

      // Don't retry refresh requests themselves
      if (originalRequest.url?.includes('/auth/refresh')) {
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('refresh_token');
        sessionStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue requests while a refresh is in progress
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = sessionStorage.getItem('refresh_token');
      if (!refreshToken) {
        isRefreshing = false;
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken });
        sessionStorage.setItem('access_token', data.access_token);
        sessionStorage.setItem('refresh_token', data.refresh_token);
        processQueue(null, data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('refresh_token');
        sessionStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (userData) => api.post('/auth/register', userData),
  login: (credentials) => api.post('/auth/login', credentials),
  getProfile: () => api.get('/auth/profile'),
  logout: () => api.post('/auth/logout'),
  refresh: (refresh_token) => api.post('/auth/refresh', { refresh_token }),
};

// User API
export const userAPI = {
  getUser: (userId) => api.get(`/users/${userId}`),
  updateUser: (userId, data) => api.put(`/users/${userId}`, data),
  getAllUsers: () => api.get('/users'),
};

// Rides API
export const ridesAPI = {
  // Rider: request a ride
  createRequest: (data) => api.post('/rides/request', data),

  // Driver: get open ride requests within radius of driver's location
  getNearby: (lat, lng, radius = 5000) =>
    api.get(`/rides/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),

  // Driver: push GPS location to backend
  updateLocation: (lat, lng) =>
    api.put('/rides/driver-location', { lat, lng }),

  // Driver: accept a ride request
  acceptRequest: (requestId) =>
    api.post(`/rides/requests/${requestId}/accept`),

  // Driver: reject a ride request
  rejectRequest: (requestId) =>
    api.post(`/rides/requests/${requestId}/reject`),

  // Driver: update ride status (started / completed / cancelled)
  updateStatus: (rideId, status) =>
    api.put(`/rides/${rideId}/status`, { status }),

  // Rider: get fare estimate before booking
  getFareEstimate: (pickup_lat, pickup_lng, dropoff_lat, dropoff_lng) =>
    api.get(`/rides/fare-estimate?pickup_lat=${pickup_lat}&pickup_lng=${pickup_lng}&dropoff_lat=${dropoff_lat}&dropoff_lng=${dropoff_lng}`),

  // Rider: poll for current ride status
  getRiderActive: () => api.get('/rides/rider/active'),

  // Rider: cancel pending ride request
  cancelRequest: (requestId) => api.post(`/rides/requests/${requestId}/cancel`),

  // Rider: get available promo codes
  getAvailablePromos: () => api.get('/rides/rider/promos'),

  // Directions: get route preview between two points
  getDirections: (origin_lat, origin_lng, dest_lat, dest_lng, travel_mode = 'driving') =>
    api.post('/rides/directions', { origin_lat, origin_lng, dest_lat, dest_lng, travel_mode }),

  // Directions: get stored route for a ride
  getRideRoute: (rideId) => api.get(`/rides/${rideId}/route`),

  // Directions: force reroute from driver's current position
  reroute: (rideId, driver_lat, driver_lng) =>
    api.post(`/rides/${rideId}/reroute`, { driver_lat, driver_lng }),

  // Directions: check if driver is off-route and auto-reroute if needed
  checkRoute: (rideId, driver_lat, driver_lng) =>
    api.post(`/rides/${rideId}/check-route`, { driver_lat, driver_lng }),

  // Ride history
  getRiderHistory: () => api.get('/rides/rider/history'),
  getDriverHistory: () => api.get('/rides/driver/history'),
  getDriverActive: () => api.get('/rides/driver/active'),

  // Driver: check readiness before going online
  checkReadiness: () => api.get('/rides/driver/readiness'),

  // Public: get available vehicle types
  getVehicleTypes: () => api.get('/rides/vehicle-types'),

  // Ride detail (full info + chat + ratings)
  getRideDetail: (rideId) => api.get(`/rides/${rideId}/detail`),
};

// Drivers API
export const driversAPI = {
  getDocuments: () => api.get('/drivers/documents'),
  addDocument: (data) => api.post('/drivers/documents', data),
  deleteDocument: (docType) => api.delete(`/drivers/documents/${docType}`),
  getVehicles: () => api.get('/drivers/vehicles'),
  activateVehicle: (vehicleId) => api.put(`/drivers/vehicles/${vehicleId}/activate`),
  deactivateVehicle: (vehicleId) => api.put(`/drivers/vehicles/${vehicleId}/deactivate`),
};

// Wallet API
export const walletAPI = {
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (limit = 20, offset = 0) =>
    api.get(`/wallet/transactions?limit=${limit}&offset=${offset}`),
  topUp: (amount) => api.post('/wallet/topup', { amount }),
  validatePromo: (promo_code, estimated_fare) =>
    api.post('/wallet/validate-promo', { promo_code, estimated_fare }),
  getEarningsSummary: () => api.get('/wallet/earnings-summary'),
};

// Payment API (SSLCommerz)
export const paymentAPI = {
  initTopUp: (amount) => api.post('/payment/init', { amount }),
};

// Ratings API
export const ratingsAPI = {
  submit: (ride_id, ratee_user_id, score, comment) =>
    api.post('/ratings', { ride_id, ratee_user_id, score, comment }),
  getForRide: (rideId) => api.get(`/ratings/${rideId}`),
  getMyRating: () => api.get('/ratings/user/me'),
};

// Chat API
export const chatAPI = {
  getMessages: (rideId, since) =>
    api.get(`/chat/${rideId}/messages${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  sendMessage: (rideId, content) =>
    api.post(`/chat/${rideId}/messages`, { content }),
};

// Notifications API
export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (notifId) => api.put(`/notifications/${notifId}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

// Admin API
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getDocuments: (status) =>
    api.get(`/admin/documents${status ? `?status=${status}` : ''}`),
  verifyDocument: (driverId, docType, status) =>
    api.put(`/admin/documents/${driverId}/${encodeURIComponent(docType)}`, { status }),
  getTickets: (status) =>
    api.get(`/admin/tickets${status ? `?status=${status}` : ''}`),
  getTicketDetail: (ticketId) =>
    api.get(`/admin/tickets/${ticketId}`),
  respondToTicket: (ticketId, message, status) =>
    api.post(`/admin/tickets/${ticketId}/respond`, { message, status }),
  getComplaints: (status) =>
    api.get(`/admin/complaints${status ? `?status=${status}` : ''}`),
  getComplaintDetail: (ticketId) =>
    api.get(`/admin/complaints/${ticketId}`),
  getUsers: () => api.get('/admin/users'),
  toggleBanUser: (userId) => api.put(`/admin/users/${userId}/ban`),
  // Promos
  getPromos: () => api.get('/admin/promos'),
  getPromoStats: () => api.get('/admin/promos/stats'),
  createPromo: (data) => api.post('/admin/promos', data),
  updatePromo: (promoId, data) => api.put(`/admin/promos/${promoId}`, data),
  deletePromo: (promoId) => api.delete(`/admin/promos/${promoId}`),
  // Support staff management
  getSupportStaff: () => api.get('/admin/staff'),
  updateStaffLevel: (staffId, level) => api.put(`/admin/staff/${staffId}/level`, { level }),
  setTicketPriority: (ticketId, priority) => api.put(`/admin/tickets/${ticketId}/priority`, { priority }),
  assignTicket: (ticketId, staff_id) => api.put(`/admin/tickets/${ticketId}/assign`, { staff_id }),
};

// Analytics API (admin only)
export const analyticsAPI = {
  getTopDrivers: () => api.get('/analytics/top-drivers'),
  getZoneRevenue: () => api.get('/analytics/zone-revenue'),
  getPromoPerformance: () => api.get('/analytics/promo-performance'),
};

// Complaints API (user-facing)
export const complaintsAPI = {
  file: (ride_id, category, details) =>
    api.post('/complaints', { ride_id, category, details }),
  getMine: () => api.get('/complaints/mine'),
  getDetail: (ticketId) => api.get(`/complaints/${ticketId}`),
};

// Support API (user-facing)
export const supportAPI = {
  createTicket: (data) => api.post('/support', data),
  getMyTickets: () => api.get('/support/mine'),
  getTicketDetail: (ticketId) => api.get(`/support/${ticketId}`),
};

// Support Staff API
export const supportStaffAPI = {
  getAssignedTickets: () => api.get('/support-staff/tickets'),
  getTicketDetail: (ticketId) => api.get(`/support-staff/tickets/${ticketId}`),
  respondToTicket: (ticketId, message, status) =>
    api.post(`/support-staff/tickets/${ticketId}/respond`, { message, status }),
};

export default api;
