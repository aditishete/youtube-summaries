import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import channelRoutes from './routes/channels.js';
import videoRoutes from './routes/videos.js';
import authRoutes from './routes/auth.js';
import summarizeRoutes from './routes/summarize.js';
import analyticsRoutes from './routes/analytics.js';
import db from './db.js';

const isTest = process.env.NODE_ENV === 'test';

export function createApp({ testRateLimits = {} } = {}) {
  const app = express();
  app.set('trust proxy', 1); // Fly.io sits behind one proxy layer

  const makeLimit = (key, windowMs, max, message) => rateLimit({
    windowMs,
    max: isTest ? (testRateLimits[key] ?? 10000) : max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });

  // 200 req / 15 min per IP — general protection across all routes
  const globalLimiter = makeLimit('global', 15 * 60 * 1000, 200, 'Too many requests, please try again later.');

  // 10 attempts / 15 min per IP — brute force protection
  const authLimiter = makeLimit('auth', 15 * 60 * 1000, 10, 'Too many login attempts, please try again later.');

  // 5 registrations / hour per IP — prevent account flooding
  const registerLimiter = makeLimit('register', 60 * 60 * 1000, 5, 'Too many accounts created from this IP, please try again later.');

  // 10 summarize calls / hour per IP — protect Claude API costs
  // Custom handler logs the event per user for observability
  const summarizeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isTest ? (testRateLimits['summarize'] ?? 10000) : 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-me-in-production');
          db.prepare('INSERT INTO rate_limit_events (user_id, endpoint) VALUES (?, ?)').run(decoded.id, '/api/summarize');
        } else {
          db.prepare('INSERT INTO rate_limit_events (user_id, endpoint) VALUES (?, ?)').run(null, '/api/summarize');
        }
      } catch (_) {}
      res.status(429).json({ error: 'Summarize limit reached. You can generate up to 10 briefs per hour.' });
    },
  });

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(globalLimiter);

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', registerLimiter);
  app.use('/api/summarize', summarizeLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api/videos', videoRoutes);
  app.use('/api/summarize', summarizeRoutes);
  app.use('/api/analytics', analyticsRoutes);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  return app;
}
