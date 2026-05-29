import React from 'react';

export default function LandingPage({ currentUser, onNavigate, onLogout }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-zinc-100">MarketBrief</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">
            Signed in as <span className="text-zinc-200 font-medium">{currentUser?.username}</span>
          </span>
          <button
            onClick={onLogout}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="flex flex-col items-center justify-center flex-1 px-6 py-16">
        <h1 className="text-4xl font-bold text-zinc-100 mb-3 text-center">What would you like to do?</h1>
        <p className="text-zinc-400 text-lg mb-14 text-center max-w-lg">
          Track investment channels and get AI-powered trade signals, or get an instant brief on any YouTube video.
        </p>

        <div className={`grid grid-cols-1 gap-6 w-full max-w-3xl ${currentUser?.role === 'admin' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {/* Card 1 — Market Feed */}
          <button
            onClick={() => onNavigate('dashboard')}
            className="group text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500 rounded-2xl p-8 transition-all duration-200 shadow-lg hover:shadow-blue-900/20"
          >
            <div className="text-4xl mb-5">📈</div>
            <h2 className="text-xl font-bold text-zinc-100 mb-2 group-hover:text-blue-400 transition-colors">
              Market Feed
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              Track YouTube investment channels. Get AI-generated summaries, ticker mentions, and
              BUY / SELL / WATCH signals from the latest videos.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 group-hover:gap-2.5 transition-all">
              Open feed <span>→</span>
            </span>
          </button>

          {/* Card 2 — Video Brief */}
          <button
            onClick={() => onNavigate('summarize')}
            className="group text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-violet-500 rounded-2xl p-8 transition-all duration-200 shadow-lg hover:shadow-violet-900/20"
          >
            <div className="text-4xl mb-5">▶️</div>
            <h2 className="text-xl font-bold text-zinc-100 mb-2 group-hover:text-violet-400 transition-colors">
              Video Brief
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              Paste any YouTube URL and get an instant AI summary of the main points — in English,
              regardless of the original language.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 group-hover:gap-2.5 transition-all">
              Get a video brief <span>→</span>
            </span>
          </button>
          {/* Card 3 — Analytics (admin only) */}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => onNavigate('analytics')}
              className="group text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-emerald-500 rounded-2xl p-8 transition-all duration-200 shadow-lg hover:shadow-emerald-900/20"
            >
              <div className="text-4xl mb-5">📊</div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2 group-hover:text-emerald-400 transition-colors">
                Analytics
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                View user activity, visit counts, and video brief usage across all accounts.
              </p>
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
