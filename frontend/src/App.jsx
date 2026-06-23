import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import VideoFeed from './components/VideoFeed.jsx';
import AddChannelModal from './components/AddChannelModal.jsx';
import LoginPage from './components/LoginPage.jsx';
import RegisterPage from './components/RegisterPage.jsx';
import LandingPage from './components/LandingPage.jsx';
import SummarizePage from './components/SummarizePage.jsx';
import AnalyticsPage from './components/AnalyticsPage.jsx';
import { getChannels, getVideos, getVideo, addChannel, deleteChannel, deleteVideo, refreshChannel, reanalyzeChannel, setChannelSubscription, getMe, trackPageView, claimSharedSummary } from './api.js';
import { MAX_VIDEOS_PER_CHANNEL, MAX_RETAINED_VIDEOS_PER_CHANNEL } from './config.js';

export default function App() {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('checking');
  const [currentUser, setCurrentUser] = useState(null);
  const [authPage, setAuthPage] = useState('login');
  const [appPage, setAppPage] = useState(() => localStorage.getItem('appPage') || 'landing');
  const [hasPendingShare, setHasPendingShare] = useState(
    () => !!new URLSearchParams(window.location.search).get('share') || !!sessionStorage.getItem('pendingShareToken')
  );
  const [pendingShareToken, setPendingShareToken] = useState(null);
  const [claimedShareToken, setClaimedShareToken] = useState(null);
  const [hasPendingVideoLink, setHasPendingVideoLink] = useState(
    () => !!new URLSearchParams(window.location.search).get('video') || !!sessionStorage.getItem('pendingVideoId')
  );
  const [pendingVideoId, setPendingVideoId] = useState(null);
  const [targetVideoId, setTargetVideoId] = useState(null);

  // ── Dashboard state ─────────────────────────────────────────────────────────
  // category is derived from appPage — always in sync, survives refresh
  const category = appPage === 'healthy' ? 'healthy' : 'market';
  // market tab: only meaningful when category === 'market'; persisted across refreshes
  const [market, setMarket] = useState(() => localStorage.getItem('marketTab') || 'us');
  // effectiveMarket: only pass market filter for market briefs, not health
  const effectiveMarket = category === 'market' ? market : null;

  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Persist market tab selection
  useEffect(() => { localStorage.setItem('marketTab', market); }, [market]);

  // ── Detect share token / video link in URL on first load ────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share') || sessionStorage.getItem('pendingShareToken');
    const videoId = params.get('video') || sessionStorage.getItem('pendingVideoId');
    if (!shareToken && !videoId) return;
    if (shareToken) sessionStorage.setItem('pendingShareToken', shareToken);
    if (videoId) sessionStorage.setItem('pendingVideoId', videoId);
    if (params.has('share') || params.has('video')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (authStatus === 'authenticated') {
      if (shareToken) {
        sessionStorage.removeItem('pendingShareToken');
        setHasPendingShare(false);
        setPendingShareToken(shareToken);
      }
      if (videoId) {
        sessionStorage.removeItem('pendingVideoId');
        setHasPendingVideoLink(false);
        setPendingVideoId(parseInt(videoId, 10));
      }
    }
  }, [authStatus]);

  // ── Claim pending share token ────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus !== 'authenticated' || !pendingShareToken) return;
    const token = pendingShareToken;
    setPendingShareToken(null);
    claimSharedSummary(token)
      .then(({ result }) => { if (result?.share_token) setClaimedShareToken(result.share_token); })
      .catch(() => {})
      .finally(() => setAppPage('summarize'));
  }, [authStatus, pendingShareToken]);

  // ── Resolve pending video link ───────────────────────────────────────────────
  useEffect(() => {
    if (authStatus !== 'authenticated' || !pendingVideoId || loading) return;
    const id = pendingVideoId;
    setPendingVideoId(null);
    const found = videos.find(v => v.id === id);
    if (found) {
      setSelectedChannelId(null);
      setTargetVideoId(id);
      setAppPage('dashboard');
      setTimeout(() => setTargetVideoId(null), 4000);
    } else {
      getVideo(id)
        .then(video => {
          setSelectedChannelId(video.channel_id);
          setTargetVideoId(id);
          setAppPage('dashboard');
          setTimeout(() => setTargetVideoId(null), 4000);
        })
        .catch(() => setAppPage('dashboard'));
    }
  }, [authStatus, pendingVideoId, loading, videos]);

  // ── Backend readiness ping ───────────────────────────────────────────────────
  const [backendReady, setBackendReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      while (!cancelled) {
        try {
          const res = await fetch('/api/health');
          if (res.ok) { if (!cancelled) setBackendReady(true); return; }
        } catch {}
        await new Promise(r => setTimeout(r, 1500));
      }
    };
    ping();
    return () => { cancelled = true; };
  }, []);

  // ── Auth: check token ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!backendReady) return;
    const token = localStorage.getItem('token');
    if (!token) { setAuthStatus('unauthenticated'); return; }
    getMe()
      .then(({ user }) => { setCurrentUser(user); setAuthStatus('authenticated'); })
      .catch(() => { localStorage.removeItem('token'); setAuthStatus('unauthenticated'); });
  }, [backendReady]);

  // ── Auth: 401 logout ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleAuthLogout = () => {
      localStorage.removeItem('token');
      setCurrentUser(null);
      setAuthStatus('unauthenticated');
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, []);

  useEffect(() => {
    localStorage.setItem('appPage', appPage);
    if (authStatus === 'authenticated') {
      const pageMap = { landing: 'landing', dashboard: 'market_brief', healthy: 'healthy_brief', summarize: 'video_in_brief' };
      if (pageMap[appPage]) trackPageView(pageMap[appPage]);
      if (appPage === 'dashboard') trackPageView(market === 'india' ? 'market_brief_india' : 'market_brief_us');
    }
  }, [appPage, authStatus, market]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.setItem('appPage', 'landing');
    setCurrentUser(null);
    setAuthStatus('unauthenticated');
    setAuthPage('login');
    setAppPage('landing');
  }, []);

  const handleLoginSuccess = useCallback((user) => {
    setCurrentUser(user);
    setAuthStatus('authenticated');
    const shareToken = sessionStorage.getItem('pendingShareToken');
    const videoId = sessionStorage.getItem('pendingVideoId');
    if (shareToken) {
      sessionStorage.removeItem('pendingShareToken');
      setHasPendingShare(false);
      setPendingShareToken(shareToken);
    } else if (videoId) {
      sessionStorage.removeItem('pendingVideoId');
      setHasPendingVideoLink(false);
      setPendingVideoId(parseInt(videoId, 10));
    } else {
      setAppPage('landing');
    }
  }, []);

  const handleRegisterSuccess = useCallback((user) => {
    setCurrentUser(user);
    setAuthStatus('authenticated');
    const shareToken = sessionStorage.getItem('pendingShareToken');
    const videoId = sessionStorage.getItem('pendingVideoId');
    if (shareToken) {
      sessionStorage.removeItem('pendingShareToken');
      setHasPendingShare(false);
      setPendingShareToken(shareToken);
    } else if (videoId) {
      sessionStorage.removeItem('pendingVideoId');
      setHasPendingVideoLink(false);
      setPendingVideoId(parseInt(videoId, 10));
    } else {
      setAppPage('landing');
    }
  }, []);

  // ── Dashboard data loading ───────────────────────────────────────────────────
  const loadChannels = useCallback(async (cat, mkt = null) => {
    try {
      const data = await getChannels(cat, mkt);
      setChannels(data);
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  }, []);

  const loadVideos = useCallback(async (channelId = null, auto = false, cat = 'market', mkt = null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVideos(channelId, 50, 0, auto, cat, mkt);
      setVideos(data.videos || []);
    } catch (err) {
      console.error('Failed to load videos:', err);
      setError('Failed to load videos. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when auth resolves, category changes, or market tab changes
  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadChannels(category, effectiveMarket);
      loadVideos(null, false, category, effectiveMarket);
    }
  }, [authStatus, loadChannels, loadVideos, category, market]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload videos when selected channel changes
  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadVideos(selectedChannelId, false, category, effectiveMarket);
    }
  }, [selectedChannelId, loadVideos, authStatus, category, market]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 15 minutes on feed pages
  useEffect(() => {
    if (authStatus !== 'authenticated' || (appPage !== 'dashboard' && appPage !== 'healthy')) return;
    const id = setInterval(() => {
      loadChannels(category, effectiveMarket);
      loadVideos(selectedChannelId, true, category, effectiveMarket);
    }, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [authStatus, appPage, selectedChannelId, loadChannels, loadVideos, category, market]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = useCallback((page) => {
    setSelectedChannelId(null);
    setAppPage(page);
  }, []);

  const handleMarketChange = useCallback((m) => {
    setMarket(m);
    setSelectedChannelId(null);
    trackPageView(m === 'india' ? 'market_brief_india' : 'market_brief_us');
  }, []);

  const handleChannelAdded = useCallback(async (url) => {
    const result = await addChannel(url, category, effectiveMarket || 'us');
    await loadChannels(category, effectiveMarket);
    await loadVideos(selectedChannelId, false, category, effectiveMarket);
    return result;
  }, [loadChannels, loadVideos, selectedChannelId, category, effectiveMarket]);

  const handleChannelDeleted = useCallback(async (id) => {
    try {
      await deleteChannel(id);
      if (selectedChannelId === id) setSelectedChannelId(null);
      await loadChannels(category, effectiveMarket);
      await loadVideos(selectedChannelId === id ? null : selectedChannelId, false, category, effectiveMarket);
    } catch (err) {
      console.error('Failed to delete channel:', err);
    }
  }, [loadChannels, loadVideos, selectedChannelId, category, effectiveMarket]);

  const handleToggleSubscription = useCallback(async (id, subscribed) => {
    try {
      await setChannelSubscription(id, subscribed);
      await loadChannels(category, effectiveMarket);
    } catch (err) {
      console.error('Failed to update subscription:', err);
    }
  }, [loadChannels, category, effectiveMarket]);

  const handleDeleteVideo = useCallback(async (id) => {
    try {
      await deleteVideo(id);
      await loadVideos(selectedChannelId, false, category, effectiveMarket);
      await loadChannels(category, effectiveMarket);
    } catch (err) {
      console.error('Failed to delete video:', err);
    }
  }, [loadVideos, loadChannels, selectedChannelId, category, effectiveMarket]);

  const handleRefreshChannel = useCallback(async (id) => {
    try {
      await refreshChannel(id);
      await loadChannels(category, effectiveMarket);
      await loadVideos(selectedChannelId, false, category, effectiveMarket);
    } catch (err) {
      console.error('Failed to refresh channel:', err);
    }
  }, [loadChannels, loadVideos, selectedChannelId, category, effectiveMarket]);

  const handleReanalyzeChannel = useCallback(async (id) => {
    try {
      await reanalyzeChannel(id);
      await loadVideos(selectedChannelId, false, category, effectiveMarket);
    } catch (err) {
      console.error('Failed to reanalyze channel:', err);
    }
  }, [loadVideos, selectedChannelId, category, effectiveMarket]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!backendReady || authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">
            {!backendReady ? 'Server is starting up…' : 'Loading…'}
          </p>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    if (authPage === 'register') {
      return (
        <RegisterPage
          onRegister={handleRegisterSuccess}
          onGoLogin={() => setAuthPage('login')}
          pendingShare={hasPendingShare}
          pendingVideoLink={hasPendingVideoLink}
        />
      );
    }
    return (
      <LoginPage
        onLogin={handleLoginSuccess}
        onGoRegister={() => setAuthPage('register')}
        pendingShare={hasPendingShare}
        pendingVideoLink={hasPendingVideoLink}
      />
    );
  }

  if (appPage === 'landing') {
    return <LandingPage currentUser={currentUser} onNavigate={handleNavigate} onLogout={handleLogout} />;
  }
  if (appPage === 'summarize') {
    return <SummarizePage onBack={() => setAppPage('landing')} onLogout={handleLogout} isGuest={currentUser?.guestMode === true} claimedShareToken={claimedShareToken} />;
  }
  if (appPage === 'analytics') {
    return <AnalyticsPage onBack={() => setAppPage('landing')} onLogout={handleLogout} />;
  }

  // appPage === 'dashboard' or 'healthy'
  const visibleCountByChannel = {};
  let allChannelsVisibleCount = 0;
  for (const ch of channels) {
    visibleCountByChannel[ch.id] = ch.video_count ?? 0;
    allChannelsVisibleCount += Math.min(MAX_VIDEOS_PER_CHANNEL, ch.video_count ?? 0);
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0" style={{ width: '280px' }}>
        <Sidebar
          channels={channels}
          selectedChannelId={selectedChannelId}
          onSelect={setSelectedChannelId}
          onAdd={() => setShowAddModal(true)}
          onDelete={handleChannelDeleted}
          onRefresh={handleRefreshChannel}
          onReanalyze={handleReanalyzeChannel}
          onToggleSubscription={handleToggleSubscription}
          loading={loading}
          currentUser={currentUser}
          onLogout={handleLogout}
          onBack={() => setAppPage('landing')}
          visibleCountByChannel={visibleCountByChannel}
          allChannelsVisibleCount={allChannelsVisibleCount}
          category={category}
          market={market}
        />
      </div>

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative w-72 flex-shrink-0 z-10">
            <Sidebar
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelect={(id) => { setSelectedChannelId(id); setMobileSidebarOpen(false); }}
              onAdd={() => { setShowAddModal(true); setMobileSidebarOpen(false); }}
              onDelete={handleChannelDeleted}
              onRefresh={handleRefreshChannel}
              onToggleSubscription={handleToggleSubscription}
              loading={loading}
              currentUser={currentUser}
              onLogout={handleLogout}
              onBack={() => setAppPage('landing')}
              category={category}
              market={market}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-zinc-100 flex-1 truncate">
            {channels.find(c => c.id === selectedChannelId)?.name ?? 'Overview'}
          </span>
          <button onClick={handleLogout} className="text-sm font-medium text-zinc-300 hover:text-white px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
            Sign out
          </button>
        </div>

        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 max-w-md text-center">
              <p className="text-red-300 font-medium">{error}</p>
              <p className="text-zinc-400 text-sm mt-2">Make sure the backend is running on port 3001.</p>
            </div>
          </div>
        ) : (
          <VideoFeed
            videos={videos}
            loading={loading}
            selectedChannelId={selectedChannelId}
            channels={channels}
            onBack={() => setAppPage('landing')}
            onLogout={handleLogout}
            isAdmin={currentUser?.role === 'admin'}
            isGuest={currentUser?.guestMode === true}
            onDeleteVideo={handleDeleteVideo}
            targetVideoId={targetVideoId}
            category={category}
            market={market}
            onMarketChange={handleMarketChange}
          />
        )}
      </main>

      {showAddModal && (
        <AddChannelModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleChannelAdded}
          market={effectiveMarket || 'us'}
          category={category}
        />
      )}
    </div>
  );
}
