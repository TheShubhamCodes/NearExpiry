import React from 'react';

export default function Input({
  label,
  error,
  helperText,
  icon: Icon,
  trailingIcon: TrailingIcon,
  onTrailingClick,
  className = '',
  id,
  type = 'text',
  disabled = false,
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
          {label}
        </label>
      )}

      <div className="relative rounded-lg shadow-sm">
        {Icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
            <Icon className="w-4 h-4" />
          </div>
        )}

        <input
          id={inputId}
          type={type}
          disabled={disabled}
          className={`
            block w-full rounded-lg border text-sm text-slate-900 placeholder-slate-400
            transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0
            ${Icon ? 'pl-9' : 'pl-3.5'}
            ${TrailingIcon ? 'pr-9' : 'pr-3.5'}
            py-2
            ${
              error
                ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                : 'border-slate-200/90 bg-white/90 hover:border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
            }
            ${disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}
            ${className}
          `}
          {...props}
        />

        {TrailingIcon && (
          <div
            onClick={onTrailingClick}
            className={`absolute inset-y-0 right-0 pr-3 flex items-center ${
              onTrailingClick ? 'cursor-pointer text-slate-400 hover:text-slate-600' : 'pointer-events-none text-slate-400'
            }`}
          >
            <TrailingIcon className="w-4 h-4" />
          </div>
        )}
      </div>

      {error ? (
        <p className="text-xs text-rose-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}

