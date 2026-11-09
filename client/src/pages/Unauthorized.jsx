import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button';

export default function Unauthorized() {
  return (
    <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200/80 p-10 text-center max-w-md mx-auto shadow-sm space-y-4 my-12 animate-fade-in">
      <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200/70">
        <ShieldAlert className="w-6 h-6" />
      </div>
      
      <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
        Owner Permission Required
      </h2>
      
      <p className="text-xs text-slate-500 leading-relaxed">
        You are signed in as an <strong>Employee</strong>. Access to Employee Management and master store configuration is restricted to the Store Owner.
      </p>

      <div className="pt-2">
        <Link to="/">
          <Button variant="primary" size="sm" icon={ArrowLeft}>
            Return to Store Overview
          </Button>
        </Link>
      </div>
    </div>
  );
}

