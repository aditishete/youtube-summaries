import React, { useState, useRef, useEffect } from 'react';
import SignalBadge from './SignalBadge.jsx';
import { reanalyzeVideo } from '../api.js';
import { SpeakButton } from './SpeakButton.jsx';
import Tooltip from './Tooltip.jsx';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
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

export default function VideoCard({ video, onUpdated, onDelete, speakingId, onSpeak, isAdmin, isHighlighted, category = 'market' }) {
  const [imgError, setImgError] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!isHighlighted) return;
    setHighlighted(true);
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlighted(false), 3000);
    return () => clearTimeout(t);
  }, [isHighlighted]);

  function handleShare() {
    navigator.clipboard.writeText(`${window.location.origin}/?video=${video.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
    key_points,
    tickers,
    trade_signals,
    analyzed_at,
  } = data;

  const keyPoints = Array.isArray(key_points) ? key_points : [];

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
    <div ref={cardRef} className={`bg-zinc-800 rounded-xl border transition-colors duration-150 overflow-hidden ${highlighted ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-zinc-700 hover:border-zinc-500'}`}>
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

        {/* ── Column 2: Summary (+ key points for market) ── */}
        <div className="md:flex-[2] flex flex-col justify-between border-t md:border-t-0 md:border-r border-zinc-700">
          {/* Button toolbar — sits flush at the top with its own padding */}
          <div className="px-3 md:px-4 pt-2 pb-1 flex items-center gap-2 border-b border-zinc-700/50">
            {analyzed_at && !reanalyzing && summary ? (
              <>
                <SpeakButton id={`${id}-summary`} text={buildVideoSpeakText(data)} speakingId={speakingId} onSpeak={onSpeak} tooltipPosition="bottom" />
                <Tooltip label="Copy a shareable link to this brief" position="bottom">
                  <button
                    onClick={handleShare}
                    className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                      copied
                        ? 'bg-emerald-700/40 border-emerald-500 text-emerald-200'
                        : 'bg-zinc-700 border-zinc-500 text-zinc-200 hover:bg-zinc-600 hover:border-zinc-400'
                    }`}
                  >
                    {copied ? '✓ Copied' : '⤴ Share'}
                  </button>
                </Tooltip>
              </>
            ) : (
              <div className="h-8" />
            )}
          </div>

          <div className="flex-1 p-3 md:p-4 flex flex-col justify-between gap-2">
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
                <p className="text-zinc-300 text-lg leading-relaxed">{summary}</p>
                {category !== 'healthy' && keyPoints.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {keyPoints.map((pt, i) => (
                      <li key={i} className="flex gap-2 text-zinc-400">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-900/60 text-violet-400 text-xs flex items-center justify-center font-medium mt-0.5">{i + 1}</span>
                        <span className="text-base">{pt}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <span className="text-zinc-600 text-base italic">No summary available</span>
            )}
          </div>
          {analyzed_at && !reanalyzing && isAdmin && (
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-700/50">
              <Tooltip label="Re-run Claude AI analysis using this video's transcript">
                <button
                  onClick={handleReanalyze}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border bg-zinc-900 border-violet-700 text-violet-400 hover:bg-violet-900/40 hover:border-violet-500 hover:text-violet-300 transition-colors"
                >
                  ↻ Re-analyze
                </button>
              </Tooltip>
              <Tooltip label="Permanently delete this video from the database">
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${title}" from the database?`)) onDelete?.(id);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border bg-zinc-900 border-red-800 text-red-400 hover:bg-red-900/40 hover:border-red-500 hover:text-red-300 transition-colors"
                >
                  ✕ Delete
                </button>
              </Tooltip>
            </div>
          )}
          </div>
        </div>

        {/* ── Column 3: Key Takeaways (health) or Recommendations (market) ── */}
        <div className="md:flex-[1.5] p-3 md:p-4 flex flex-col gap-2 border-t md:border-t-0 border-zinc-700">
          {category === 'healthy' ? (
            <>
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Key Takeaways</span>
              {!analyzed_at || reanalyzing ? (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-teal-400 border-t-transparent animate-spin mt-1" />
              ) : keyPoints.length > 0 ? (
                <ul className="space-y-2">
                  {keyPoints.map((pt, i) => (
                    <li key={i} className="flex gap-2 text-zinc-400">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-900/60 text-teal-400 text-xs flex items-center justify-center font-medium mt-0.5">{i + 1}</span>
                      <span className="text-base">{pt}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-zinc-600 text-xs italic">—</span>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Recommendations</span>
                {analyzed_at && !reanalyzing && buildVideoRecsText(data) && (
                  <SpeakButton id={`${id}-recs`} text={buildVideoRecsText(data)} speakingId={speakingId} onSpeak={onSpeak} tooltipPosition="bottom" />
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
            </>
          )}
        </div>

      </div>
    </div>
  );
}
