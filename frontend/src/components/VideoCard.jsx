import React, { useState } from 'react';
import SignalBadge from './SignalBadge.jsx';
import { reanalyzeVideo } from '../api.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function VideoCard({ video, onUpdated }) {
  const [imgError, setImgError] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  // Allow local override after reanalysis
  const [localData, setLocalData] = useState(null);
  const data = localData ? { ...video, ...localData } : video;

  const {
    id,
    title,
    channel_name,
    url,
    thumbnail_url,
    published_at,
    summary,
    tickers,
    trade_signals,
    analyzed_at,
  } = data;

  const tickerList = Array.isArray(tickers) ? tickers : [];
  const signalList = Array.isArray(trade_signals) ? trade_signals : [];

  const signalMap = {};
  for (const s of signalList) {
    if (s.ticker) signalMap[s.ticker] = s;
  }
  const mentionOnly = tickerList.filter((t) => !signalMap[t]);

  async function handleReanalyze() {
    setReanalyzing(true);
    try {
      const result = await reanalyzeVideo(id);
      setLocalData(result);
      onUpdated?.();
    } catch (err) {
      console.error('Reanalysis failed:', err);
    } finally {
      setReanalyzing(false);
    }
  }

  return (
    <div className="bg-zinc-800 rounded-xl border border-zinc-700 hover:border-zinc-500 transition-colors duration-150 overflow-hidden">
      <div className="flex">
        {/* ── Column 1: Thumbnail + title ── */}
        <div className="flex-1 flex flex-col border-r border-zinc-700">
          {thumbnail_url && !imgError ? (
            <img
              src={thumbnail_url}
              alt={title}
              onError={() => setImgError(true)}
              className="w-full object-cover"
              style={{ aspectRatio: '16/9' }}
            />
          ) : (
            <div className="w-full bg-zinc-700 flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
              <span className="text-zinc-500 text-3xl">▶</span>
            </div>
          )}
          <div className="p-3 flex flex-col gap-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-100 font-semibold text-sm leading-snug hover:text-blue-400 transition-colors line-clamp-2"
              title={title}
            >
              {title}
            </a>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {channel_name && <span className="font-medium text-zinc-300">{channel_name}</span>}
              {channel_name && published_at && <span className="text-zinc-600">·</span>}
              {published_at && <span>{formatDate(published_at)}</span>}
            </div>
          </div>
        </div>

        {/* ── Column 2: Summary ── */}
        <div className="flex-1 p-4 flex flex-col justify-between gap-2 border-r border-zinc-700">
          <div className="flex-1">
            {!analyzed_at || reanalyzing ? (
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                <span className="text-zinc-500 text-xs italic">
                  {reanalyzing ? 'Re-analyzing…' : 'Analyzing…'}
                </span>
              </div>
            ) : summary ? (
              <p className="text-zinc-300 text-xs leading-relaxed">{summary}</p>
            ) : (
              <span className="text-zinc-600 text-xs italic">No summary available</span>
            )}
          </div>

          {analyzed_at && !reanalyzing && (
            <button
              onClick={handleReanalyze}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors self-end"
              title="Re-analyze with transcript"
            >
              ↻ re-analyze
            </button>
          )}
        </div>

        {/* ── Column 3: Recommendations ── */}
        <div className="flex-1 p-4 flex flex-col gap-2">
          <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Recommendations</span>
          {!analyzed_at || reanalyzing ? (
            <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mt-1" />
          ) : signalList.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {signalList.map((s, i) => (
                <div key={`${s.ticker}-${i}`} className="flex flex-col gap-0.5">
                  <SignalBadge signal={s} />
                  {s.reasoning && (
                    <span className="text-zinc-400 text-xs leading-snug pl-0.5">{s.reasoning}</span>
                  )}
                </div>
              ))}
              {mentionOnly.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1.5 border-t border-zinc-700">
                  {mentionOnly.map((t) => (
                    <span key={t} className="bg-zinc-700 text-zinc-300 text-xs px-1.5 py-0.5 rounded font-mono border border-zinc-600">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : tickerList.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tickerList.map((t) => (
                <span key={t} className="bg-zinc-700 text-zinc-300 text-xs px-1.5 py-0.5 rounded font-mono border border-zinc-600">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-zinc-600 text-xs italic">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
