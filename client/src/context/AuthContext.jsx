import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  getMe, 
  getSetupStatus, 
  login as apiLogin, 
  logout as apiLogout, 
  setupInitialOwner as apiSetup 
} from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [isSetup, setIsSetup] = useState(null); // null = unknown, true/false once fetched
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);

  // Check setup status and existing session
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      setConnectionError(null);

      // 1. Check whether store is already initialized
      const setupRes = await getSetupStatus();
      const setupComplete = setupRes.data?.isSetup ?? false;
      setIsSetup(setupComplete);

      // 2. If setup is complete, verify if we have an active session
      if (setupComplete) {
        try {
          const meRes = await getMe();
          if (meRes.success && meRes.data?.user) {
            setUser(meRes.data.user);
            setStore(meRes.data.store);
          }
        } catch (authErr) {
          // Unauthenticated session (expected for guest / logged out)
          setUser(null);
          setStore(null);
        }
      }
    } catch (err) {
      console.error('[Auth] Failed to verify system status:', err);
      const friendly = err.friendlyMessage || err.message || 'Unable to connect to the NearExpiry backend server.';
      setConnectionError(friendly);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Initial owner setup handler
  const setup = async (setupData) => {
    const res = await apiSetup(setupData);
    if (res.success && res.data) {
      setUser(res.data.user);
      setStore(res.data.store);
      setIsSetup(true);
    }
    return res;
  };

  // Login handler
  const login = async (credentials) => {
    const res = await apiLogin(credentials);
    if (res.success && res.data) {
      setUser(res.data.user);
      setStore(res.data.store);
    }
    return res;
  };

  // Logout handler
  const logout = async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.warn('[Auth] Logout error:', err);
    } finally {
      setUser(null);
      setStore(null);
    }
  };

  // Refresh current user and store info
  const refreshUser = async () => {
    try {
      const meRes = await getMe();
      if (meRes.success && meRes.data?.user) {
        setUser(meRes.data.user);
        setStore(meRes.data.store);
      }
    } catch (err) {
      console.warn('[Auth] Session expired or refresh failed');
      setUser(null);
    }
  };

  const isOwner = user?.role === 'owner';
  const isEmployee = user?.role === 'employee';
  const isAuthenticated = Boolean(user && user.isActive);

  return (
    <AuthContext.Provider
      value={{
        user,
        store,
        isSetup,
        loading,
        isAuthenticated,
        isOwner,
        isEmployee,
        login,
        setup,
        register: setup,
        logout,
        refreshUser,
        checkAuth,
        connectionError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

