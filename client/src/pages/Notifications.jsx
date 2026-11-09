import React, { useState, useEffect } from 'react';
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
  Trash2, 
  RefreshCw, 
  Filter, 
  ExternalLink,
  Settings as SettingsIcon,
  Sparkles,
  Search,
  CheckCircle2
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import { useNotifications } from '../context/NotificationContext';
import { useToast } from '../context/ToastContext';
import { 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  deleteNotification as apiDeleteNotification,
  triggerManualNotificationCheck
} from '../services/api';

export default function Notifications() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { fetchUnreadCount } = useNotifications();

  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  // Filters & Pagination
  const [filterType, setFilterType] = useState('ALL');
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const params = {
        page,
        limit: 15,
        type: filterType !== 'ALL' ? filterType : undefined,
        severity: filterSeverity !== 'ALL' ? filterSeverity : undefined,
        isRead: filterUnreadOnly ? false : undefined
      };

      const res = await getNotifications(params);
      if (res?.success) {
        setNotifications(res.data || []);
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalCount(res.pagination?.total || 0);
        setUnreadCount(res.pagination?.unreadCount || 0);
      }
    } catch (err) {
      console.warn('Failed to load notifications:', err);
      showToast({ title: 'Error', message: 'Could not load notifications', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [page, filterType, filterSeverity, filterUnreadOnly]);

  const handleMarkAsRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      fetchUnreadCount();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      fetchUnreadCount();
      showToast({ title: 'Success', message: 'All notifications marked as read', type: 'success' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiDeleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
      fetchUnreadCount();
      showToast({ title: 'Dismissed', message: 'Notification removed', type: 'info' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerManualCheck = async () => {
    try {
      setIsChecking(true);
      const res = await triggerManualNotificationCheck();
      if (res?.success) {
        showToast({
          title: 'Check Complete',
          message: `Created ${res.data?.notificationsCreated || 0} new alert(s); ${res.data?.duplicatesSkipped || 0} duplicates skipped.`,
          type: 'success'
        });
        loadNotifications();
        fetchUnreadCount();
      }
    } catch (err) {
      showToast({ title: 'Error', message: 'Failed to run manual check', type: 'error' });
    } finally {
      setIsChecking(false);
    }
  };

  // Severity rendering helper
  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'danger':
        return <Badge variant="danger" dot>Expired Stock</Badge>;
      case 'critical':
        return <Badge variant="danger" dot>Critical Action</Badge>;
      case 'warning':
        return <Badge variant="warning">Warning</Badge>;
      default:
        return <Badge variant="neutral">Information</Badge>;
    }
  };

  // Notification Icon
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'EXPIRED':
        return <AlertOctagon className="w-5 h-5 text-rose-600" />;
      case 'EXPIRING_TODAY':
      case 'EXPIRY_CRITICAL':
      case 'EXPIRING_CRITICAL':
        return <AlertTriangle className="w-5 h-5 text-rose-500" />;
      case 'EXPIRY_WARNING':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'LOW_STOCK':
        return <Package className="w-5 h-5 text-blue-500" />;
      case 'BATCH_DEPLETED':
        return <Layers className="w-5 h-5 text-slate-500" />;
      case 'DAILY_DIGEST':
        return <Mail className="w-5 h-5 text-emerald-600" />;
      default:
        return <Bell className="w-5 h-5 text-emerald-600" />;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-emerald-600" />
            <span>Notification & Alert Center</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time notifications for expiring batches, critical rotation alerts, and low stock warnings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={CheckCheck}
              onClick={handleMarkAllAsRead}
            >
              Mark All Read ({unreadCount})
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={isChecking}
            onClick={handleTriggerManualCheck}
            title="Scan store batches now for pending alerts"
          >
            Check Expiry Now
          </Button>

          <Link to="/settings">
            <Button variant="ghost" size="sm" icon={SettingsIcon}>
              Preferences
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Ribbon */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All Alerts' },
              { id: 'EXPIRY_CRITICAL', label: 'Critical' },
              { id: 'EXPIRY_WARNING', label: 'Expiring Soon' },
              { id: 'EXPIRED', label: 'Expired' },
              { id: 'LOW_STOCK', label: 'Low Stock' },
              { id: 'DAILY_DIGEST', label: 'Daily Digests' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilterType(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterType === tab.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right Select Filters */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setFilterUnreadOnly(!filterUnreadOnly);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                filterUnreadOnly
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Unread Only
            </button>

            <Select
              value={filterSeverity}
              onChange={(e) => {
                setFilterSeverity(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All Severities' },
                { value: 'critical', label: 'Critical / Danger' },
                { value: 'warning', label: 'Warning' },
                { value: 'info', label: 'Information' }
              ]}
            />
          </div>

        </div>
      </Card>

      {/* Notifications Feed */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="inline-block w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-medium">Loading notifications feed...</p>
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No notifications found"
            description="All store shelves and batches are in good standing or no alerts match the active filter."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notif) => {
              const targetPage =
                notif.type.includes('EXPIRY') || notif.type === 'EXPIRED'
                  ? '/expiry'
                  : notif.type === 'LOW_STOCK' || notif.type === 'BATCH_DEPLETED'
                    ? '/inventory'
                    : null;

              return (
                <div
                  key={notif._id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition-colors ${
                    !notif.isRead ? 'bg-emerald-50/25' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Icon container */}
                    <div className="p-2.5 rounded-xl bg-slate-100 mt-0.5 flex-shrink-0">
                      {getNotificationIcon(notif.type)}
                    </div>

                    {/* Content */}
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {notif.title}
                        </span>
                        {!notif.isRead && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                            Unread
                          </span>
                        )}
                        {getSeverityBadge(notif.severity)}
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                        {notif.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
                        <span>
                          {new Date(notif.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {notif.relatedProduct?.name && (
                          <span>• Product: <strong className="text-slate-600">{notif.relatedProduct.name}</strong></span>
                        )}
                        {notif.relatedBatch?.batchNumber && (
                          <span>• Batch: <strong className="text-slate-600">#{notif.relatedBatch.batchNumber}</strong></span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!notif.isRead && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleMarkAsRead(notif._id)}
                      >
                        Mark Read
                      </Button>
                    )}

                    {targetPage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={ExternalLink}
                        onClick={() => {
                          if (!notif.isRead) handleMarkAsRead(notif._id);
                          navigate(targetPage);
                        }}
                      >
                        View
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleDelete(notif._id)}
                      title="Dismiss notification"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
            <span>
              Showing page {page} of {totalPages} ({totalCount} total alerts)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

    </div>
  );
}

