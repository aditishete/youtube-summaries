import React from 'react';

export default function Tooltip({ label, children, position = 'top' }) {
  const posClass = position === 'bottom'
    ? 'top-full mt-1.5 bottom-auto'
    : 'bottom-full mb-1.5 top-auto';
  return (
    <div className="relative group/tt inline-flex">
      {children}
      <div className={`pointer-events-none absolute ${posClass} left-1/2 -translate-x-1/2 px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 text-zinc-200 rounded whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50`}>
        {label}
      </div>
    </div>
  );
}
