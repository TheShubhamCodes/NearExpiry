import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Store, 
  Package, 
  Layers, 
  CalendarClock, 
  BarChart3, 
  Settings, 
  Users,
  Zap,
  Sparkles,
  Menu, 
  X, 
  ChevronDown, 
  LogOut, 
  ShieldCheck, 
  Shield, 
  User,
  Bell
} from 'lucide-react';
import Dropdown, { DropdownItem, DropdownDivider } from './ui/Dropdown';
import Badge from './ui/Badge';
import NotificationBell from './notifications/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function TopNav({ backendStatus }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, store, isOwner, logout } = useAuth();
  const { showToast } = useToast();

  const navLinks = [
    { label: 'Overview', path: '/', icon: Store },
    { label: 'Products', path: '/products', icon: Package },
    { label: 'Inventory', path: '/inventory', icon: Layers },
    { label: 'Expiry', path: '/expiry', icon: CalendarClock },
    { label: 'Actions', path: '/actions', icon: Zap },
    { label: 'AI Insights', path: '/ai-insights', icon: Sparkles },
    { label: 'Reports', path: '/reports', icon: BarChart3 },
    ...(isOwner ? [{ label: 'Employees', path: '/employees', icon: Users }] : []),
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      showToast({
        title: 'Logged Out',
        message: 'Your session has been terminated safely.',
        type: 'info'
      });
      navigate('/login', { replace: true });
    } catch (err) {
      console.error(err);
    }
  };

  const userInitials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'NE';

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-sm transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Left: Branding */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-2.5 group select-none">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-emerald-600/20 group-hover:scale-105 transition-transform duration-200">
                <Store className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-extrabold tracking-tight text-slate-900 leading-none">
                  Near<span className="text-emerald-600">Expiry</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5 truncate max-w-[140px] sm:max-w-none">
                  {store?.storeName || 'Single-Store Edition'}
                </span>
              </div>
            </Link>
          </div>

          {/* Center: Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`
                    relative flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold
                    transition-all duration-150 select-none
                    ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-500/10'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-600 rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: Live Connection Badge & Profile Area */}
          <div className="hidden sm:flex items-center space-x-3">
            
            {/* Live Connection Badge */}
            <div
              className={`
                flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${
                  backendStatus?.connected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                    : backendStatus?.loading
                    ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                    : 'bg-rose-50 text-rose-800 border-rose-200/80'
                }
              `}
              title={
                backendStatus?.connected
                  ? `Backend active • DB: ${backendStatus.dbState}`
                  : 'Backend offline'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  backendStatus?.connected
                    ? 'bg-emerald-500 animate-pulse'
                    : backendStatus?.loading
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span className="text-[11px] font-semibold">
                {backendStatus?.loading
                  ? 'Connecting...'
                  : backendStatus?.connected
                  ? 'Live API'
                  : 'API Offline'}
              </span>
            </div>

            {/* Notification Bell */}
            {user && <NotificationBell />}

            {/* Profile Dropdown */}
            {user && (
              <Dropdown
                trigger={
                  <button
                    type="button"
                    className="flex items-center space-x-2.5 p-1.5 pl-2.5 rounded-xl border border-slate-200/80 bg-white/90 hover:bg-slate-50 transition-colors shadow-sm focus:outline-none"
                  >
                    <div className="flex flex-col text-right">
                      <span className="text-xs font-bold text-slate-800 leading-none">
                        {user.fullName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium mt-0.5 capitalize">
                        {user.role}
                      </span>
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                      {userInitials}
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                }
              >
                <div className="px-4 py-2 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 truncate max-w-[140px]">
                      {user.fullName}
                    </p>
                    <Badge variant={isOwner ? 'fresh' : 'neutral'} size="sm">
                      {user.role}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{user.email}</p>
                </div>

                <DropdownItem
                  icon={Bell}
                  onClick={() => navigate('/notifications')}
                >
                  Alerts & Notifications
                </DropdownItem>

                {isOwner && (
                  <DropdownItem
                    icon={Users}
                    onClick={() => navigate('/employees')}
                  >
                    Manage Employees
                  </DropdownItem>
                )}

                <DropdownItem
                  icon={Settings}
                  onClick={() => navigate('/settings')}
                >
                  Store Settings
                </DropdownItem>

                <DropdownDivider />

                <DropdownItem
                  icon={LogOut}
                  danger
                  onClick={handleLogout}
                >
                  Sign Out
                </DropdownItem>
              </Dropdown>
            )}
          </div>

          {/* Mobile menu toggle & Bell */}
          <div className="flex lg:hidden items-center space-x-2">
            {user && <NotificationBell />}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5 text-slate-700" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200/80 bg-white/95 backdrop-blur-md px-4 pt-3 pb-5 space-y-1.5 animate-slide-down">
          {user && (
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 px-2">
              <div>
                <p className="text-xs font-bold text-slate-900">{user.fullName}</p>
                <p className="text-[11px] text-slate-500">{user.email}</p>
              </div>
              <Badge variant={isOwner ? 'fresh' : 'neutral'} size="sm">
                {user.role}
              </Badge>
            </div>
          )}

          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`
                  flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors
                  ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }
                `}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {user && (
            <Link
              to="/notifications"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <Bell className="w-4 h-4 text-emerald-600" />
              <span>Notifications & Alerts</span>
            </Link>
          )}

          {user && (
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
