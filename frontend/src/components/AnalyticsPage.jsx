import React, { useEffect, useState, useCallback } from 'react';
import { getAnalytics, getAnalyticsTimeseries, getActionLog, getVideoBriefErrors, getMarketBriefErrors } from '../api.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

// ── Shared small components ───────────────────────────────────────────────────

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
    blue:    { border: 'border-blue-500/40',    heading: 'text-blue-300',    val: 'text-blue-100'    },
    violet:  { border: 'border-violet-500/40',  heading: 'text-violet-300',  val: 'text-violet-100'  },
    emerald: { border: 'border-emerald-500/40', heading: 'text-emerald-300', val: 'text-emerald-100' },
    amber:   { border: 'border-amber-500/40',   heading: 'text-amber-300',   val: 'text-amber-100'   },
    zinc:    { border: 'border-zinc-500/40',    heading: 'text-zinc-400',    val: 'text-zinc-200'    },
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

function fmt(n) { return n == null ? '—' : n; }

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Errors tab components ─────────────────────────────────────────────────────

const PHASE_STYLES = {
  transcript: 'text-amber-400 bg-amber-900/30',
  ai:         'text-red-400 bg-red-900/30',
  timeout:    'text-orange-400 bg-orange-900/30',
  parse:      'text-purple-400 bg-purple-900/30',
  unexpected: 'text-zinc-400 bg-zinc-800',
};

