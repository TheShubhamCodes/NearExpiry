import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, Loader2 } from 'lucide-react';

export default function ProtectedRoute({ requireOwner = false }) {
  const { user, loading, isSetup, isAuthenticated, isOwner } = useAuth();
  const location = useLocation();

  // 1. Loading State
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800">
        <div className="flex flex-col items-center space-y-4 p-8 rounded-2xl bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-glass animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <Store className="w-6 h-6" />
          </div>
          <div className="flex items-center space-x-2 text-sm font-semibold text-slate-700">
            <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
            <span>Verifying NearExpiry Store Session...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Initial Setup check: If store is not set up, redirect to /setup
  if (isSetup === false) {
    return <Navigate to="/setup" replace />;
  }

  // 3. Authentication check: If not logged in, redirect to /login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 4. Owner authorization check: If route requires owner and user is employee
  if (requireOwner && !isOwner) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

