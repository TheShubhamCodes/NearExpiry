import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { 
  Store, 
  ShieldCheck, 
  Mail, 
  Lock, 
  User, 
  Phone, 
  MapPin, 
  ArrowRight,
  AlertCircle,
  LogIn,
  RefreshCw,
  Building2
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Register() {
  const { isSetup, loading, setup, isAuthenticated, connectionError, checkAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    storeName: '',
    currency: 'USD ($)',
    contactPhone: '',
    street: '',
    city: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);

  // If already authenticated, redirect to dashboard
  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // If initial setup is already completed, registration is closed
  if (!loading && isSetup === true) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-50">
        <div className="max-w-md w-full space-y-6 animate-fade-in text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/20 mb-1">
            <Store className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Near<span className="text-emerald-600">Expiry</span>
          </h1>

          <Card className="shadow-glass text-left">
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Store Account Already Initialized
              </CardTitle>
              <CardDescription>
                Public registration is permanently closed for this instance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                This supermarket operates on a secure single-store architecture. The primary Store Owner account has already been created.
              </p>
              <div className="p-3 rounded-xl bg-slate-100/80 text-[11px] text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">• Existing Store Owner:</p>
                <p>Sign in using your owner email and password.</p>
                <p className="font-semibold text-slate-800 pt-1">• Supermarket Staff / Employees:</p>
                <p>Contact your Store Owner to create your employee credentials in the staff management portal.</p>
              </div>

              <Link to="/login" className="block w-full">
                <Button variant="primary" className="w-full py-2.5 text-sm" icon={LogIn}>
                  Go to Staff Sign In
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const validate = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Owner full name is required';
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Full name must be at least 2 characters';
    }

    if (!formData.storeName.trim()) {
      newErrors.storeName = 'Store name is required';
    } else if (formData.storeName.trim().length < 2) {
      newErrors.storeName = 'Store name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Owner email is required';
    } else if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setIsSubmitting(true);
      setErrors({});

      await setup({
        fullName: formData.fullName.trim(),
        storeName: formData.storeName.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        currency: formData.currency,
        contactPhone: formData.contactPhone.trim(),
        address: {
          street: formData.street.trim(),
          city: formData.city.trim()
        }
      });

      showToast({
        title: 'Store Created Successfully',
        message: 'Owner account registered. Welcome to NearExpiry!',
        type: 'success'
      });

      navigate('/', { replace: true });
    } catch (err) {
      const serverMessage = err.response?.data?.message || err.friendlyMessage || err.message || 'Registration failed';
      showToast({
        title: 'Registration Error',
        message: serverMessage,
        type: 'error'
      });
      setErrors({ form: serverMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="max-w-xl w-full space-y-6 animate-fade-in">
        
        {/* Branding Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/20 mb-1">
            <Store className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Near<span className="text-emerald-600">Expiry</span>
          </h1>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create your supermarket store account and set up the master owner credentials.
          </p>
        </div>

        {/* Backend Connection Error Alert */}
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

        {/* Security Notice */}
        <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-emerald-900 text-xs flex items-start gap-3 shadow-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Single-Store Architecture:</strong> This setup creates the sole Store Owner. Once created, public registration is closed and staff are added internally.
          </p>
        </div>

        {/* Registration Card */}
        <Card className="shadow-glass">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Create Your Store Account
            </CardTitle>
            <CardDescription>
              Enter your store and master owner details below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errors.form && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="leading-snug">{errors.form}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Owner Name */}
              <Input
                label="Owner Full Name"
                placeholder="e.g. John Doe"
                icon={User}
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                error={errors.fullName}
                disabled={isSubmitting}
                autoFocus
              />

              {/* Store Name */}
              <Input
                label="Store / Supermarket Name"
                placeholder="e.g. Sunshine Supermarket"
                icon={Building2}
                value={formData.storeName}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                error={errors.storeName}
                disabled={isSubmitting}
              />

              {/* Email */}
              <Input
                label="Owner Email Address"
                type="email"
                placeholder="owner@supermarket.com"
                icon={Mail}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={errors.email}
                disabled={isSubmitting}
              />

              {/* Password Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  icon={Lock}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  error={errors.password}
                  disabled={isSubmitting}
                  helperText="Minimum 6 characters"
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="••••••••"
                  icon={Lock}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  error={errors.confirmPassword}
                  disabled={isSubmitting}
                />
              </div>

              {/* Currency */}
              <Select
                label="Store Currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                options={[
                  { value: 'USD ($)', label: 'USD - US Dollar ($)' },
                  { value: 'INR (₹)', label: 'INR - Indian Rupee (₹)' },
                  { value: 'EUR (€)', label: 'EUR - Euro (€)' },
                  { value: 'GBP (£)', label: 'GBP - British Pound (£)' },
                  { value: 'CAD ($)', label: 'CAD - Canadian Dollar ($)' },
                  { value: 'AUD ($)', label: 'AUD - Australian Dollar ($)' },
                ]}
                disabled={isSubmitting}
              />

              {/* Optional Store Details Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowOptionalDetails(!showOptionalDetails)}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition"
                >
                  {showOptionalDetails ? '− Hide optional contact details' : '+ Add optional contact and address details'}
                </button>

                {showOptionalDetails && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-3">
                    <Input
                      label="Contact Phone"
                      placeholder="+1 (555) 019-2834"
                      icon={Phone}
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      disabled={isSubmitting}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="Store Street Address"
                        placeholder="123 Market St"
                        icon={MapPin}
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        disabled={isSubmitting}
                      />
                      <Input
                        label="City"
                        placeholder="Springfield"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  className="w-full py-2.5 text-sm"
                  icon={ArrowRight}
                >
                  Create Store Account
                </Button>
              </div>

              {/* Back to Login Link */}
              <div className="text-center pt-2">
                <p className="text-xs text-slate-500">
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                  >
                    Back to Staff Sign In
                  </Link>
                </p>
              </div>

            </form>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

