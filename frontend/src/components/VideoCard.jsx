import React, { useState } from 'react';
import SignalBadge from './SignalBadge.jsx';
import { reanalyzeVideo } from '../api.js';
import { SpeakButton } from './SpeakButton.jsx';

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

function buildVideoSpeakText(data) {
  return data.summary || '';
}

function buildVideoRecsText(data) {
  const signals = Array.isArray(data.trade_signals) ? data.trade_signals : [];
  const tickerList = Array.isArray(data.tickers) ? data.tickers : [];
  if (signals.length === 0 && tickerList.length === 0) return '';
  const signalMap = Object.fromEntries(signals.map((s) => [s.ticker, s]));
  const mentionOnly = tickerList.filter((t) => !signalMap[t]);
  const parts = [
    ...signals.map((s) => `${s.ticker}: ${s.signal}${s.reasoning ? '. ' + s.reasoning : ''}`),
    ...(mentionOnly.length ? ['Also mentioned: ' + mentionOnly.join(', ')] : []),
  ];
  return parts.join('. ');
}

export default function VideoCard({ video, onUpdated, onDelete, speakingId, onSpeak, isAdmin }) {
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
      {/* Mobile: stacked layout. Desktop: 3-column row */}
      <div className="flex flex-col md:flex-row">
        {/* ── Column 1: Thumbnail + title ── */}
        <div className="md:flex-[1] flex md:flex-col md:border-r border-zinc-700">
          {/* Mobile: thumbnail left, title right. Desktop: thumbnail full-width on top */}
          <div className="flex md:flex-col flex-1">
            <div className="flex-shrink-0 w-32 md:w-full">
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
                  <span className="text-zinc-500 text-2xl">▶</span>
                </div>
              )}
            </div>
            <div className="p-3 flex flex-col gap-1 flex-1 min-w-0">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-100 font-semibold text-lg leading-snug hover:text-blue-400 transition-colors line-clamp-3"
                title={title}
              >
                {title}
              </a>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
                {channel_name && <span className="font-medium text-zinc-300">{channel_name}</span>}
                {channel_name && published_at && <span className="text-zinc-600">·</span>}
                {published_at && <span>{formatDate(published_at)}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Column 2: Summary ── */}
        <div className="md:flex-[2] p-3 md:p-4 flex flex-col justify-between gap-2 border-t md:border-t-0 md:border-r border-zinc-700">
          <div className="flex-1">
            {!analyzed_at || reanalyzing ? (
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                <span className="text-zinc-500 text-xs italic">
                  {reanalyzing ? 'Re-analyzing…' : 'Analyzing…'}
                </span>
              </div>
            ) : summary ? (
              <>
                <div className="mb-2">
                  <SpeakButton id={`${id}-summary`} text={buildVideoSpeakText(data)} speakingId={speakingId} onSpeak={onSpeak} />
                </div>
                <p className="text-zinc-300 text-lg leading-relaxed">{summary}</p>
              </>
            ) : (
              <span className="text-zinc-600 text-base italic">No summary available</span>
            )}
          </div>
          {analyzed_at && !reanalyzing && isAdmin && (
            <div className="flex items-center gap-3 self-end">
              <button
                onClick={handleReanalyze}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                title="Re-run Claude analysis using the video transcript"
              >
                ↻ re-analyze
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete "${title}" from the database?`)) onDelete?.(id);
                }}
                className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                title="Permanently delete this video from the database"
              >
                ✕ delete
              </button>
            </div>
          )}
        </div>

        {/* ── Column 3: Recommendations ── */}
        <div className="md:flex-[1.5] p-3 md:p-4 flex flex-col gap-2 border-t md:border-t-0 border-zinc-700">
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Recommendations</span>
            {analyzed_at && !reanalyzing && buildVideoRecsText(data) && (
              <SpeakButton id={`${id}-recs`} text={buildVideoRecsText(data)} speakingId={speakingId} onSpeak={onSpeak} />
            )}
          </div>
          {!analyzed_at || reanalyzing ? (
            <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mt-1" />
          ) : signalList.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {signalList.map((s, i) => (
                <div key={`${s.ticker}-${i}`} className="flex flex-col gap-0.5">
                  <SignalBadge signal={s} />
                  {s.reasoning && (
                    <span className="text-zinc-400 text-base leading-snug pl-0.5">{s.reasoning}</span>
                  )}
                </div>
              ))}
              {mentionOnly.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1.5 border-t border-zinc-700">
                  {mentionOnly.map((t) => (
                    <a key={t} href={`https://www.tradingview.com/symbols/${t}`} target="_blank" rel="noopener noreferrer" className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs px-1.5 py-0.5 rounded font-mono border border-zinc-600 transition-colors">
                      {t}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : tickerList.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tickerList.map((t) => (
                <a key={t} href={`https://www.tradingview.com/symbols/${t}`} target="_blank" rel="noopener noreferrer" className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs px-1.5 py-0.5 rounded font-mono border border-zinc-600 transition-colors">
                  {t}
                </a>
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
