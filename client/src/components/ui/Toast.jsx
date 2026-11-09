import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const icons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

const styles = {
  success: 'bg-white border-emerald-200 text-slate-800 shadow-md shadow-emerald-500/10',
  warning: 'bg-white border-amber-200 text-slate-800 shadow-md shadow-amber-500/10',
  error: 'bg-white border-rose-200 text-slate-800 shadow-md shadow-rose-500/10',
  info: 'bg-white border-sky-200 text-slate-800 shadow-md shadow-sky-500/10',
};

const iconColors = {
  success: 'text-emerald-600',
  warning: 'text-amber-500',
  error: 'text-rose-500',
  info: 'text-sky-500',
};

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => {
        const Icon = icons[toast.type] || Info;
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border ${styles[toast.type] || styles.info} transition-all duration-300 animate-slide-up`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColors[toast.type] || iconColors.info}`} />
            <div className="flex-1 min-w-0">
              {toast.title && (
                <h4 className="text-xs font-bold text-slate-900 leading-tight mb-0.5">
                  {toast.title}
                </h4>
              )}
              <p className="text-xs text-slate-600 leading-relaxed">
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-1 -mr-1 -mt-1 rounded-lg transition-colors"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

