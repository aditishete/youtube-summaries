import express from 'express';
import cors from 'cors';
import channelRoutes from './routes/channels.js';
import videoRoutes from './routes/videos.js';
import authRoutes from './routes/auth.js';
import summarizeRoutes from './routes/summarize.js';
import analyticsRoutes from './routes/analytics.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api/videos', videoRoutes);
  app.use('/api/summarize', summarizeRoutes);
  app.use('/api/analytics', analyticsRoutes);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  return app;
}
