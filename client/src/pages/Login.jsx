import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { Store, Mail, Lock, LogIn, AlertCircle, ShieldCheck, UserPlus, RefreshCw } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const { login, isAuthenticated, isSetup, loading, store, connectionError, checkAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, redirect to intended page or dashboard
  if (!loading && isAuthenticated) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      await login({ email: email.trim().toLowerCase(), password });

      showToast({
        title: 'Welcome Back',
        message: 'Authenticated successfully.',
        type: 'success'
      });

      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err) {
      const serverMessage = err.response?.data?.message || err.friendlyMessage || err.message || 'Login failed';
      setError(serverMessage);
      showToast({
        title: 'Login Error',
        message: serverMessage,
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="max-w-md w-full space-y-6 animate-fade-in">
        
        {/* Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/20 mb-1">
            <Store className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Near<span className="text-emerald-600">Expiry</span>
          </h1>
          <p className="text-xs text-slate-500">
            {store?.storeName ? `${store.storeName} Staff Portal` : 'Single-Store Supermarket Staff Portal'}
          </p>
        </div>

        {/* Backend Connection Alert if server unreachable */}
        {connectionError && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>{connectionError}</span>
            </div>
            <button
              onClick={() => checkAuth()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-200/60 hover:bg-amber-200 text-amber-900 font-semibold text-[11px] transition"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* First-Time Setup Prompt Banner (Visible only when no owner exists) */}
        {!loading && isSetup === false && (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-100" />
              <h3 className="text-sm font-bold tracking-tight">First-Time Setup Detected</h3>
            </div>
            <p className="text-xs text-emerald-50 leading-relaxed">
              No store account has been created yet. Set up your supermarket instance and register the master Store Owner.
            </p>
            <div className="pt-1">
              <Link to="/register">
                <Button
                  variant="secondary"
                  className="w-full bg-white text-emerald-800 hover:bg-emerald-50 border-none font-bold text-xs py-2 shadow-sm"
                  icon={UserPlus}
                >
                  Create Your Store Account
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Login Card */}
        <Card className="shadow-glass">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Staff Sign In
            </CardTitle>
            <CardDescription>
              Sign in with your Store Owner or Employee credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                placeholder="staff@supermarket.local"
                icon={Mail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                autoFocus
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />

              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
                className="w-full py-2.5 text-sm"
                icon={LogIn}
              >
                Sign In to NearExpiry
              </Button>

              {/* Conditional link: Show Registration link only when setup is available */}
              {!loading && isSetup === false && (
                <div className="pt-3 text-center border-t border-slate-100">
                  <p className="text-xs text-slate-600">
                    First time here?{' '}
                    <Link
                      to="/register"
                      className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1"
                    >
                      Create your store account
                    </Link>
                  </p>
                </div>
              )}

              {/* When setup is completed, public registration is hidden */}
              {!loading && isSetup === true && (
                <div className="pt-3 text-center border-t border-slate-100">
                  <p className="text-[11px] text-slate-400">
                    Employee accounts are provisioned internally by the Store Owner.
                  </p>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Footer info badge */}
        <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Single-Store Architecture • HTTP-Only Cookie Authentication</span>
        </div>

      </div>
    </div>
  );
}
