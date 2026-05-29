import React from 'react';

const SIGNAL_STYLES = {
  BUY: 'bg-emerald-900 text-emerald-300 border border-emerald-700',
  SELL: 'bg-red-900 text-red-300 border border-red-700',
  WATCH: 'bg-amber-900 text-amber-300 border border-amber-700',
  HOLD: 'bg-blue-900 text-blue-300 border border-blue-700',
};

export default function SignalBadge({ signal }) {
  const { ticker, signal: type, reasoning } = signal;
  const styleClass =
    SIGNAL_STYLES[type?.toUpperCase()] || 'bg-zinc-700 text-zinc-300 border border-zinc-600';

  return (
    <span
      title={reasoning || ''}
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded cursor-default ${styleClass}`}
    >
      {ticker} · {type}
    </span>
  );
}
