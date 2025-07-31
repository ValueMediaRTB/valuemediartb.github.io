import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import {clearAllTableCaches} from '../api';
import {App} from '../App';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children,resetAllCallback }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem('authToken'));
  const isCheckingAuth = useRef(false);
  const hasCheckedAuth = useRef(false);

  /*useEffect(() => {
    if (typeof setResetAllCallback === 'function') {
      setResetAllCallback((fn) => {
        resetAllRef.current = fn;
      });
    }
  }, []);*/

  // Define logout function BEFORE using it
  const logout = useCallback(async () => {
    console.log('Logout called'); // Debug log
    
    try {
      // Only call logout endpoint if we have a token
      if (token) {
        await fetch('http://localhost:3000/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setToken(null);
      setUser(null);
      localStorage.removeItem('authToken');
      hasCheckedAuth.current = false; // Reset auth check flag
      clearAllTableCaches();
      if(resetAllCallback?.current)
        resetAllCallback.current();
    }
  }, [token]);

  // Check if user is logged in on mount - ONLY ONCE
  useEffect(() => {
    const checkAuth = async () => {
      // Prevent multiple simultaneous checks
      if (!token || isCheckingAuth.current || hasCheckedAuth.current) {
        setLoading(false);
        return;
      }

      isCheckingAuth.current = true;
      hasCheckedAuth.current = true;
      
      console.log('Checking auth with token:', token ? 'exists' : 'null'); // Debug log
      
      try {
        const response = await fetch('http://localhost:3000/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        console.log('Auth check response:', response.status); // Debug log
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          console.log('Auth check successful, user:', data.user); // Debug log
        } else if (response.status === 401 || response.status === 403) {
          console.log('Token invalid, logging out'); // Debug log
          logout();
        } else {
          console.log('Auth check failed with status:', response.status); // Debug log
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Don't logout on network errors
      } finally {
        setLoading(false);
        isCheckingAuth.current = false;
      }
    };

    // Only check auth on initial mount if we have a token
    if (token && !hasCheckedAuth.current) {
      checkAuth();
    } else {
      setLoading(false);
    }
  }, []); // Remove token and logout from dependencies to prevent loops

  // Separate effect to handle token changes (like after login)
  useEffect(() => {
    if (token && hasCheckedAuth.current) {
      // Token changed after initial check (probably from login)
      hasCheckedAuth.current = false; // Allow auth check again
    }
  }, [token]);

  const login = async (username, password) => {
    console.log('Login attempt for:', username); // Debug log
    
    try {
      const response = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      console.log('Login response:', response.status, data); // Debug log

      if (response.ok && data.token) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('authToken', data.token);
        hasCheckedAuth.current = true; // Mark as checked since we just logged in
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error' };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const response = await fetch('http://localhost:3000/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        localStorage.setItem('authToken', data.token);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Network error' };
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    changePassword,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};