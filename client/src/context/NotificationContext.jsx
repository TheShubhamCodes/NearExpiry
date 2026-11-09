import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  getUnreadNotificationCount, 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  deleteNotification as apiDeleteNotification,
  updateNotificationPreferences
} from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [browserPermission, setBrowserPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getUnreadNotificationCount();
      if (res?.success) {
        setUnreadCount(res.data?.unreadCount || 0);
      }
    } catch (err) {
      // Ignore background poll errors
    }
  }, [user]);

  // Fetch recent notifications for dropdown
  const fetchRecentNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const res = await getNotifications({ limit: 10, page: 1 });
      if (res?.success) {
        setRecentNotifications(res.data || []);
        setUnreadCount(res.pagination?.unreadCount || 0);
      }
    } catch (err) {
      console.warn('Failed to load recent notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Mark single notification read
  const markAsRead = async (id) => {
    try {
      await markNotificationRead(id);
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setRecentNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  // Mark all notifications read
  const markAllAsRead = async () => {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setRecentNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  // Delete notification
  const removeNotification = async (id) => {
    try {
      await apiDeleteNotification(id);
      setRecentNotifications((prev) => prev.filter((n) => n._id !== id));
      fetchUnreadCount();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Request browser notification permission explicitly
  const requestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return { supported: false, permission: 'unsupported' };
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);

      if (permission === 'granted' && user) {
        await updateNotificationPreferences({ browserNotificationsEnabled: true }).catch(() => {});
        // Show test greeting notification
        new Notification('NearExpiry Alerts Enabled', {
          body: 'You will receive desktop alerts for critical product expirations and low inventory.',
          icon: '/favicon.svg'
        });
      }

      return { supported: true, permission };
    } catch (err) {
      console.error('Failed to request browser notification permission:', err);
      return { supported: true, permission: 'denied' };
    }
  };

  // Show desktop notification if granted
  const showDesktopNotification = (title, options = {}) => {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        return new Notification(title, {
          icon: '/favicon.svg',
          ...options
        });
      } catch (e) {
        console.warn('Failed to display desktop notification:', e);
      }
    }
    return null;
  };

  // Poll unread count periodically when user is signed in
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      setRecentNotifications([]);
      return;
    }

    fetchUnreadCount();
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 30000); // 30-second poll

    return () => clearInterval(interval);
  }, [user, fetchUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        recentNotifications,
        isLoading,
        browserPermission,
        fetchUnreadCount,
        fetchRecentNotifications,
        markAsRead,
        markAllAsRead,
        removeNotification,
        requestBrowserPermission,
        showDesktopNotification
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

