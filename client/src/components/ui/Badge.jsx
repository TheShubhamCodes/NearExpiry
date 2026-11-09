import React from 'react';

const variants = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  fresh: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  warning: 'bg-amber-50 text-amber-700 border-amber-200/70',
  'near-expiry': 'bg-amber-50 text-amber-700 border-amber-200/70',
  danger: 'bg-rose-50 text-rose-700 border-rose-200/70',
  expired: 'bg-rose-50 text-rose-700 border-rose-200/70',
  info: 'bg-sky-50 text-sky-700 border-sky-200/70',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200/70',
};

const dotColors = {
  success: 'bg-emerald-500',
  fresh: 'bg-emerald-500',
  warning: 'bg-amber-500',
  'near-expiry': 'bg-amber-500',
  danger: 'bg-rose-500',
  expired: 'bg-rose-500',
  info: 'bg-sky-500',
  neutral: 'bg-slate-400',
};

const sizes = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

export default function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  ...props
}) {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full border
        ${variants[variant] || variants.neutral}
        ${sizes[size] || sizes.md}
        ${className}
      `}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
            dotColors[variant] || dotColors.neutral
          }`}
        />
      )}
      {children}
    </span>
  );
}