function PhaseBadge({ phase }) {
  const cls = PHASE_STYLES[phase] || PHASE_STYLES.unexpected;
  return <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${cls}`}>{phase}</span>;
}

function PieWidget({ total, errors }) {
  const successful = Math.max(0, total - errors);
  const data = [
    { name: 'Successful', value: successful },
    { name: 'Errors',     value: errors },
  ];
  const COLORS = ['#10b981', '#ef4444'];
  const hasData = total > 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center gap-6">
      <div className="flex-shrink-0">
        {hasData ? (
          <PieChart width={140} height={140}>
            <Pie data={data} cx={70} cy={70} innerRadius={42} outerRadius={62} dataKey="value" startAngle={90} endAngle={-270}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
          </PieChart>
        ) : (
          <div className="w-[140px] h-[140px] flex items-center justify-center text-zinc-600 text-sm">No data</div>
        )}
      </div>
      <div>
        <p className="text-3xl font-bold text-zinc-100">{total}</p>
        <p className="text-xs text-zinc-500 mt-0.5 mb-3">Total requests</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-sm text-zinc-300">{successful} successful</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-sm text-zinc-300">{errors} errors</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  const start = Math.max(1, page - 2);
  const end   = Math.min(totalPages, start + 4);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center gap-1 justify-center mt-4">
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        className="px-2 py-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
        ←
      </button>
      {pages.map(p => (
        <button key={p} onClick={() => onPage(p)}
          className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${p === page ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
          {p}
        </button>
      ))}
      <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
        className="px-2 py-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
        →
      </button>
    </div>
  );
}

function PeriodToggle({ period, onChange }) {
  return (
    <div className="flex gap-1">
      {['day', 'week', 'month'].map(p => (
        <button key={p} onClick={() => onChange(p)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${period === p ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}>
          {p === 'day' ? 'Today' : p === 'week' ? 'Last 7 Days' : 'Last 30 Days'}
        </button>
      ))}
    </div>
  );
}

function SectionHeader({ title, count }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      {count != null && (
        <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded-full border border-zinc-700">{count}</span>
      )}
    </div>
  );
}

// ── Video Brief errors sub-tab ────────────────────────────────────────────────

function VideoBriefErrors({ period, onPeriodChange }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback((p, pg) => {
    setLoading(true);
    getVideoBriefErrors(p, pg)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(period, page); }, [period, page, load]);

  function handlePeriod(p) { onPeriodChange(p); setPage(1); }
  function handlePage(p)   { setPage(p); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Video Brief</h2>
        <PeriodToggle period={period} onChange={handlePeriod} />
      </div>

      {loading && <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" /></div>}

      {!loading && data && (
        <>
          {/* Pie + Rate Limit side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PieWidget total={data.pie.total} errors={data.pie.errors} />

            {/* Rate Limit Events */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">Rate Limit Events</span>
                <span className="text-xs font-mono text-zinc-500">grouped by user</span>
              </div>
              {data.rateLimitByUser.length === 0 ? (
                <p className="px-5 py-8 text-center text-zinc-500 text-sm">No rate limit events in this period.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-800/60">
                    <tr>
                      <Th>Username</Th>
                      <Th>Role</Th>
                      <Th right>Hits</Th>
                      <Th right>Last Hit</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {data.rateLimitByUser.map((r, i) => (
                      <tr key={i} className="hover:bg-zinc-800/40 transition-colors">
                        <Td><span className="font-medium text-zinc-100">{r.username}</span></Td>
                        <Td muted>{r.role}</Td>
                        <Td right><span className="font-bold text-red-400">{r.hits}</span></Td>
                        <Td right muted>{fmtDate(r.last_hit)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Analysis Error Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <SectionHeader title="Analysis Errors" count={data.pie.errors} />
            </div>
            {data.errors.length === 0 ? (
              <p className="px-5 py-8 text-center text-zinc-500 text-sm">No analysis errors in this period.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-800/60">
                      <tr>
                        <Th>Username</Th>
                        <Th>Video URL</Th>
                        <Th>Phase</Th>
                        <Th>Error</Th>
                        <Th right>Time</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {data.errors.map(e => (
                        <tr key={e.id} className="hover:bg-zinc-800/40 transition-colors">
                          <Td><span className="font-medium text-zinc-100">{e.username}</span></Td>
                          <Td>
                            <a href={e.url} target="_blank" rel="noopener noreferrer"
                              className="text-violet-400 hover:underline text-xs max-w-[200px] block truncate">
                              {e.url}
                            </a>
                          </Td>
                          <Td><PhaseBadge phase={e.phase} /></Td>
                          <Td muted><span className="text-xs">{e.error}</span></Td>
                          <Td right muted>{fmtDate(e.created_at)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3">
                  <Pagination page={page} totalPages={data.errorTotalPages} onPage={handlePage} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Market Brief errors sub-tab ───────────────────────────────────────────────

function MarketBriefErrors({ period, onPeriodChange }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback((p, pg) => {
    setLoading(true);
    getMarketBriefErrors(p, pg)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(period, page); }, [period, page, load]);

  function handlePeriod(p) { onPeriodChange(p); setPage(1); }
  function handlePage(p)   { setPage(p); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Market Brief</h2>
        <PeriodToggle period={period} onChange={handlePeriod} />
      </div>

      {loading && <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" /></div>}

      {!loading && data && (
        <>
          {/* Pie + Channel RSS side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PieWidget total={data.pie.total} errors={data.pie.errors} />

            {/* Channel Feed Errors */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">Channel Feed Errors</span>
                <span className="text-xs font-mono text-zinc-500">grouped by channel</span>
              </div>
              {data.channelErrors.length === 0 ? (
                <p className="px-5 py-8 text-center text-zinc-500 text-sm">No channel feed errors in this period.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-800/60">
                    <tr>
                      <Th>Channel</Th>
                      <Th right>Failures</Th>
                      <Th>Last Error</Th>
                      <Th right>Last Failure</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {data.channelErrors.map((r, i) => (
                      <tr key={i} className="hover:bg-zinc-800/40 transition-colors">
                        <Td><span className="font-medium text-zinc-100">{r.channel_name}</span></Td>
                        <Td right><span className="font-bold text-red-400">{r.failures}</span></Td>
                        <Td muted><span className="text-xs">{r.last_error}</span></Td>
                        <Td right muted>{fmtDate(r.last_failure)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Video Analysis Error Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <SectionHeader title="Video Analysis Errors" count={data.pie.errors} />
            </div>
            {data.errors.length === 0 ? (
              <p className="px-5 py-8 text-center text-zinc-500 text-sm">No video analysis errors in this period.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-800/60">
                      <tr>
                        <Th>Channel</Th>
                        <Th>Video</Th>
                        <Th>Phase</Th>
                        <Th>Error</Th>
                        <Th right>Time</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {data.errors.map(e => (
                        <tr key={e.id} className="hover:bg-zinc-800/40 transition-colors">
                          <Td><span className="font-medium text-zinc-100">{e.channel_name}</span></Td>
                          <Td>
                            <a href={e.video_url} target="_blank" rel="noopener noreferrer"
                              className="text-violet-400 hover:underline text-xs max-w-[180px] block truncate">
                              {e.video_title}
                            </a>
                          </Td>
                          <Td><PhaseBadge phase={e.phase} /></Td>
                          <Td muted><span className="text-xs">{e.error}</span></Td>
                          <Td right muted>{fmtDate(e.created_at)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3">
                  <Pagination page={page} totalPages={data.errorTotalPages} onPage={handlePage} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Usage tab data ─────────────────────────────────────────────────────────────

const SERIES = [
  { key: 'market_brief_requests',    label: 'Market Brief Requests', color: '#818cf8' },
  { key: 'market_brief_us_views',    label: 'Market US Visits',      color: '#60a5fa' },
  { key: 'market_brief_india_views', label: 'Market India Visits',   color: '#f97316' },
  { key: 'healthy_brief_views',      label: 'Health Brief Visits',   color: '#10b981' },
  { key: 'video_in_brief_views',     label: 'Video Brief Visits',    color: '#34d399' },
  { key: 'briefs_generated',         label: 'Briefs Generated',      color: '#a78bfa' },
  { key: 'logins',                   label: 'Logins',                color: '#fbbf24' },
  { key: 'landing_views',            label: 'Landing Visits',        color: '#f472b6' },
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

const ACTION_LABELS = {
  add_channel:         { label: 'Add Channel',     color: 'text-emerald-400' },
  delete_channel:      { label: 'Delete Channel',  color: 'text-red-400'     },
  refresh_channel:     { label: 'Refresh Channel', color: 'text-blue-400'    },
  unsubscribe_channel: { label: 'Unsubscribe',     color: 'text-amber-400'   },
  subscribe_channel:   { label: 'Resubscribe',     color: 'text-emerald-400' },
  reanalyze_video:     { label: 'Reanalyze Video', color: 'text-violet-400'  },
  summarize_video:     { label: 'Summarize Video', color: 'text-zinc-300'    },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalyticsPage({ onBack, onLogout }) {
  const [data, setData]           = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [period, setPeriod]       = useState('week');
  const [ts, setTs]               = useState(null);
  const [actionLog, setActionLog] = useState(null);

  const [activeTab, setActiveTab]       = useState('usage');
  const [errorsSubTab, setErrorsSubTab] = useState('video-brief');
  const [errorsPeriod, setErrorsPeriod] = useState('week');

  useEffect(() => {
    getAnalytics().then(setData).catch(e => setLoadError(e.message));
    getActionLog().then(setActionLog).catch(() => {});
  }, []);

  useEffect(() => {
    getAnalyticsTimeseries(period).then(setTs).catch(() => {});
  }, [period]);

  const tabCls = (t) => `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    activeTab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
  }`;
  const subTabCls = (t) => `px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
    errorsSubTab === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
  }`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 text-zinc-100 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors">
            ← Back
          </button>
          <span className="text-zinc-100 font-semibold ml-1">Analytics</span>
          <span className="text-xs bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded font-mono">admin</span>
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
            <button onClick={onLogout} className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 text-zinc-100 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors">
              Sign out
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Top-level tab bar */}
        <div className="flex gap-2 mb-6">
          <button className={tabCls('usage')} onClick={() => setActiveTab('usage')}>Usage</button>
          <button className={tabCls('errors')} onClick={() => setActiveTab('errors')}>Errors</button>
        </div>

        {/* ── Usage tab ── */}
        {activeTab === 'usage' && (
          <div className="space-y-8">
            {loadError && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">{loadError}</div>
            )}
            {!data && !loadError && (
              <div className="flex items-center justify-center py-24">
                <div className="w-7 h-7 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
            {data && (
              <>
                {/* Summary stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Unique Visitors Today" value={data.unique_visitors_today} sub="distinct users" />
                  <StatCard label="Logins Today" value={data.logins_today} sub="successful logins" />
                  <StatCard label="Total Users" value={data.total_users} sub="registered accounts" />
                  <StatCard label="Briefs This Month" value={data.briefs_this_month} sub="video in briefs generated" />
                </div>

                {/* Group cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
                  <GroupCard label="Logins"               color="amber"   today={data.logins_today}                       week={data.logins_week}                    month={data.logins_month} />
                  <GroupCard label="Guest Visits"         color="zinc"    today={data.guest_visits?.today}                 week={data.guest_visits?.week}              month={data.guest_visits?.month} />
                  <GroupCard label="Landing Visits"       color="blue"    today={data.landing_views?.today}                week={data.landing_views?.week}             month={data.landing_views?.month} />
                  <GroupCard label="Market Brief 🇺🇸 US"  color="blue"    today={data.market_brief_us_views?.today}        week={data.market_brief_us_views?.week}     month={data.market_brief_us_views?.month} />
                  <GroupCard label="Market Brief 🇮🇳 India" color="amber" today={data.market_brief_india_views?.today}     week={data.market_brief_india_views?.week}  month={data.market_brief_india_views?.month} />
                  <GroupCard label="Health Brief Visits"  color="emerald" today={data.healthy_brief_views?.today}          week={data.healthy_brief_views?.week}       month={data.healthy_brief_views?.month} />
                  <GroupCard label="Video Brief Visits"   color="emerald" today={data.video_in_brief_views?.today}         week={data.video_in_brief_views?.week}      month={data.video_in_brief_views?.month} />
                </div>

                {/* Activity chart */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-semibold text-zinc-100">Activity Over Time</h2>
                    <div className="flex gap-1">
                      {['today', 'week', 'month'].map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${period === p ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}>
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
                        <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#a1a1aa' }} />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                        {SERIES.map(({ key, label, color }) => (
                          <Line key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={2} dot={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px]">
                      <div className="w-6 h-6 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Users by activity table */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-100">Users by Activity</h2>
                    <span className="text-xs text-zinc-500 font-mono">up to 25</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-zinc-800/60">
                        <tr>
                          <Th>#</Th><Th>User</Th>
                          <Th right>Today</Th><Th right>Week</Th><Th right>Month</Th>
                          <Th right>Today</Th><Th right>Week</Th><Th right>Month</Th>
                          <Th right>Today</Th><Th right>Week</Th><Th right>Month</Th>
                          <Th right>Today</Th><Th right>Week</Th><Th right>Month</Th>
                          <Th right>Today</Th><Th right>Week</Th><Th right>Month</Th>
                          <Th right>Today</Th><Th right>Week</Th><Th right>Month</Th>
                        </tr>
                        <tr>
                          <td colSpan={2} />
                          <td colSpan={3} className="px-3 pb-1.5 text-xs text-amber-400/70 font-medium uppercase tracking-wide whitespace-nowrap">── Logins ───────────</td>
                          <td colSpan={3} className="px-3 pb-1.5 text-xs text-blue-400/70 font-medium uppercase tracking-wide whitespace-nowrap">── Landing Visits ───</td>
                          <td colSpan={3} className="px-3 pb-1.5 text-xs text-violet-400/70 font-medium uppercase tracking-wide whitespace-nowrap">── Market Brief ─────</td>
                          <td colSpan={3} className="px-3 pb-1.5 text-xs text-teal-400/70 font-medium uppercase tracking-wide whitespace-nowrap">── Health Brief ─────</td>
                          <td colSpan={3} className="px-3 pb-1.5 text-xs text-emerald-400/70 font-medium uppercase tracking-wide whitespace-nowrap">── Video Brief Visits</td>
                          <td colSpan={3} className="px-3 pb-1.5 text-xs text-zinc-400/70 font-medium uppercase tracking-wide whitespace-nowrap">── Video Briefs Requested</td>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {data.users.map((u, i) => (
                          <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                            <Td muted>{i + 1}</Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-zinc-100">{u.username}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${u.role === 'admin' ? 'bg-blue-600/30 text-blue-300' : 'bg-zinc-700 text-zinc-400'}`}>{u.role}</span>
                              </div>
                            </Td>
                            <Td right>{fmt(u.logins_today)}</Td><Td right muted>{fmt(u.logins_week)}</Td><Td right muted>{fmt(u.logins_month)}</Td>
                            <Td right>{fmt(u.landing_today)}</Td><Td right muted>{fmt(u.landing_week)}</Td><Td right muted>{fmt(u.landing_month)}</Td>
                            <Td right>{fmt(u.market_today)}</Td><Td right muted>{fmt(u.market_week)}</Td><Td right muted>{fmt(u.market_month)}</Td>
                            <Td right>{fmt(u.healthy_today)}</Td><Td right muted>{fmt(u.healthy_week)}</Td><Td right muted>{fmt(u.healthy_month)}</Td>
                            <Td right>{fmt(u.vib_today)}</Td><Td right muted>{fmt(u.vib_week)}</Td><Td right muted>{fmt(u.vib_month)}</Td>
                            <Td right>{fmt(u.briefs_today)}</Td><Td right muted>{fmt(u.briefs_week)}</Td><Td right muted>{fmt(u.briefs_month)}</Td>
                          </tr>
                        ))}
                        {data.users.length === 0 && (
                          <tr><td colSpan={20} className="px-5 py-10 text-center text-zinc-500 text-sm">No user activity yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Action log */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                    <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">Action Log</h2>
                    <span className="text-xs text-zinc-500 font-mono">last 50</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-zinc-800/60">
                        <tr><Th>Time</Th><Th>User</Th><Th>Action</Th><Th>Target</Th></tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {(actionLog || []).map(row => {
                          const meta = ACTION_LABELS[row.action] || { label: row.action, color: 'text-zinc-400' };
                          return (
                            <tr key={row.id} className="hover:bg-zinc-800/40 transition-colors">
                              <Td muted>{new Date(row.created_at).toLocaleString()}</Td>
                              <Td>
                                <span className="font-medium text-zinc-100">{row.username}</span>
                                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded font-mono ${row.role === 'admin' ? 'bg-blue-600/30 text-blue-300' : 'bg-zinc-700 text-zinc-400'}`}>{row.role}</span>
                              </Td>
                              <Td><span className={`font-medium ${meta.color}`}>{meta.label}</span></Td>
                              <Td muted>{row.target || '—'}</Td>
                            </tr>
                          );
                        })}
                        {actionLog && actionLog.length === 0 && (
                          <tr><td colSpan={4} className="px-5 py-10 text-center text-zinc-500 text-sm">No actions logged yet.</td></tr>
                        )}
                        {!actionLog && (
                          <tr><td colSpan={4} className="px-5 py-6 text-center text-zinc-600 text-sm">Loading…</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Errors tab ── */}
        {activeTab === 'errors' && (
          <div className="space-y-6">
            {/* Sub-tab bar */}
            <div className="flex gap-2">
              <button className={subTabCls('video-brief')} onClick={() => setErrorsSubTab('video-brief')}>Video Brief</button>
              <button className={subTabCls('market-brief')} onClick={() => setErrorsSubTab('market-brief')}>Market Brief</button>
            </div>

            {errorsSubTab === 'video-brief' && (
              <VideoBriefErrors period={errorsPeriod} onPeriodChange={setErrorsPeriod} />
            )}
            {errorsSubTab === 'market-brief' && (
              <MarketBriefErrors period={errorsPeriod} onPeriodChange={setErrorsPeriod} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
