import React from 'react';
import { Settings } from 'lucide-react';

export default function SettingsPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-2xl mx-auto space-y-3">
      <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center mx-auto">
        <Settings className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-slate-800">Store Settings</h2>
      <p className="text-xs text-slate-500">
        Single-store configuration and expiry notification thresholds will be configured in subsequent phases.
      </p>
    </div>
  );
}

