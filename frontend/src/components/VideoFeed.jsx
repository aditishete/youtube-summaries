import React from 'react';
import VideoCard from './VideoCard.jsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function csvCell(value) {
  const str = String(value ?? '').replace(/"/g, '""');
  return `"${str}"`;
}

function buildRecommendations(tickers, tradeSignals, sep = '; ') {
  const signals = Array.isArray(tradeSignals) ? tradeSignals : [];
  const tickerList = Array.isArray(tickers) ? tickers : [];
  const signalMap = Object.fromEntries(signals.map((s) => [s.ticker, s]));

  const parts = [
    ...signals.map((s) => `${s.ticker}: ${s.signal}${s.reasoning ? ` (${s.reasoning})` : ''}`),
    ...tickerList.filter((t) => !signalMap[t]).map((t) => `${t}: mentioned`),
  ];
  return parts.join(sep);
}

function downloadCsv(videos, filename) {
  const header = ['Title', 'URL', 'Channel', 'Published', 'Summary', 'Recommendations'];
  const rows = videos.map((v) => [
    csvCell(v.title),
    csvCell(v.url),
    csvCell(v.channel_name),
    csvCell(v.published_at ? new Date(v.published_at).toLocaleDateString('en-US') : ''),
    csvCell(v.summary),
    csvCell(buildRecommendations(v.tickers, v.trade_signals)),
  ]);

  const csv = [header.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Strip characters outside Latin-1 that jsPDF's built-in fonts can't render
function pdfSafe(str) {
  return (str || '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').replace(/\s+/g, ' ').trim();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

function downloadPdf(videos, title) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 841
  const pageH = doc.internal.pageSize.getHeight();  // 595
  const margin = 28;
  const PAD = 8;
  const LH = 11; // base line height

  // Pre-build per-row rec data so didDrawCell can access it
  const rowMeta = videos.map((v) => {
    const signals = Array.isArray(v.trade_signals) ? v.trade_signals : [];
    const tickers = Array.isArray(v.tickers) ? v.tickers : [];
    const signalMap = Object.fromEntries(signals.map((s) => [s.ticker, s]));
    return {
      video: v,
      recLines: [
        ...signals.map((s) => ({ ticker: s.ticker, rest: `: ${s.signal}${s.reasoning ? `  —  ${s.reasoning}` : ''}` })),
        ...tickers.filter((t) => !signalMap[t]).map((t) => ({ ticker: t, rest: ': mentioned' })),
      ],
    };
  });

  // ── Header ───────────────────────────────────────────────────
  doc.setFillColor(24, 24, 27);
  doc.rect(0, 0, pageW, 46, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(title, margin, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(161, 161, 170);
  doc.text(`Generated ${new Date().toLocaleString()}  ·  ${videos.length} video${videos.length !== 1 ? 's' : ''}`, margin, 38);

  // ── Table ────────────────────────────────────────────────────
  // Column widths: video col 195, summary 330, recs remainder (~260)
  const COL0_W = 195;
  const COL1_W = 330;

  // Body text used only for row height calculation — use 8pt uniform font
  const tableBody = rowMeta.map(({ video, recLines }) => {
    const published = video.published_at
      ? new Date(video.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    const ago = timeAgo(video.published_at);
    // Newlines drive height; autoTable counts them at bodyStyles fontSize
    const col0 = [video.channel_name || '', pdfSafe(video.title), `${ago}  ·  ${published}`, video.url || ''].join('\n');
    const col2 = recLines.length ? recLines.map((r) => `${pdfSafe(r.ticker)}${pdfSafe(r.rest)}`).join('\n') : '—';
    return [col0, pdfSafe(video.summary) || '—', col2];
  });

  autoTable(doc, {
    startY: 52,
    margin: { left: margin, right: margin },
    head: [['Video', 'Summary', 'Recommendations']],
    body: tableBody,
    columnStyles: {
      0: { cellWidth: COL0_W },
      1: { cellWidth: COL1_W },
      2: { cellWidth: 'auto' },
    },
    headStyles: {
      fillColor: [39, 39, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: { top: 7, right: PAD, bottom: 7, left: PAD },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [63, 63, 70],
      cellPadding: PAD,
      lineColor: [228, 228, 231],
      lineWidth: 0.4,
    },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    // Suppress default text on cols 0 & 2; we draw custom content in didDrawCell
    willDrawCell(data) {
      if (data.section === 'body' && (data.column.index === 0 || data.column.index === 2)) {
        data.cell.text = [];
      }
    },
    didDrawCell(data) {
      if (data.section !== 'body') return;
      const { x, y, width } = data.cell;
      const row = rowMeta[data.row.index];
      if (!row) return;

      if (data.column.index === 0) {
        const v = row.video;
        let cy = y + PAD;
        const innerW = width - PAD * 2;

        // Channel name — grey caps
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(113, 113, 122);
        cy += 7;
        doc.text(pdfSafe(v.channel_name).toUpperCase(), x + PAD, cy);
        cy += LH;

        // Title — bold dark
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(24, 24, 27);
        const titleLines = doc.splitTextToSize(pdfSafe(v.title), innerW);
        cy += 1;
        doc.text(titleLines, x + PAD, cy);
        cy += titleLines.length * LH;

        // Date — grey
        const published = v.published_at
          ? new Date(v.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : '';
        const ago = timeAgo(v.published_at);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(113, 113, 122);
        cy += 3;
        doc.text([ago, published].filter(Boolean).join('  ·  '), x + PAD, cy);
        cy += LH;

        // URL — blue clickable
        if (v.url) {
          doc.setFontSize(7);
          doc.setTextColor(59, 130, 246);
          const shortUrl = v.url.length > 55 ? v.url.slice(0, 52) + '…' : v.url;
          doc.textWithLink(shortUrl, x + PAD, cy, { url: v.url });
        }
      }

      if (data.column.index === 2) {
        const { recLines } = row;
        let cy = y + PAD + 8;
        for (const rec of recLines) {
          // Ticker bold
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(24, 24, 27);
          const ticker = pdfSafe(rec.ticker);
          const tw = doc.getTextWidth(ticker);
          doc.text(ticker, x + PAD, cy);
          // Rest normal
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(63, 63, 70);
          doc.text(pdfSafe(rec.rest), x + PAD + tw, cy);
          cy += LH + 1;
        }
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

  doc.save(`${title.replace(/\s+/g, '_')}_market_feed.pdf`);
}

function SkeletonCard() {
  return (
    <div className="bg-zinc-800 rounded-xl border border-zinc-700 p-4 animate-pulse">
      <div className="flex gap-4">
        <div className="w-40 h-24 bg-zinc-700 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="h-4 bg-zinc-700 rounded w-3/4" />
          <div className="h-3 bg-zinc-700 rounded w-1/2" />
          <div className="h-3 bg-zinc-700 rounded w-full" />
          <div className="h-3 bg-zinc-700 rounded w-5/6" />
          <div className="flex gap-2 mt-2">
            <div className="h-5 bg-zinc-700 rounded w-12" />
            <div className="h-5 bg-zinc-700 rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VideoFeed({ videos, loading, selectedChannelId, channels, onBack, onLogout }) {
  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);
  const headerTitle = selectedChannel ? selectedChannel.name : 'All Channels';

  return (
    <div className="p-6">
      {/* Feed Header */}
      <div className="flex items-center gap-3 mb-6">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mr-1"
          >
            ← Back
          </button>
        )}
        <h2 className="text-xl font-bold text-zinc-100">{headerTitle}</h2>
        {!loading && (
          <span className="bg-zinc-800 text-zinc-400 text-xs font-mono px-2 py-1 rounded-full border border-zinc-700">
            {videos.length} video{videos.length !== 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!loading && videos.length > 0 && (<>
            <button
              onClick={() => downloadCsv(videos, `${headerTitle.replace(/\s+/g, '_')}_market_feed.csv`)}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              ↓ CSV
            </button>
            <button
              onClick={() => downloadPdf(videos, headerTitle)}
              className="flex items-center gap-1.5 bg-red-900/60 hover:bg-red-900 border border-red-700 hover:border-red-500 text-red-300 hover:text-red-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              ↓ PDF
            </button>
          </>)}
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
            >
              Sign out
            </button>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-zinc-300 font-semibold text-lg mb-2">No videos yet</h3>
          <p className="text-zinc-500 text-sm max-w-xs">
            {selectedChannelId
              ? 'This channel has no videos. Try refreshing it.'
              : 'Add a YouTube channel from the sidebar to start seeing market signals.'}
          </p>
        </div>
      )}

      {/* Video list */}
      {!loading && videos.length > 0 && (
        <div className="space-y-4">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
