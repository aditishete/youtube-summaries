import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { summarizeVideo, getBriefStatus, getSummaryHistory, deleteSummaryItem } from '../api.js';

const BRIEF_POLL_INTERVAL_MS  = 5000;
const BRIEF_MAX_POLL_ATTEMPTS = 5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
import SignalBadge from './SignalBadge.jsx';
import { useSpeech, SpeakButton } from './SpeakButton.jsx';

function pdfSafe(str) {
  return String(str ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function csvCell(value) {
  const str = String(value ?? '').replace(/"/g, '""');
  return `"${str}"`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildRecsCsv(item) {
  const signals = Array.isArray(item.trade_signals) ? item.trade_signals : [];
  const tickerList = Array.isArray(item.tickers) ? item.tickers : [];
  const recs = Array.isArray(item.recommendations) ? item.recommendations : [];
  if (signals.length > 0 || tickerList.length > 0) {
    const signalMap = Object.fromEntries(signals.map((s) => [s.ticker, s]));
    const mentionOnly = tickerList.filter((t) => !signalMap[t]);
    const parts = [
      ...signals.map((s) => `${s.ticker}: ${s.signal}${s.reasoning ? ` (${s.reasoning})` : ''}`),
      ...(mentionOnly.length ? [`Mentions: ${mentionOnly.join(', ')}`] : []),
    ];
    return parts.join(' | ');
  }
  return recs.map((r, i) => `${i + 1}. ${r}`).join(' | ');
}

function downloadCsv(history) {
  const header = ['Thumbnail URL', 'Video URL', 'Summarized On', 'Summary', 'Key Points', 'Recommendations'];
  const rows = history.map((item) => [
    csvCell(item.thumbnail),
    csvCell(item.url),
    csvCell(formatDate(item.created_at)),
    csvCell(item.summary),
    csvCell(Array.isArray(item.keyPoints) ? item.keyPoints.join(' | ') : ''),
    csvCell(buildRecsCsv(item)),
  ]);
  const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'summary_history.csv';
  a.click();
}

function downloadPdf(history) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(24, 24, 27);
  doc.text('Video In Brief History', margin, margin + 10);

  // Store per-row data for custom cell rendering
  const rowData = history.map((item) => {
    const kp = Array.isArray(item.keyPoints) ? item.keyPoints : [];
    const signals = Array.isArray(item.trade_signals) ? item.trade_signals : [];
    const tickerList = Array.isArray(item.tickers) ? item.tickers : [];
    const recs = Array.isArray(item.recommendations) ? item.recommendations : [];
    const signalMap = Object.fromEntries(signals.map((s) => [s.ticker, s]));
    const mentionOnly = tickerList.filter((t) => !signalMap[t]);
    const hasInvestment = signals.length > 0 || tickerList.length > 0;

    let recText = '';
    if (hasInvestment) {
      const parts = [
        ...signals.map((s) => `${pdfSafe(s.ticker)}: ${s.signal}${s.reasoning ? '\n  ' + pdfSafe(s.reasoning) : ''}`),
        ...(mentionOnly.length ? ['Mentions: ' + mentionOnly.map(pdfSafe).join(', ')] : []),
      ];
      recText = parts.join('\n');
    } else if (recs.length > 0) {
      recText = recs.map((r, i) => `${i + 1}. ${pdfSafe(r)}`).join('\n');
    }

    return {
      title: pdfSafe(item.title || ''),
      url: item.url || '',
      date: formatDate(item.created_at),
      summary: pdfSafe(item.summary || ''),
      keyPoints: kp.map((p) => pdfSafe(p)),
      recText,
    };
  });

  const avail = pageW - margin * 2;
  const rows = rowData.map((r) => [
    r.title,
    '',  // rendered manually via didDrawCell
    r.summary + (r.keyPoints.length ? '\n\nKey Points:\n' + r.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n') : ''),
    r.recText,
  ]);

  const PAD = 5;
  const LH = 10;

  autoTable(doc, {
    startY: margin + 24,
    margin: { left: margin, right: margin },
    head: [['Title', 'URL & Date', 'Summary', 'Recommendations']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: PAD, overflow: 'linebreak', valign: 'top', textColor: [39, 39, 42] },
    headStyles: { fillColor: [39, 39, 42], textColor: [244, 244, 245], fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: avail * 0.22 },
      1: { cellWidth: avail * 0.22 },
      2: { cellWidth: avail * 0.30 },
      3: { cellWidth: 'auto' },
    },
    willDrawCell(data) {
      if (data.section === 'body' && data.column.index === 1) {
        data.cell.text = [];
      }
    },
    didDrawCell(data) {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const r = rowData[data.row.index];
      if (!r) return;
      const x = data.cell.x;
      const y = data.cell.y;
      let cy = y + PAD + LH;

      // Clickable URL in blue
      if (r.url) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(59, 130, 246);
        const maxW = data.cell.width - PAD * 2;
        const urlLines = doc.splitTextToSize(r.url, maxW);
        urlLines.forEach((line) => {
          doc.textWithLink(line, x + PAD, cy, { url: r.url });
          cy += LH;
        });
      }

      // Date in grey below the URL
      if (r.date) {
        cy += 3;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(113, 113, 122);
        doc.text(r.date, x + PAD, cy);
      }
    },
    didDrawPage(data) {
      const n = doc.internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(161, 161, 170);
      doc.text(`Page ${data.pageNumber} of ${n}`, pageW - margin, pageH - 12, { align: 'right' });
    },
  });

  doc.save('summary_history.pdf');
}

function buildSummaryText(item) {
  const parts = [item.summary || ''];
  if (Array.isArray(item.keyPoints) && item.keyPoints.length > 0) {
    parts.push('Key points: ' + item.keyPoints.join('. '));
  }
  return parts.join('. ');
}

function buildRecsText(item) {
  const signals = Array.isArray(item.trade_signals) ? item.trade_signals : [];
  const tickerList = Array.isArray(item.tickers) ? item.tickers : [];
  const recs = Array.isArray(item.recommendations) ? item.recommendations : [];
  if (signals.length > 0 || tickerList.length > 0) {
    const signalMap = Object.fromEntries(signals.map((s) => [s.ticker, s]));
    const mentionOnly = tickerList.filter((t) => !signalMap[t]);
    const parts = [
      ...signals.map((s) => `${s.ticker}: ${s.signal}${s.reasoning ? '. ' + s.reasoning : ''}`),
      ...(mentionOnly.length ? ['Also mentioned: ' + mentionOnly.join(', ')] : []),
    ];
    return parts.join('. ');
  }
  return recs.join('. ');
}

function Recommendations({ tickers, tradeSignals, recommendations, large }) {
  const signals = Array.isArray(tradeSignals) ? tradeSignals : [];
  const tickerList = Array.isArray(tickers) ? tickers : [];
  const recs = Array.isArray(recommendations) ? recommendations : [];
  const hasInvestment = signals.length > 0 || tickerList.length > 0;
  const textSize = large ? 'text-lg' : 'text-base';

  if (!hasInvestment && recs.length === 0) return null;

  if (hasInvestment) {
    const signalMap = Object.fromEntries(signals.map((s) => [s.ticker, s]));
    const mentionOnly = tickerList.filter((t) => !signalMap[t]);
    return (
      <div className="flex flex-col gap-2">
        {signals.map((s, i) => (
          <div key={`${s.ticker}-${i}`} className="flex flex-col gap-0.5">
            <SignalBadge signal={s} />
            {s.reasoning && <span className={`text-zinc-400 ${textSize} leading-snug pl-0.5`}>{s.reasoning}</span>}
          </div>
        ))}
        {mentionOnly.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {mentionOnly.map((t) => (
              <a key={t} href={`https://www.tradingview.com/symbols/${t}`} target="_blank" rel="noopener noreferrer" className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs px-1.5 py-0.5 rounded font-mono border border-zinc-600 transition-colors">{t}</a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {recs.map((r, i) => (
        <li key={i} className={`flex gap-2 ${textSize} text-zinc-300`}>
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-900/60 text-emerald-400 text-xs flex items-center justify-center font-medium mt-0.5">{i + 1}</span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SummarizePage({ onBack, onLogout, isGuest, claimedShareToken }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [sortBy, setSortBy] = useState('added'); // 'added' | 'posted'
  const { speakingId, speak } = useSpeech();

  const sortedHistory = [...history].sort((a, b) => {
    if (sortBy === 'posted') {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  function handleShare(item) {
    const url = `${window.location.origin}?share=${item.share_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  useEffect(() => {
    getSummaryHistory()
      .then(({ history }) => setHistory(history))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  async function handleDelete(id) {
    setDeleteError(null);
    try {
      await deleteSummaryItem(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Delete failed:', err);
      setDeleteError('Failed to remove item. Please try again.');
      setConfirmDeleteId(null);
    }
  }

  function addResultToHistory(result) {
    const entry = {
      ...result,
      keyPoints:       result.keyPoints       || [],
      tickers:         result.tickers         || [],
      trade_signals:   result.trade_signals   || [],
      recommendations: result.recommendations || [],
      created_at:      result.created_at      || new Date().toISOString(),
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    if (!trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
      setError('Please enter a valid YouTube URL.');
      return;
    }

    setLoading(true);
    setLoadingMessage('Fetching transcript & summarizing… this usually takes 5–10 seconds.');
    setError(null);

    try {
      const data = await summarizeVideo(trimmed);

      if (data.status === 'done') {
        addResultToHistory(data.result);
        setUrl('');
        setLoading(false);
        return;
      }

      if (data.status === 'failed') {
        setError(data.error || 'Summarization failed. Please try again.');
        setLoading(false);
        return;
      }

      // status === 'pending' — start polling
      const { jobId } = data;
      setLoadingMessage('This is taking longer than expected — checking back shortly…');

      for (let attempt = 1; attempt <= BRIEF_MAX_POLL_ATTEMPTS; attempt++) {
        await sleep(BRIEF_POLL_INTERVAL_MS);

        let statusData;
        try {
          statusData = await getBriefStatus(jobId);
        } catch (err) {
          setError(err.message || 'Failed to check brief status. Please try again.');
          setLoading(false);
          return;
        }

        if (statusData.status === 'done') {
          addResultToHistory(statusData.result);
          setUrl('');
          setLoading(false);
          return;
        }

        if (statusData.status === 'failed') {
          setError(statusData.error || 'Summarization failed. Please try again.');
          setLoading(false);
          return;
        }

        setLoadingMessage(`Still working… (check ${attempt} of ${BRIEF_MAX_POLL_ATTEMPTS})`);
      }

      setError('Brief generation is taking too long. Please try again later.');
      setLoading(false);

    } catch (err) {
      setError(err.message || 'Summarization failed. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-8 py-4 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={onBack}
          className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 text-zinc-100 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          ← Back
        </button>
        <span className="text-zinc-300 font-semibold ml-1">Video In Brief</span>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://ko-fi.com/inbrief"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 hover:border-amber-400/60 text-amber-300 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            ☕ Support
          </a>
          {onLogout && (
            <button
              onClick={onLogout}
              className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 text-zinc-100 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-[5%] py-8">

          {/* URL input */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-zinc-100 mb-2">Video In Brief</h1>
            <p className="text-zinc-300 text-base mb-5">
              Paste a YouTube URL to get an AI-generated summary in English.
            </p>

            {isGuest ? (
              <div className="bg-zinc-900 border border-amber-700/50 rounded-xl px-5 py-5 flex items-start gap-4">
                <span className="text-amber-400 text-2xl mt-0.5">🔒</span>
                <div>
                  <p className="text-zinc-100 font-semibold text-base">Register to generate video briefs</p>
                  <p className="text-zinc-400 text-base mt-1">You're browsing as a guest. Create an account to generate your own AI-powered video summaries.</p>
                </div>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="flex gap-3">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(null); }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={loading}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50 transition"
                  />
                  <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm px-6 py-3 rounded-xl transition-colors whitespace-nowrap"
                  >
                    {loading ? 'Briefing…' : 'Get Brief'}
                  </button>
                </form>

                {error && (
                  <div className="mt-3 bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
                    <p className="text-red-300 text-base">{error}</p>
                  </div>
                )}
              </>
            )}

            {loading && (
              <div className="mt-4 flex items-center gap-3 text-base text-zinc-300">
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-violet-500 rounded-full animate-spin flex-shrink-0" />
                {loadingMessage}
              </div>
            )}
          </div>

          {/* Shared video banner */}
          {claimedShareToken && (
            <div className="mb-6 bg-violet-900/30 border border-violet-600/60 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-violet-400 text-lg flex-shrink-0">▶</span>
              <p className="text-violet-200 text-sm">A shared video analysis was added to your history and is highlighted below.</p>
            </div>
          )}

          {/* History table */}
          {!historyLoading && history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-zinc-100">
                  Previous Summaries
                  <span className="ml-2 text-xs font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded-full border border-zinc-700">
                    {history.length}
                  </span>
                </h2>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setSortBy(s => s === 'added' ? 'posted' : 'added')}
                    className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-300 hover:text-zinc-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                    title={sortBy === 'added' ? 'Switch to sort by posted time' : 'Switch to sort by time added'}
                  >
                    ⇅ {sortBy === 'added' ? 'Time Added' : 'Posted Time'}
                  </button>
                  <button
                    onClick={() => downloadCsv(sortedHistory)}
                    className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-300 hover:text-zinc-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ↓ CSV
                  </button>
                  <button
                    onClick={() => downloadPdf(sortedHistory)}
                    className="flex items-center gap-1.5 bg-red-900/60 hover:bg-red-900 border border-red-700 text-red-300 hover:text-red-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ↓ PDF
                  </button>
                </div>
              </div>

              {deleteError && (
                <div className="mb-3 bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
                  <p className="text-red-300 text-base">{deleteError}</p>
                </div>
              )}

              {/* Desktop: table layout */}
              <div className="hidden md:block rounded-xl border border-zinc-700 overflow-hidden">
                <table className="w-full text-lg table-fixed">
                  <colgroup>
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '42%' }} />
                    <col style={{ width: '29%' }} />
                    <col style={{ width: '12%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-zinc-800/80">
                      <th className="px-4 py-2.5 text-left text-zinc-300 font-semibold text-sm uppercase tracking-wide">Video</th>
                      <th className="px-4 py-2.5 text-left text-zinc-300 font-semibold text-sm uppercase tracking-wide">Summary</th>
                      <th className="px-4 py-2.5 text-left text-zinc-300 font-semibold text-sm uppercase tracking-wide">Recommendations</th>
                      <th className="px-4 py-2.5 text-left text-zinc-300 font-semibold text-sm uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {sortedHistory.map((item, idx) => (
                      <tr key={item.id ?? idx} className={`align-top hover:bg-zinc-800/30 transition-colors ${item.share_token === claimedShareToken ? 'ring-2 ring-inset ring-violet-500 bg-violet-950/20' : ''}`}>
                        <td className="px-4 py-3">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.title} className="w-full aspect-video object-cover rounded-lg" />
                          ) : (
                            <div className="w-full aspect-video bg-zinc-800 rounded-lg" />
                          )}
                          <p className="mt-2 text-zinc-200 text-lg font-medium leading-snug line-clamp-2">{item.title}</p>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 text-violet-400 text-sm hover:underline break-all leading-relaxed block">{item.url}</a>
                          {item.published_at && <p className="mt-1 text-zinc-500 text-sm">Posted {formatDate(item.published_at)}</p>}
                          {item.created_at && <p className="mt-0.5 text-zinc-600 text-sm">Briefed {formatDate(item.created_at)}</p>}
                        </td>
                        <td className="px-4 py-3 text-zinc-300 text-lg leading-relaxed">
                          <div className="mb-2">
                            <SpeakButton id={`${item.id ?? idx}-summary`} text={buildSummaryText(item)} speakingId={speakingId} onSpeak={speak} />
                          </div>
                          <p>{item.summary}</p>
                          {Array.isArray(item.keyPoints) && item.keyPoints.length > 0 && (
                            <ul className="mt-3 space-y-2">
                              {item.keyPoints.map((pt, i) => (
                                <li key={i} className="flex gap-2 text-zinc-400">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-900/60 text-violet-400 text-xs flex items-center justify-center font-medium mt-0.5">{i + 1}</span>
                                  <span className="text-lg">{pt}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {buildRecsText(item) && (
                            <div className="mb-2">
                              <SpeakButton id={`${item.id ?? idx}-recs`} text={buildRecsText(item)} speakingId={speakingId} onSpeak={speak} />
                            </div>
                          )}
                          <Recommendations tickers={item.tickers} tradeSignals={item.trade_signals} recommendations={item.recommendations} large />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            {item.share_token && (
                              <button
                                onClick={() => handleShare(item)}
                                className="bg-violet-900/50 hover:bg-violet-700 border border-violet-700 hover:border-violet-500 text-violet-300 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                              >
                                {copiedId === item.id ? 'Copied!' : 'Share'}
                              </button>
                            )}
                            {confirmDeleteId === (item.id ?? idx) ? (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-red-400 text-xs font-semibold">Remove?</span>
                                <button onClick={() => handleDelete(item.id ?? idx)} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg transition-colors">Yes</button>
                                <button onClick={() => setConfirmDeleteId(null)} className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs px-2 py-1 rounded-lg transition-colors">No</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(item.id ?? idx)}
                                className="bg-red-900/50 hover:bg-red-700 border border-red-700 hover:border-red-500 text-red-300 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: card layout */}
              <div className="md:hidden space-y-4">
                {sortedHistory.map((item, idx) => (
                  <div key={item.id ?? idx} className={`bg-zinc-900 rounded-xl overflow-hidden ${item.share_token === claimedShareToken ? 'border-2 border-violet-500' : 'border border-zinc-700'}`}>
                    <div className="flex gap-3 p-4">
                      <div className="flex-shrink-0 w-32">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.title} className="w-full aspect-video object-cover rounded-lg" />
                        ) : (
                          <div className="w-full aspect-video bg-zinc-800 rounded-lg" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-100 text-base font-medium leading-snug line-clamp-2">{item.title}</p>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-sm hover:underline mt-1.5 block truncate">{item.url}</a>
                        {item.published_at && <p className="text-zinc-500 text-sm mt-1">Posted {formatDate(item.published_at)}</p>}
                        {item.created_at && <p className="text-zinc-600 text-sm mt-0.5">Briefed {formatDate(item.created_at)}</p>}
                      </div>
                      <div className="flex-shrink-0 flex flex-col gap-1.5 items-end pt-0.5">
                        {item.share_token && (
                          <button
                            onClick={() => handleShare(item)}
                            className="bg-violet-900/50 hover:bg-violet-700 border border-violet-700 text-violet-300 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
                          >
                            {copiedId === item.id ? 'Copied!' : 'Share'}
                          </button>
                        )}
                        {confirmDeleteId === (item.id ?? idx) ? (
                          <div className="flex flex-col gap-1.5">
                            <button onClick={() => handleDelete(item.id ?? idx)} className="bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg transition-colors">Yes</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="bg-zinc-700 text-zinc-200 text-sm px-3 py-1.5 rounded-lg transition-colors">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(item.id ?? idx)}
                            className="bg-red-900/50 hover:bg-red-700 border border-red-700 text-red-300 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="px-4 pb-4 text-zinc-300 text-base leading-relaxed border-t border-zinc-800 pt-3">
                      <div className="mb-2">
                        <SpeakButton id={`${item.id ?? idx}-summary`} text={buildSummaryText(item)} speakingId={speakingId} onSpeak={speak} />
                      </div>
                      <p>{item.summary}</p>
                      {Array.isArray(item.keyPoints) && item.keyPoints.length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {item.keyPoints.map((pt, i) => (
                            <li key={i} className="flex gap-2 text-zinc-400">
                              <span className="flex-shrink-0 text-violet-400 font-medium text-base">{i + 1}.</span>
                              <span className="text-base">{pt}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {buildRecsText(item) && (
                        <div className="mt-3 mb-2">
                          <SpeakButton id={`${item.id ?? idx}-recs`} text={buildRecsText(item)} speakingId={speakingId} onSpeak={speak} />
                        </div>
                      )}
                      <Recommendations tickers={item.tickers} tradeSignals={item.trade_signals} recommendations={item.recommendations} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!historyLoading && history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-4">▶️</div>
              <p className="text-zinc-400 text-sm">No summaries yet. Paste a YouTube URL above to get started.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
