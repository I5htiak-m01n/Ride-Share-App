import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import RiderDashboard from './pages/RiderDashboard';
import DriverDashboard from './pages/DriverDashboard';
import ProfileSettings from './pages/ProfileSettings';
import DriverDocuments from './pages/DriverDocuments';
import RideHistory from './pages/RideHistory';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes - Rider */}
          <Route
            path="/rider/dashboard"
            element={
              <ProtectedRoute allowedRoles={['rider', 'mixed']}>
                <RiderDashboard />
              </ProtectedRoute>
            }
          />

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

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
