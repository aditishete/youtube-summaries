import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { summarizeVideo, getSummaryHistory } from '../api.js';

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

function downloadCsv(history) {
  const header = ['Thumbnail URL', 'Video URL', 'Summarized On', 'Summary', 'Key Points'];
  const rows = history.map((item) => [
    csvCell(item.thumbnail),
    csvCell(item.url),
    csvCell(formatDate(item.created_at)),
    csvCell(item.summary),
    csvCell(Array.isArray(item.keyPoints) ? item.keyPoints.join(' | ') : ''),
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
  doc.text('Video Summary History', margin, margin + 10);

  const rows = history.map((item) => {
    const kp = Array.isArray(item.keyPoints) ? item.keyPoints : [];
    return [
      pdfSafe(item.title || ''),
      [item.url || '', formatDate(item.created_at)].filter(Boolean).join('\n'),
      pdfSafe(item.summary || '') + (kp.length ? '\n\nKey Points:\n' + kp.map((p, i) => `${i + 1}. ${pdfSafe(p)}`).join('\n') : ''),
    ];
  });

  autoTable(doc, {
    startY: margin + 24,
    margin: { left: margin, right: margin },
    head: [['Thumbnail / Title', 'URL & Date', 'Summary']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, overflow: 'linebreak', valign: 'top', textColor: [39, 39, 42] },
    headStyles: { fillColor: [39, 39, 42], textColor: [244, 244, 245], fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: (pageW - margin * 2) * 0.30 },
      1: { cellWidth: (pageW - margin * 2) * 0.30 },
      2: { cellWidth: (pageW - margin * 2) * 0.40 },
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

export default function SummarizePage({ onBack }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    getSummaryHistory()
      .then(({ history }) => setHistory(history))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    if (!trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
      setError('Please enter a valid YouTube URL.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await summarizeVideo(trimmed);
      const entry = { ...data, keyPoints: data.keyPoints, created_at: new Date().toISOString() };
      setHistory((prev) => [entry, ...prev].slice(0, 20));
      setUrl('');
    } catch (err) {
      setError(err.message || 'Summarization failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-8 py-5 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Back
        </button>
        <span className="text-zinc-700">|</span>
        <span className="text-zinc-300 font-semibold">Summarize Video</span>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* URL input */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-zinc-100 mb-1">Summarize Any YouTube Video</h1>
            <p className="text-zinc-400 text-sm mb-5">
              Paste a YouTube URL to get an AI-generated summary in English.
            </p>

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
                {loading ? 'Summarizing…' : 'Summarize'}
              </button>
            </form>

            {error && (
              <div className="mt-3 bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {loading && (
              <div className="mt-4 flex items-center gap-3 text-sm text-zinc-400">
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-violet-500 rounded-full animate-spin flex-shrink-0" />
                Fetching transcript &amp; summarizing… this usually takes 5–10 seconds.
              </div>
            )}
          </div>

          {/* History table */}
          {!historyLoading && history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-zinc-200">
                  Previous Summaries
                  <span className="ml-2 text-xs font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full border border-zinc-700">
                    {history.length}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadCsv(history)}
                    className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-300 hover:text-zinc-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ↓ CSV
                  </button>
                  <button
                    onClick={() => downloadPdf(history)}
                    className="flex items-center gap-1.5 bg-red-900/60 hover:bg-red-900 border border-red-700 text-red-300 hover:text-red-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ↓ PDF
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-700 overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '40%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-zinc-800/80">
                      <th className="px-4 py-2.5 text-left text-zinc-400 font-medium text-xs uppercase tracking-wide">Video</th>
                      <th className="px-4 py-2.5 text-left text-zinc-400 font-medium text-xs uppercase tracking-wide">URL &amp; Date</th>
                      <th className="px-4 py-2.5 text-left text-zinc-400 font-medium text-xs uppercase tracking-wide">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {history.map((item, idx) => (
                      <tr key={item.id ?? idx} className="align-top hover:bg-zinc-800/30 transition-colors">
                        {/* Thumbnail */}
                        <td className="px-4 py-3">
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              className="w-full aspect-video object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-full aspect-video bg-zinc-800 rounded-lg" />
                          )}
                          <p className="mt-2 text-zinc-200 text-xs font-medium leading-snug line-clamp-2">
                            {item.title}
                          </p>
                        </td>

                        {/* URL & date */}
                        <td className="px-4 py-3">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-400 text-xs hover:underline break-all leading-relaxed"
                          >
                            {item.url}
                          </a>
                          {item.created_at && (
                            <p className="mt-2 text-zinc-500 text-xs">
                              Summarized {formatDate(item.created_at)}
                            </p>
                          )}
                        </td>

                        {/* Summary */}
                        <td className="px-4 py-3 text-zinc-300 text-xs leading-relaxed">
                          <p>{item.summary}</p>
                          {Array.isArray(item.keyPoints) && item.keyPoints.length > 0 && (
                            <ul className="mt-3 space-y-1.5">
                              {item.keyPoints.map((pt, i) => (
                                <li key={i} className="flex gap-2 text-zinc-400">
                                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-violet-900/60 text-violet-400 text-xs flex items-center justify-center font-medium mt-0.5">
                                    {i + 1}
                                  </span>
                                  <span>{pt}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
