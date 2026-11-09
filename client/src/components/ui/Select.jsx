import React from 'react';
import { ChevronDown } from 'lucide-react';

export default function Select({
  label,
  error,
  helperText,
  options = [],
  className = '',
  id,
  children,
  disabled = false,
  ...props
}) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-slate-700">
          {label}
        </label>
      )}

      <div className="relative rounded-lg shadow-sm">
        <select
          id={selectId}
          disabled={disabled}
          className={`
            appearance-none block w-full rounded-lg border text-sm text-slate-900
            transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0
            pl-3.5 pr-9 py-2 cursor-pointer
            ${
              error
                ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                : 'border-slate-200/90 bg-white/90 hover:border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
            }
            ${disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}
            ${className}
          `}
          {...props}
        >
          {children
            ? children
            : options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
        </select>

        <div className="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>

      {error ? (
        <p className="text-xs text-rose-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}

