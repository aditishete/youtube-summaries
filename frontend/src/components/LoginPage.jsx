import React, { useState } from 'react';
import { login, loginAsGuest } from '../api.js';

export default function LoginPage({ onLogin, onGoRegister, pendingShare, pendingVideoLink }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await login(username.trim(), password);
      localStorage.setItem('token', token);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const { token, user } = await loginAsGuest();
      localStorage.setItem('token', token);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Guest login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center px-4 pt-12 pb-16 gap-8">
      {/* Description — wider than the form */}
      <div className="w-full max-w-xl text-center">
        <h1 className="text-4xl font-bold text-zinc-100 tracking-tight mb-4">InBrief</h1>
        <p className="text-zinc-300 text-base leading-relaxed mb-5">
          InBrief helps you stay informed without watching hours of content on YouTube.
        </p>
        <div className="flex flex-col gap-4 text-left bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-5">
          <div className="flex items-start gap-3 text-base text-zinc-400">
            <span className="text-blue-400 mt-0.5">📈</span>
            <span><span className="text-zinc-200 font-semibold">Market Brief</span> — AI-powered investment intelligence feed. Tracks channels, get concise summaries and BUY / SELL / WATCH signals from the latest videos.</span>
          </div>
          <div className="flex items-start gap-3 text-base text-zinc-400">
            <span className="text-violet-400 mt-0.5">▶️</span>
            <span><span className="text-zinc-200 font-semibold">Video In Brief</span> — Paste any YouTube URL for an instant AI summary and trade signal extraction.</span>
          </div>
        </div>
      </div>

      {/* Login form */}
      <div className="w-full max-w-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-zinc-100 mb-5">Sign In</h2>

          {pendingShare && (
            <div className="bg-violet-900/30 border border-violet-700/50 rounded-lg px-4 py-3 mb-4 flex items-start gap-2.5">
              <span className="text-violet-400 flex-shrink-0 mt-0.5">▶</span>
              <p className="text-violet-200 text-sm leading-snug">
                Someone shared a video analysis with you. Sign in or create an account to view it.
              </p>
            </div>
          )}
          {pendingVideoLink && (
            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-4 py-3 mb-4 flex items-start gap-2.5">
              <span className="text-blue-400 flex-shrink-0 mt-0.5">📈</span>
              <p className="text-blue-200 text-sm leading-snug">
                Someone shared a market brief with you. Sign in to view it.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-base rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-lg px-3 py-3 text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-lg px-3 py-3 text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg text-base transition-colors duration-150 mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-zinc-500 text-base mt-5">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={onGoRegister}
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              Register
            </button>
          </p>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-700" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-900 px-3 text-zinc-500 text-sm">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGuestLogin}
            disabled={loading}
            className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 font-medium py-3 px-4 rounded-lg text-base transition-colors duration-150"
          >
            View as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
