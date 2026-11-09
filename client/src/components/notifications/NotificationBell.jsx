import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Bell, 
  CheckCheck, 
  AlertTriangle, 
  Clock, 
  AlertOctagon, 
  Package, 
  Layers, 
  Mail, 
  X, 
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

export default function NotificationBell() {
  const navigate = useNavigate();
  const {
    unreadCount,
    recentNotifications,
    isLoading,
    fetchRecentNotifications,
    markAsRead,
    markAllAsRead,
    removeNotification
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch recent notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchRecentNotifications();
    }
  }, [isOpen, fetchRecentNotifications]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Helper for notification icons and styling
  const getNotificationIcon = (type, severity) => {
    switch (type) {
      case 'EXPIRED':
        return <AlertOctagon className="w-4 h-4 text-rose-600" />;
      case 'EXPIRING_TODAY':
      case 'EXPIRY_CRITICAL':
      case 'EXPIRING_CRITICAL':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'EXPIRY_WARNING':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'LOW_STOCK':
        return <Package className="w-4 h-4 text-blue-500" />;
      case 'BATCH_DEPLETED':
        return <Layers className="w-4 h-4 text-slate-500" />;
      case 'DAILY_DIGEST':
        return <Mail className="w-4 h-4 text-emerald-600" />;
      default:
        return <Bell className="w-4 h-4 text-emerald-600" />;
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      await markAsRead(notif._id);
    }
    setIsOpen(false);

    // Smart navigation based on notification type
    if (notif.type.includes('EXPIRY') || notif.type === 'EXPIRED') {
      navigate('/expiry');
    } else if (notif.type === 'LOW_STOCK' || notif.type === 'BATCH_DEPLETED') {
      navigate('/inventory');
    } else {
      navigate('/notifications');
    }
  };

  // Formatted relative time
  const formatTimeAgo = (dateStr) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="View notifications"
        className="relative p-2 rounded-xl border border-slate-200/80 bg-white/90 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors shadow-sm focus:outline-none"
      >
        <Bell className="w-4 h-4" />
        
        {/* Unread badge badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white shadow-sm ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Flyout Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200/90 shadow-xl z-50 overflow-hidden animate-fade-in">
          
          {/* Header */}
          <div className="p-3.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400">
                <div className="inline-block w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs">Loading alerts...</p>
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <CheckCheck className="w-4 h-4" />
                </div>
                <p className="text-xs font-bold text-slate-800">All caught up!</p>
                <p className="text-[11px] text-slate-400 mt-0.5">No unread alerts at this time.</p>
              </div>
            ) : (
              recentNotifications.map((notif) => (
                <div
                  key={notif._id}
                  className={`p-3 transition-colors flex items-start gap-3 hover:bg-slate-50/80 relative group ${
                    !notif.isRead ? 'bg-emerald-50/20' : ''
                  }`}
                >
                  {/* Icon container */}
                  <div className="p-2 rounded-lg bg-slate-100 mt-0.5 flex-shrink-0">
                    {getNotificationIcon(notif.type, notif.severity)}
                  </div>

                  {/* Message content */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 truncate block">
                        {notif.title}
                      </span>
                      {!notif.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium mt-1 block">
                      {formatTimeAgo(notif.createdAt)}
                    </span>
                  </div>

                  {/* Dismiss Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(notif._id);
                    }}
                    title="Dismiss"
                    className="text-slate-300 hover:text-slate-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer Link to Notifications History */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center justify-center gap-1 transition-colors"
            >
              <span>View All Notification History</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}

