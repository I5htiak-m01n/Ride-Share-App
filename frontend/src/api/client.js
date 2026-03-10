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
};

// Drivers API
export const driversAPI = {
  getDocuments: () => api.get('/drivers/documents'),
  addDocument: (data) => api.post('/drivers/documents', data),
  deleteDocument: (docType) => api.delete(`/drivers/documents/${docType}`),
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

export default api;
