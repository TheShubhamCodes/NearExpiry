import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Home } from 'lucide-react';
import Button from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-sm space-y-4 my-12 animate-fade-in">
      <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Page Not Found</h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        The section you are trying to access does not exist in NearExpiry. Please navigate back to the store dashboard.
      </p>
      <div className="pt-2">
        <Link to="/">
          <Button variant="primary" size="sm" icon={Home}>
            Return to Store Overview
          </Button>
        </Link>
      </div>
    </div>
  );
}
