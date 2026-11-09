import React from 'react';
import Button from './Button';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  compact = false,
  className = '',
}) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center
        ${compact ? 'py-6 px-4' : 'py-12 px-6'}
        rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50
        ${className}
      `}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-400 mb-3.5">
          <Icon className="w-6 h-6 text-slate-500" />
        </div>
      )}

      <h4 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
        {title}
      </h4>

      {description && (
        <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <Button
          size="sm"
          variant="secondary"
          icon={actionIcon}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

