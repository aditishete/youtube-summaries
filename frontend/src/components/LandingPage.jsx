import React from 'react';

export default function LandingPage({ currentUser, onNavigate, onLogout }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-zinc-100">InBrief</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400 mr-2">
            Signed in as <span className="text-zinc-200 font-medium">{currentUser?.username}</span>
          </span>
          <a
            href="https://ko-fi.com/inbrief"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 hover:border-amber-400/60 text-amber-300 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            ☕ Support
          </a>
          <button
            onClick={onLogout}
            className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 text-zinc-100 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="flex flex-col items-center justify-center flex-1 px-6 py-16">
        <h1 className="text-2xl md:text-4xl font-bold text-zinc-100 mb-3 text-center">What would you like to do?</h1>
        <p className="text-zinc-400 text-base md:text-lg mb-8 md:mb-14 text-center max-w-lg">
          Track investment channels and get AI-powered trade signals, or get an instant brief on any YouTube video.
        </p>

        <div className={`grid grid-cols-1 gap-6 w-full max-w-4xl md:grid-cols-3`}>
          {/* Card 1 — Market Brief */}
          <button
            onClick={() => onNavigate('dashboard')}
            className="group text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500 rounded-2xl p-8 transition-all duration-200 shadow-lg hover:shadow-blue-900/20"
          >
            <div className="text-4xl mb-5">📈</div>
            <h2 className="text-xl font-bold text-zinc-100 mb-2 group-hover:text-blue-400 transition-colors">
              Market Briefs
            </h2>
            <ul className="text-zinc-500 text-xs space-y-1.5 mb-6">
              <li className="flex items-center gap-2"><span className="text-blue-500">•</span> AI summaries and BUY / SELL / WATCH signals</li>
              <li className="flex items-center gap-2"><span className="text-blue-500">•</span> Ticker links to TradingView</li>
              <li className="flex items-center gap-2"><span className="text-blue-500">•</span> Export to CSV or PDF</li>
            </ul>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 group-hover:gap-2.5 transition-all">
              Open feed <span>→</span>
            </span>
          </button>

          {/* Card 2 — Healthy Brief */}
          <button
            onClick={() => onNavigate('healthy')}
            className="group text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-teal-500 rounded-2xl p-8 transition-all duration-200 shadow-lg hover:shadow-teal-900/20"
          >
            <div className="text-4xl mb-5">🌿</div>
            <h2 className="text-xl font-bold text-zinc-100 mb-2 group-hover:text-teal-400 transition-colors">
              Health Briefs
            </h2>
            <ul className="text-zinc-500 text-xs space-y-1.5 mb-6">
              <li className="flex items-center gap-2"><span className="text-teal-500">•</span> AI summaries from health & wellness channels</li>
              <li className="flex items-center gap-2"><span className="text-teal-500">•</span> Key insights and actionable takeaways</li>
              <li className="flex items-center gap-2"><span className="text-teal-500">•</span> Export to CSV or PDF</li>
            </ul>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-400 group-hover:gap-2.5 transition-all">
              Open feed <span>→</span>
            </span>
          </button>

          {/* Card 3 — Video In Brief */}
          <button
            onClick={() => onNavigate('summarize')}
            className="group text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-violet-500 rounded-2xl p-8 transition-all duration-200 shadow-lg hover:shadow-violet-900/20"
          >
            <div className="text-4xl mb-5">▶️</div>
            <h2 className="text-xl font-bold text-zinc-100 mb-2 group-hover:text-violet-400 transition-colors">
              Video Briefs
            </h2>
            <ul className="text-zinc-500 text-xs space-y-1.5 mb-6">
              <li className="flex items-center gap-2"><span className="text-violet-500">•</span> Instant summary and trade signal extraction</li>
              <li className="flex items-center gap-2"><span className="text-violet-500">•</span> Works on any public YouTube video</li>
              <li className="flex items-center gap-2"><span className="text-violet-500">•</span> Past briefs saved for quick reference</li>
            </ul>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 group-hover:gap-2.5 transition-all">
              Open briefs <span>→</span>
            </span>
          </button>

          {/* Card 4 — Analytics (admin only) */}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => onNavigate('analytics')}
              className="group text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-emerald-500 rounded-2xl p-8 transition-all duration-200 shadow-lg hover:shadow-emerald-900/20"
            >
              <div className="text-4xl mb-5">📊</div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2 group-hover:text-emerald-400 transition-colors">
                Analytics
              </h2>
              <ul className="text-zinc-500 text-xs space-y-1.5 mb-6">
                <li className="flex items-center gap-2"><span className="text-emerald-500">•</span> Visits, logins, and page views over time</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500">•</span> Per-user activity breakdown</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500">•</span> Admin action log</li>
              </ul>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 group-hover:gap-2.5 transition-all">
                View analytics <span>→</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
