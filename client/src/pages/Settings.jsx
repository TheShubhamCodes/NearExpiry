import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Store, 
  ShieldAlert, 
  Save, 
  DollarSign, 
  Mail, 
  Phone, 
  MapPin, 
  Lock, 
  Globe, 
  Sliders, 
  Users, 
  CheckCircle2, 
  Bell, 
  Send, 
  Laptop, 
  AlertTriangle,
  Clock
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNotifications } from '../context/NotificationContext';
import { 
  getStore, 
  updateStore, 
  getNotificationPreferences, 
  updateNotificationPreferences,
  sendTestNotificationEmail 
} from '../services/api';
import { Link } from 'react-router-dom';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST +05:30)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT -05:00/-04:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST/CDT -06:00/-05:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT -08:00/-07:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST +00:00/+01:00)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST +01:00/+02:00)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST +04:00)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT +08:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST +09:00)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT +10:00/+11:00)' }
];

const DIGEST_TIME_OPTIONS = [
  { value: '06:00', label: '06:00 AM (Early Morning)' },
  { value: '07:00', label: '07:00 AM' },
  { value: '08:00', label: '08:00 AM (Store Opening - Recommended)' },
  { value: '09:00', label: '09:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '17:00', label: '05:00 PM (Evening Shift)' },
  { value: '20:00', label: '08:00 PM (Closing Summary)' }
];

export default function Settings() {
  const { user, store, isOwner, refreshUser } = useAuth();
  const { showToast } = useToast();
  const { browserPermission, requestBrowserPermission } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  // Store General & Expiry Form State
  const [formData, setFormData] = useState({
    storeName: '',
    contactEmail: '',
    contactPhone: '',
    currency: 'USD ($)',
    street: '',
    city: '',
    expiryWarningDays: '7',
    expiryCriticalDays: '3',
    lowStockThreshold: '5',
    timezone: 'Asia/Kolkata'
  });

  // Notification Preferences State
  const [notifSettings, setNotifSettings] = useState({
    inAppEnabled: true,
    emailEnabled: false,
    dailyDigestEnabled: true,
    dailyDigestTime: '08:00',
    notifyExpiryWarning: true,
    notifyExpiryCritical: true,
    notifyExpiringToday: true,
    notifyExpired: true,
    notifyLowStock: true,
    notifyBatchDepleted: true
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const [storeRes, prefRes] = await Promise.all([
          getStore().catch(() => null),
          getNotificationPreferences().catch(() => null)
        ]);

        if (storeRes?.success && storeRes.data) {
          const s = storeRes.data;
          setFormData({
            storeName: s.storeName || '',
            contactEmail: s.contactEmail || '',
            contactPhone: s.contactPhone || '',
            currency: s.currency || 'USD ($)',
            street: s.address?.street || '',
            city: s.address?.city || '',
            expiryWarningDays: String(s.expiryWarningDays !== undefined ? s.expiryWarningDays : 7),
            expiryCriticalDays: String(s.expiryCriticalDays !== undefined ? s.expiryCriticalDays : 3),
            lowStockThreshold: String(s.lowStockThreshold !== undefined ? s.lowStockThreshold : 5),
            timezone: s.timezone || 'Asia/Kolkata'
          });

          if (s.notificationSettings) {
            setNotifSettings((prev) => ({
              ...prev,
              ...s.notificationSettings
            }));
          }
        }

        if (prefRes?.success && prefRes.data?.userPreferences) {
          setNotifSettings((prev) => ({
            ...prev,
            ...prefRes.data.userPreferences
          }));
        }
      } catch (err) {
        console.warn('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [store]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isOwner) {
      showToast({
        title: 'Action Prohibited',
        message: 'Only the store owner can modify store settings.',
        type: 'warning'
      });
      return;
    }

    const warnDays = parseInt(formData.expiryWarningDays, 10);
    const critDays = parseInt(formData.expiryCriticalDays, 10);
    const lowStock = parseInt(formData.lowStockThreshold, 10);

    if (isNaN(warnDays) || warnDays < 0) {
      showToast({ title: 'Validation Error', message: 'Warning threshold must be a valid non-negative number.', type: 'error' });
      return;
    }
    if (isNaN(critDays) || critDays < 0) {
      showToast({ title: 'Validation Error', message: 'Critical threshold must be a valid non-negative number.', type: 'error' });
      return;
    }
    if (critDays > warnDays) {
      showToast({ title: 'Validation Error', message: 'Critical days cannot exceed Warning days.', type: 'error' });
      return;
    }

    try {
      setIsSaving(true);
      await Promise.all([
        updateStore({
          storeName: formData.storeName,
          contactEmail: formData.contactEmail,
          contactPhone: formData.contactPhone,
          currency: formData.currency,
          address: {
            street: formData.street,
            city: formData.city
          },
          expiryWarningDays: warnDays,
          expiryCriticalDays: critDays,
          lowStockThreshold: isNaN(lowStock) ? 5 : lowStock,
          timezone: formData.timezone,
          notificationSettings: notifSettings
        }),
        updateNotificationPreferences(notifSettings)
      ]);

      await refreshUser();

      showToast({
        title: 'Settings Saved',
        message: 'Store configuration and notification rules saved successfully.',
        type: 'success'
      });
    } catch (err) {
      showToast({
        title: 'Update Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    try {
      setIsSendingTestEmail(true);
      const res = await sendTestNotificationEmail();
      if (res?.success) {
        showToast({
          title: 'Test Email Sent',
          message: res.message || 'Check your inbox for the Resend alert email.',
          type: 'success'
        });
      } else {
        showToast({
          title: 'Email Delivery Notice',
          message: res?.message || 'Could not dispatch test email. Ensure RESEND_API_KEY is configured.',
          type: 'warning'
        });
      }
    } catch (err) {
      showToast({
        title: 'Test Email Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const handleEnableBrowserNotifications = async () => {
    const res = await requestBrowserPermission();
    if (res.permission === 'granted') {
      showToast({
        title: 'Desktop Notifications Enabled',
        message: 'You will receive immediate alerts for critical product expiry.',
        type: 'success'
      });
    } else if (res.permission === 'denied') {
      showToast({
        title: 'Permission Denied',
        message: 'Notifications were blocked by your browser settings. You can re-enable them in site permissions.',
        type: 'warning'
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <SettingsIcon className="w-6 h-6 text-emerald-600" />
            <span>Store Configuration & Alerts</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Store profile, location parameters, centralized expiration thresholds, and notification rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOwner ? (
            <Link to="/employees">
              <Button variant="secondary" size="sm" icon={Users}>
                Manage Staff
              </Button>
            </Link>
          ) : (
            <Badge variant="neutral" size="md">
              Employee: Read-Only
            </Badge>
          )}

          <Badge variant="fresh" size="md" dot>
            Single-Store
          </Badge>
        </div>
      </div>

      {!isOwner && (
        <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5 shadow-sm">
          <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>
            <strong>Read-Only Mode:</strong> You are signed in as an Employee. You can review store parameters and expiry thresholds, but only the Store Owner can modify store configuration.
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Store Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Store Identification & Location
                </CardTitle>
                <CardDescription>
                  Store identity, contact details, and default billing currency.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Supermarket Name"
                value={formData.storeName}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                disabled={!isOwner || isSaving}
                required
              />

              <Input
                label="Contact Email"
                type="email"
                icon={Mail}
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                disabled={!isOwner || isSaving}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Contact Phone"
                icon={Phone}
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                disabled={!isOwner || isSaving}
              />

              <Select
                label="Store Currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                disabled={!isOwner || isSaving}
                options={[
                  { value: 'USD ($)', label: 'USD - United States Dollar ($)' },
                  { value: 'INR (₹)', label: 'INR - Indian Rupee (₹)' },
                  { value: 'EUR (€)', label: 'EUR - Euro (€)' },
                  { value: 'GBP (£)', label: 'GBP - British Pound (£)' },
                  { value: 'CAD ($)', label: 'CAD - Canadian Dollar ($)' },
                  { value: 'AUD ($)', label: 'AUD - Australian Dollar ($)' },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Street Address"
                icon={MapPin}
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                disabled={!isOwner || isSaving}
              />
              <Input
                label="City / Region"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                disabled={!isOwner || isSaving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Centralized Expiry & Inventory Thresholds Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Centralized Expiry & Inventory Thresholds
                </CardTitle>
                <CardDescription>
                  Applied dynamically to classify batch shelf life, trigger FEFO dispatch, and flag low inventory.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Input
                  label="Warning Threshold (Days)"
                  type="number"
                  min="1"
                  max="90"
                  value={formData.expiryWarningDays}
                  onChange={(e) => setFormData({ ...formData, expiryWarningDays: e.target.value })}
                  disabled={!isOwner || isSaving}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Batches within this window are flagged as <span className="font-semibold text-amber-600">Expiring Soon</span> (Default: 7).
                </p>
              </div>

              <div>
                <Input
                  label="Critical Threshold (Days)"
                  type="number"
                  min="0"
                  max="30"
                  value={formData.expiryCriticalDays}
                  onChange={(e) => setFormData({ ...formData, expiryCriticalDays: e.target.value })}
                  disabled={!isOwner || isSaving}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Urgent window before expiry for high-priority <span className="font-semibold text-rose-600">Critical</span> alerts (Default: 3).
                </p>
              </div>

              <div>
                <Input
                  label="Low Stock Threshold (Units)"
                  type="number"
                  min="0"
                  max="1000"
                  value={formData.lowStockThreshold}
                  onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                  disabled={!isOwner || isSaving}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Products with total available stock at or below this count trigger reorder warnings (Default: 5).
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Select
                label="Store Timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                disabled={!isOwner || isSaving}
                options={TIMEZONE_OPTIONS}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Ensures batches expire at local midnight without UTC mismatch or daylight-savings anomalies.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Phase 7: Notification Channels & Delivery Rules Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Proactive Alert & Notification Channels
                  </CardTitle>
                  <CardDescription>
                    Configure in-app alerts, Resend email notifications, and daily morning digests.
                  </CardDescription>
                </div>
              </div>

              {isOwner && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Send}
                  loading={isSendingTestEmail}
                  onClick={handleSendTestEmail}
                >
                  Send Test Email
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            
            {/* Delivery Master Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={notifSettings.inAppEnabled}
                  onChange={(e) => setNotifSettings({ ...notifSettings, inAppEnabled: e.target.checked })}
                  disabled={!isOwner}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>In-App Notification Bell</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={notifSettings.emailEnabled}
                  onChange={(e) => setNotifSettings({ ...notifSettings, emailEnabled: e.target.checked })}
                  disabled={!isOwner}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Email Alerts (Resend)</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={notifSettings.dailyDigestEnabled}
                  onChange={(e) => setNotifSettings({ ...notifSettings, dailyDigestEnabled: e.target.checked })}
                  disabled={!isOwner}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Daily Email Digest</span>
              </label>
            </div>

            {/* Daily Digest Schedule Time */}
            {notifSettings.dailyDigestEnabled && (
              <div className="w-full sm:w-72">
                <Select
                  label="Daily Digest Delivery Time"
                  value={notifSettings.dailyDigestTime}
                  onChange={(e) => setNotifSettings({ ...notifSettings, dailyDigestTime: e.target.value })}
                  disabled={!isOwner}
                  options={DIGEST_TIME_OPTIONS}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Dispatched in the store's configured timezone ({formData.timezone}).
                </p>
              </div>
            )}

            {/* Event Category Toggles */}
            <div>
              <span className="text-xs font-bold text-slate-900 block mb-2 uppercase tracking-wider">
                Event Notification Triggers
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                
                <label className="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.notifyExpiryCritical}
                    onChange={(e) => setNotifSettings({ ...notifSettings, notifyExpiryCritical: e.target.checked })}
                    disabled={!isOwner}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Critical Expiry Alerts (≤ 3 Days)</span>
                    <span className="text-[11px] text-slate-400">Urgent notifications when stock enters critical shelf-life window.</span>
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.notifyExpiringToday}
                    onChange={(e) => setNotifSettings({ ...notifSettings, notifyExpiringToday: e.target.checked })}
                    disabled={!isOwner}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Expiring Today Alerts</span>
                    <span className="text-[11px] text-slate-400">Final day warnings to enforce FEFO rotation or promotional discount.</span>
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.notifyExpired}
                    onChange={(e) => setNotifSettings({ ...notifSettings, notifyExpired: e.target.checked })}
                    disabled={!isOwner}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Expired Stock Quarantine Alerts</span>
                    <span className="text-[11px] text-slate-400">Immediate alerts to remove expired items from sales floor.</span>
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.notifyExpiryWarning}
                    onChange={(e) => setNotifSettings({ ...notifSettings, notifyExpiryWarning: e.target.checked })}
                    disabled={!isOwner}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Expiry Warning (≤ 7 Days)</span>
                    <span className="text-[11px] text-slate-400">Upcoming expiration alerts to plan inventory replenishment.</span>
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.notifyLowStock}
                    onChange={(e) => setNotifSettings({ ...notifSettings, notifyLowStock: e.target.checked })}
                    disabled={!isOwner}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Low Stock Level Warnings</span>
                    <span className="text-[11px] text-slate-400">Notifies when SKU available count falls to or below threshold.</span>
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.notifyBatchDepleted}
                    onChange={(e) => setNotifSettings({ ...notifSettings, notifyBatchDepleted: e.target.checked })}
                    disabled={!isOwner}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Batch Depletion Notices</span>
                    <span className="text-[11px] text-slate-400">Notifies once when an inventory lot reaches 0 units.</span>
                  </div>
                </label>

              </div>
            </div>

            {/* Desktop / Browser Notifications Section */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Laptop className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">Browser Desktop Notifications</span>
                    <Badge variant={browserPermission === 'granted' ? 'fresh' : 'neutral'} size="sm">
                      {browserPermission === 'granted' ? 'Enabled' : browserPermission === 'denied' ? 'Blocked' : 'Optional'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Receive immediate desktop popups when new urgent expiry alerts occur while the app is running.
                  </p>
                </div>
              </div>

              {browserPermission !== 'granted' && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleEnableBrowserNotifications}
                >
                  Enable Desktop Alerts
                </Button>
              )}
            </div>

          </CardContent>
        </Card>

        {/* Save button (Owner only) */}
        {isOwner && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              loading={isSaving}
              icon={Save}
            >
              Save Store Changes
            </Button>
          </div>
        )}

      </form>

    </div>
  );
}
