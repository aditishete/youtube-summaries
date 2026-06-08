import React, { useState } from 'react';
import { login } from '../api.js';

export default function LoginPage({ onLogin, onGoRegister }) {
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

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* App title + description */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-3">
            InBrief
          </h1>
          <p className="text-zinc-300 text-sm leading-relaxed mb-4">
            InBrief helps you stay informed without watching hours of content on YouTube.
          </p>
          <div className="flex flex-col gap-1.5 text-left bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 mb-2">
            <div className="flex items-start gap-2 text-xs text-zinc-400">
              <span className="text-blue-400 mt-0.5">📈</span>
              <span><span className="text-zinc-200 font-medium">Market Brief</span> — AI-powered investment intelligence feed. Tracks channels, get concise summaries and BUY / SELL / WATCH signals from the latest videos.</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-zinc-400">
              <span className="text-violet-400 mt-0.5">▶️</span>
              <span><span className="text-zinc-200 font-medium">Video In Brief</span> — Paste any YouTube URL for an instant AI summary and trade signal extraction.</span>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-zinc-100 mb-5">Sign In</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors duration-150 mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-zinc-500 text-sm mt-5">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={onGoRegister}
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              Register
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
