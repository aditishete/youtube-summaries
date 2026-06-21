import React, { useState, useEffect } from 'react';
import VideoCard from './VideoCard.jsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSpeech } from './SpeakButton.jsx';
import { MAX_VIDEOS_PER_CHANNEL, MAX_RETAINED_VIDEOS_PER_CHANNEL } from '../config.js';

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

  doc.save(`${title.replace(/\s+/g, '_')}_market_brief.pdf`);
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

export default function VideoFeed({ videos, loading, selectedChannelId, channels, onBack, onLogout, isAdmin, onDeleteVideo, targetVideoId, category = 'market', market = 'us', onMarketChange }) {
  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);
  const headerTitle = selectedChannel ? selectedChannel.name : 'Overview';

  const [extraCount, setExtraCount] = useState(0);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  useEffect(() => { setExtraCount(0); }, [selectedChannelId]);

  const { speakingId, speak } = useSpeech();

  let displayVideos, hasMore;
  if (selectedChannelId) {
    // Single channel: paginate through all stored videos (up to MAX_RETAINED_VIDEOS_PER_CHANNEL in DB)
    const limit = MAX_RETAINED_VIDEOS_PER_CHANNEL + extraCount * 10;
    displayVideos = videos.slice(0, limit);
    hasMore = videos.length > limit;
  } else {
    // All channels: backend already returns top 3 per channel sorted by date
    displayVideos = videos;
    hasMore = false;
  }

  return (
    <div className="p-3 md:py-6 md:px-[5%]">
      {/* Row 1 — Back + Ko-fi + Sign out (desktop only) */}
      <div className="hidden md:flex items-center justify-between gap-3 mb-4">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 text-zinc-100 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Row 2 — Market tabs (market only, desktop only) */}
      {category === 'market' && onMarketChange && (
        <div className="hidden md:flex items-center gap-2 mb-4">
          <button
            onClick={() => onMarketChange('us')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              market === 'us'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
            }`}
          >
            🇺🇸 US
          </button>
          <button
            onClick={() => onMarketChange('india')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              market === 'india'
                ? 'bg-orange-600 border-orange-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
            }`}
          >
            🇮🇳 India
          </button>
        </div>
      )}

      {/* Row 3 — Title + count (desktop only) */}
      <div className="hidden md:flex items-center gap-3 mb-6">
        <h2 className="text-xl font-bold text-zinc-100">{headerTitle}</h2>
        {!loading && (
          <span className="bg-zinc-800 text-zinc-400 text-xs font-mono px-2 py-1 rounded-full border border-zinc-700">
            {displayVideos.length} video{displayVideos.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Mobile: market tabs + video count */}
      {category === 'market' && onMarketChange && (
        <div className="flex md:hidden items-center gap-2 mb-3">
          <button
            onClick={() => onMarketChange('us')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              market === 'us'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
            }`}
          >
            🇺🇸 US
          </button>
          <button
            onClick={() => onMarketChange('india')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              market === 'india'
                ? 'bg-orange-600 border-orange-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
            }`}
          >
            🇮🇳 India
          </button>
        </div>
      )}
      <div className="flex md:hidden items-center gap-2 mb-3">
        {!loading && (
          <span className="bg-zinc-800 text-zinc-400 text-xs font-mono px-2 py-1 rounded-full border border-zinc-700">
            {displayVideos.length} video{displayVideos.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Disclosure banner + modal */}
      {disclosureOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setDisclosureOpen(false)}>
          <div className="bg-zinc-900 border border-amber-400/40 rounded-xl max-w-lg w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-amber-300 font-bold text-lg">Why Finfluencer Advice can be Risky</h2>
              <button onClick={() => setDisclosureOpen(false)} className="text-zinc-500 hover:text-zinc-200 ml-4 text-xl leading-none">✕</button>
            </div>
            <div className="text-zinc-300 text-sm leading-relaxed space-y-4 max-h-96 overflow-y-auto pr-1">
              <p>Relying on financial influencers ("finfluencers") for investment advice is highly risky because they typically lack formal credentials, promote unregulated or high-risk assets, and are often paid to endorse products. Unlike licensed professionals, finfluencers are rarely fiduciaries, lack accountability for poor recommendations, and cater to algorithms by prioritizing sensationalism over safe, nuanced financial planning.</p>
              <div>
                <p className="text-amber-300 font-semibold mb-2">Key Risks of Finfluencer Advice</p>
                <ul className="space-y-2 list-none">
                  <li><span className="text-amber-400">•</span> <span className="text-zinc-200 font-medium">Lack of Credentials:</span> Many finfluencers are self-taught and lack professional licenses (like CFP, CPA, or CFA) or the regulatory oversight required of legitimate investment advisors.</li>
                  <li><span className="text-amber-400">•</span> <span className="text-zinc-200 font-medium">Hidden Conflicts of Interest:</span> Content is frequently monetized through affiliate links, sponsorships, or undisclosed partnerships. They may benefit financially from your clicks or purchases regardless of whether the product is right for you.</li>
                  <li><span className="text-amber-400">•</span> <span className="text-zinc-200 font-medium">One-Size-Fits-All Advice:</span> Social media content is designed for mass audiences. Finfluencers do not know your unique income, debt, tax situation, or risk tolerance, making their advice largely inapplicable or outright dangerous to your personal circumstances.</li>
                  <li><span className="text-amber-400">•</span> <span className="text-zinc-200 font-medium">Vulnerability to Scams:</span> Studies indicate that individuals who rely on social media financial advice are significantly more susceptible to investment scams, "pump-and-dump" schemes, or losing money in unregulated spaces like crypto.</li>
                  <li><span className="text-amber-400">•</span> <span className="text-zinc-200 font-medium">Lack of Nuance:</span> Social media algorithms reward extreme viewpoints and absolutes (e.g., "Cash is trash," "Buy this stock now"). Sound financial advice almost always operates in the gray area of "it depends".</li>
                </ul>
              </div>
              <div>
                <p className="text-amber-300 font-semibold mb-2">How to Protect Your Money</p>
                <ul className="space-y-2 list-none">
                  <li><span className="text-amber-400">•</span> <span className="text-zinc-200 font-medium">Verify the Source:</span> Never blindly trust a finfluencer. Check if they have official designations or licenses through regulatory databases such as SEC Investment Adviser Public Disclosure or FINRA BrokerCheck.</li>
                  <li><span className="text-amber-400">•</span> <span className="text-zinc-200 font-medium">Question the Motive:</span> Ask yourself: Is this advice benefiting the influencer more than it benefits me? Be highly skeptical of anyone promising guaranteed returns.</li>
                  <li><span className="text-amber-400">•</span> <span className="text-zinc-200 font-medium">Consult Professionals:</span> Use educational content to build basic financial literacy, but consult certified financial professionals for actual financial planning and personalised advice.</li>
                </ul>
              </div>
              <p className="text-zinc-500 italic text-xs border-t border-zinc-700 pt-3">AI responses may include mistakes. This content is for informational purposes only and does not constitute financial advice.</p>
            </div>
            <button onClick={() => setDisclosureOpen(false)} className="mt-6 w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-semibold text-sm py-2 rounded-lg transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
      {category === 'market' && (
        <div className="flex items-center justify-between bg-amber-400/10 border border-amber-400/50 rounded-lg px-4 py-3 mb-5">
          <span className="text-amber-300 font-semibold text-sm">Disclosures: Why Finfluencer Advice can be Risky</span>
          <button
            onClick={() => setDisclosureOpen(true)}
            className="text-amber-400 text-sm underline hover:text-amber-300 ml-4 flex-shrink-0"
          >
            Read Disclosures
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty state */}
      {!loading && displayVideos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-zinc-300 font-semibold text-lg mb-2">No videos yet</h3>
          <p className="text-zinc-500 text-sm max-w-xs">
            {selectedChannelId
              ? 'This channel has no videos. Try refreshing it.'
              : category === 'healthy'
                ? 'Add a YouTube health channel from the sidebar to get started.'
                : 'Add a YouTube channel from the sidebar to start seeing market signals.'}
          </p>
        </div>
      )}

      {/* Export row — above video list */}
      {!loading && displayVideos.length > 0 && (
        <div className="flex justify-end items-center gap-2 mb-4">
          <button
            onClick={() => downloadCsv(displayVideos, `${headerTitle.replace(/\s+/g, '_')}_brief.csv`)}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            ↓ CSV
          </button>
          <button
            onClick={() => downloadPdf(displayVideos, headerTitle)}
            className="bg-red-900/40 hover:bg-red-900/70 border border-red-800 hover:border-red-600 text-red-300 hover:text-red-100 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            ↓ PDF
          </button>
        </div>
      )}

      {/* Video list */}
      {!loading && displayVideos.length > 0 && (
        <div className="space-y-4">
          {displayVideos.map((video) => (
            <VideoCard key={video.id} video={video} speakingId={speakingId} onSpeak={speak} isAdmin={isAdmin} onDelete={onDeleteVideo} isHighlighted={video.id === targetVideoId} category={category} />
          ))}
        </div>
      )}

      {/* Show more */}
      {!loading && hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setExtraCount(e => e + 1)}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
