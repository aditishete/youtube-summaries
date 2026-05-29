import React, { useEffect, useState } from 'react';
import { getAnalytics } from '../api.js';

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-zinc-100">{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th className={`px-3 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function Td({ children, right, muted }) {
  return (
    <td className={`px-3 py-2.5 text-sm whitespace-nowrap ${right ? 'text-right' : ''} ${muted ? 'text-zinc-500' : 'text-zinc-200'}`}>
      {children}
    </td>
  );
}

function fmt(n) {
  return n == null ? '—' : n;
}

export default function AnalyticsPage({ onBack, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ← Back
          </button>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-100 font-semibold">Analytics</span>
          <span className="text-xs bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded font-mono">admin</span>
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
          >
            Sign out
          </button>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {data && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <StatCard
                label="Total Users"
                value={data.total_users}
                sub="registered accounts"
              />
              <StatCard
                label="Visits Today"
                value={data.visits_today}
                sub="across all users"
              />
              <StatCard
                label="Briefs This Month"
                value={data.briefs_this_month}
                sub="video briefs generated"
              />
            </div>

            {/* User table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">Top Users by Activity</h2>
                <span className="text-xs text-zinc-500 font-mono">up to 25</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-800/60">
                    <tr>
                      <Th>#</Th>
                      <Th>User</Th>
                      <Th right>Total Visits</Th>
                      <Th right>Visits/Day</Th>
                      <Th right>Today</Th>
                      <Th right>Week</Th>
                      <Th right>Month</Th>
                      <Th right>Total Briefs</Th>
                      <Th right>Briefs/Day</Th>
                      <Th right>Today</Th>
                      <Th right>Week</Th>
                      <Th right>Month</Th>
                    </tr>
                    <tr>
                      <td colSpan={2} />
                      <td colSpan={5} className="px-3 pb-1.5 text-xs text-blue-400/70 font-medium uppercase tracking-wide">
                        ── Visits ──────────────────
                      </td>
                      <td colSpan={5} className="px-3 pb-1.5 text-xs text-violet-400/70 font-medium uppercase tracking-wide">
                        ── Video Briefs ─────────────
                      </td>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {data.users.map((u, i) => (
                      <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                        <Td muted>{i + 1}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-100">{u.username}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                              u.role === 'admin'
                                ? 'bg-blue-600/30 text-blue-300'
                                : 'bg-zinc-700 text-zinc-400'
                            }`}>
                              {u.role}
                            </span>
                          </div>
                        </Td>
                        <Td right>{fmt(u.total_visits)}</Td>
                        <Td right muted>{u.visits_per_day}</Td>
                        <Td right>{fmt(u.visits_today)}</Td>
                        <Td right muted>{fmt(u.visits_week)}</Td>
                        <Td right muted>{fmt(u.visits_month)}</Td>
                        <Td right>{fmt(u.total_briefs)}</Td>
                        <Td right muted>{u.briefs_per_day}</Td>
                        <Td right>{fmt(u.briefs_today)}</Td>
                        <Td right muted>{fmt(u.briefs_week)}</Td>
                        <Td right muted>{fmt(u.briefs_month)}</Td>
                      </tr>
                    ))}
                    {data.users.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-5 py-10 text-center text-zinc-500 text-sm">
                          No user activity yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
