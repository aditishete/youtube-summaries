import React, { useEffect, useState, useCallback } from 'react';
import { getAnalytics, getAnalyticsTimeseries } from '../api.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-zinc-100">{value ?? '—'}</p>
      {sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function GroupCard({ label, color, today, week, month }) {
  const colors = {
    blue:   { border: 'border-blue-500/40',   heading: 'text-blue-300',   val: 'text-blue-100'   },
    violet: { border: 'border-violet-500/40', heading: 'text-violet-300', val: 'text-violet-100' },
    emerald:{ border: 'border-emerald-500/40',heading: 'text-emerald-300',val: 'text-emerald-100' },
    amber:  { border: 'border-amber-500/40',  heading: 'text-amber-300',  val: 'text-amber-100'  },
  };
  const { border, heading, val } = colors[color] || colors.blue;
  return (
    <div className={`bg-zinc-900 border ${border} rounded-xl p-5`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-4 ${heading}`}>{label}</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[['Today', today], ['This Week', week], ['This Month', month]].map(([period, n]) => (
          <div key={period}>
            <p className={`text-2xl font-bold ${val}`}>{n ?? '—'}</p>
            <p className="text-zinc-500 text-xs mt-0.5">{period}</p>
          </div>
        ))}
      </div>
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

const SERIES = [
  { key: 'market_brief_requests', label: 'Market Brief Requests', color: '#818cf8' },
  { key: 'market_brief_views',    label: 'Market Brief Visits',   color: '#60a5fa' },
  { key: 'video_in_brief_views',  label: 'Video Brief Visits',    color: '#34d399' },
  { key: 'briefs_generated',      label: 'Briefs Generated',      color: '#a78bfa' },
  { key: 'logins',                label: 'Logins',                color: '#fbbf24' },
  { key: 'landing_views',         label: 'Landing Visits',        color: '#f472b6' },
];

function mergeTimeseries(ts) {
  const map = {};
  for (const { key } of SERIES) {
    for (const { t, n } of (ts[key] || [])) {
      if (!map[t]) map[t] = { t };
      map[t][key] = n;
    }
  }
  return Object.values(map).sort((a, b) => a.t.localeCompare(b.t));
}

export default function AnalyticsPage({ onBack, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('week');
  const [ts, setTs] = useState(null);

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    getAnalyticsTimeseries(period)
      .then(setTs)
      .catch(() => {});
  }, [period]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            ← Back
          </button>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-100 font-semibold">Analytics</span>
          <span className="text-xs bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded font-mono">admin</span>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800">
            Sign out
          </button>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">{error}</div>
        )}

        {!data && !error && (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {data && (
          <>
            {/* Top summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Unique Visitors Today" value={data.unique_visitors_today} sub="distinct users" />
              <StatCard label="Logins Today" value={data.logins_today} sub="successful logins" />
              <StatCard label="Total Users" value={data.total_users} sub="registered accounts" />
              <StatCard label="Briefs This Month" value={data.briefs_this_month} sub="video in briefs generated" />
            </div>

            {/* Logins + Page views breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <GroupCard
                label="Logins"
                color="amber"
                today={data.logins_today}
                week={data.logins_week}
                month={data.logins_month}
              />
              <GroupCard
                label="Landing Visits"
                color="blue"
                today={data.landing_views?.today}
                week={data.landing_views?.week}
                month={data.landing_views?.month}
              />
              <GroupCard
                label="Market Brief Visits"
                color="violet"
                today={data.market_brief_views?.today}
                week={data.market_brief_views?.week}
                month={data.market_brief_views?.month}
              />
              <GroupCard
                label="Video Brief Visits"
                color="emerald"
                today={data.video_in_brief_views?.today}
                week={data.video_in_brief_views?.week}
                month={data.video_in_brief_views?.month}
              />
            </div>

            {/* Activity chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-zinc-100">Activity Over Time</h2>
                <div className="flex gap-1">
                  {['today', 'week', 'month'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        period === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                      }`}
                    >
                      {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 Days' : 'Last 30 Days'}
                    </button>
                  ))}
                </div>
              </div>
              {ts ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mergeTimeseries(ts)} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="t" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#a1a1aa' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                    {SERIES.map(({ key, label, color }) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={label}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="w-6 h-6 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* User table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">Users by Activity</h2>
                <span className="text-xs text-zinc-500 font-mono">up to 25</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-800/60">
                    <tr>
                      <Th>#</Th>
                      <Th>User</Th>
                      {/* Logins */}
                      <Th right>Today</Th>
                      <Th right>Week</Th>
                      <Th right>Month</Th>
                      {/* Landing */}
                      <Th right>Today</Th>
                      <Th right>Week</Th>
                      <Th right>Month</Th>
                      {/* Market Brief */}
                      <Th right>Today</Th>
                      <Th right>Week</Th>
                      <Th right>Month</Th>
                      {/* Video In Brief */}
                      <Th right>Today</Th>
                      <Th right>Week</Th>
                      <Th right>Month</Th>
                      {/* Briefs generated */}
                      <Th right>Today</Th>
                      <Th right>Week</Th>
                      <Th right>Month</Th>
                    </tr>
                    <tr>
                      <td colSpan={2} />
                      <td colSpan={3} className="px-3 pb-1.5 text-xs text-amber-400/70 font-medium uppercase tracking-wide whitespace-nowrap">
                        ── Logins ────────────
                      </td>
                      <td colSpan={3} className="px-3 pb-1.5 text-xs text-blue-400/70 font-medium uppercase tracking-wide whitespace-nowrap">
                        ── Landing Visits ────
                      </td>
                      <td colSpan={3} className="px-3 pb-1.5 text-xs text-violet-400/70 font-medium uppercase tracking-wide whitespace-nowrap">
                        ── Market Brief Visits
                      </td>
                      <td colSpan={3} className="px-3 pb-1.5 text-xs text-emerald-400/70 font-medium uppercase tracking-wide whitespace-nowrap">
                        ── Video Brief Visits─
                      </td>
                      <td colSpan={3} className="px-3 pb-1.5 text-xs text-zinc-400/70 font-medium uppercase tracking-wide whitespace-nowrap">
                        ── Video Briefs Requested
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
                              u.role === 'admin' ? 'bg-blue-600/30 text-blue-300' : 'bg-zinc-700 text-zinc-400'
                            }`}>{u.role}</span>
                          </div>
                        </Td>
                        {/* Logins */}
                        <Td right>{fmt(u.logins_today)}</Td>
                        <Td right muted>{fmt(u.logins_week)}</Td>
                        <Td right muted>{fmt(u.logins_month)}</Td>
                        {/* Landing */}
                        <Td right>{fmt(u.landing_today)}</Td>
                        <Td right muted>{fmt(u.landing_week)}</Td>
                        <Td right muted>{fmt(u.landing_month)}</Td>
                        {/* Market Brief */}
                        <Td right>{fmt(u.market_today)}</Td>
                        <Td right muted>{fmt(u.market_week)}</Td>
                        <Td right muted>{fmt(u.market_month)}</Td>
                        {/* Video In Brief */}
                        <Td right>{fmt(u.vib_today)}</Td>
                        <Td right muted>{fmt(u.vib_week)}</Td>
                        <Td right muted>{fmt(u.vib_month)}</Td>
                        {/* Briefs generated */}
                        <Td right>{fmt(u.briefs_today)}</Td>
                        <Td right muted>{fmt(u.briefs_week)}</Td>
                        <Td right muted>{fmt(u.briefs_month)}</Td>
                      </tr>
                    ))}
                    {data.users.length === 0 && (
                      <tr>
                        <td colSpan={17} className="px-5 py-10 text-center text-zinc-500 text-sm">
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
