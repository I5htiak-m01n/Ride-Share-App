import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if user is logged in on mount and validate token server-side
    const token = sessionStorage.getItem('access_token');
    const savedUser = sessionStorage.getItem('user');

    if (token && savedUser) {
      // Validate token by hitting a protected endpoint
      authAPI.getProfile()
        .then((response) => {
          // Use fresh server data instead of stale sessionStorage
          const freshUser = response.data;
          sessionStorage.setItem('user', JSON.stringify(freshUser));
          setUser(freshUser);
          setLoading(false);
        })
        .catch(() => {
          // Token is invalid/expired and refresh failed (interceptor handles refresh)
          sessionStorage.removeItem('access_token');
          sessionStorage.removeItem('refresh_token');
          sessionStorage.removeItem('user');
          setUser(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    try {
      setError(null);
      const response = await authAPI.login({ email, password });
      const { user, access_token, refresh_token } = response.data;

      sessionStorage.setItem('access_token', access_token);
      if (refresh_token) sessionStorage.setItem('refresh_token', refresh_token);
      sessionStorage.setItem('user', JSON.stringify(user));
      setUser(user);

      return { success: true, user };
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const register = async (userData) => {
    try {
      setError(null);
      const response = await authAPI.register(userData);
      const { user, access_token, refresh_token, session } = response.data;

      const token = access_token || session?.access_token;
      const rToken = refresh_token || session?.refresh_token;

      if (!token) {
        throw new Error('Registration succeeded but no session was created. Please log in manually.');
      }

      sessionStorage.setItem('access_token', token);
      if (rToken) sessionStorage.setItem('refresh_token', rToken);
      sessionStorage.setItem('user', JSON.stringify(user));
      setUser(user);

      return { success: true, user };
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('refresh_token');
      sessionStorage.removeItem('user');
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
