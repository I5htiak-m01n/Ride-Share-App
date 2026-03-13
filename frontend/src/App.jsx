import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RouteProvider } from './context/RouteContext';
import { RideProviderLayout } from './context/RideContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import RiderDashboard from './pages/RiderDashboard';
import RideBookingPage from './pages/RideBookingPage';
import RideConfirmPage from './pages/RideConfirmPage';
import RideSearchingPage from './pages/RideSearchingPage';
import DriverDashboard from './pages/DriverDashboard';
import ProfileSettings from './pages/ProfileSettings';
import DriverDocuments from './pages/DriverDocuments';
import RideHistory from './pages/RideHistory';
import Wallet from './pages/Wallet';
import AdminDashboard from './pages/AdminDashboard';
import AdminPromos from './pages/AdminPromos';
import AdminAnalytics from './pages/AdminAnalytics';
import RiderPromos from './pages/RiderPromos';
import Complaints from './pages/Complaints';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RouteProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Rider routes — wrapped in RideProvider layout */}
          <Route element={
            <ProtectedRoute allowedRoles={['rider', 'mixed']}>
              <RideProviderLayout />
            </ProtectedRoute>
          }>
            <Route path="/rider/dashboard" element={<RiderDashboard />} />
            <Route path="/rider/book" element={<RideBookingPage />} />
            <Route path="/rider/confirm" element={<RideConfirmPage />} />
            <Route path="/rider/searching" element={<RideSearchingPage />} />
          </Route>

          {/* Protected routes - Driver */}
          <Route
            path="/driver/dashboard"
            element={
              <ProtectedRoute allowedRoles={['driver', 'mixed']}>
                <DriverDashboard />
              </ProtectedRoute>
            }
          />

          {/* Profile Settings - accessible by all authenticated roles */}
          <Route
            path="/rider/profile"
            element={
              <ProtectedRoute allowedRoles={['rider', 'driver', 'mixed']}>
                <ProfileSettings />
              </ProtectedRoute>
            }
          />

          {/* Driver Documents */}
          <Route
            path="/driver/documents"
            element={
              <ProtectedRoute allowedRoles={['driver', 'mixed']}>
                <DriverDocuments />
              </ProtectedRoute>
            }
          />

          {/* Ride History */}
          <Route
            path="/rider/history"
            element={
              <ProtectedRoute allowedRoles={['rider', 'mixed']}>
                <RideHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/history"
            element={
              <ProtectedRoute allowedRoles={['driver', 'mixed']}>
                <RideHistory />
              </ProtectedRoute>
            }
          />

          {/* Wallet - accessible by all authenticated roles */}
          <Route
            path="/wallet"
            element={
              <ProtectedRoute allowedRoles={['rider', 'driver', 'mixed']}>
                <Wallet />
              </ProtectedRoute>
            }
          />

          {/* Complaints - accessible by riders and drivers */}
          <Route
            path="/complaints"
            element={
              <ProtectedRoute allowedRoles={['rider', 'driver', 'mixed']}>
                <Complaints />
              </ProtectedRoute>
            }
          />

          {/* Admin Dashboard */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Admin Promos Management */}
          <Route
            path="/admin/promos"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPromos />
              </ProtectedRoute>
            }
          />

          {/* Admin Analytics */}
          <Route
            path="/admin/analytics"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminAnalytics />
              </ProtectedRoute>
            }
          />

          {/* Rider Promos */}
          <Route
            path="/rider/promos"
            element={
              <ProtectedRoute allowedRoles={['rider', 'mixed']}>
                <RiderPromos />
              </ProtectedRoute>
            }
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </RouteProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
