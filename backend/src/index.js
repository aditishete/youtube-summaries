import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import channelRoutes from './routes/channels.js';
import videoRoutes from './routes/videos.js';
import authRoutes from './routes/auth.js';
import { startScheduler } from './scheduler.js';
import { seedAdminUser } from './seed.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/videos', videoRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server after seeding
(async () => {
  await seedAdminUser();
  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
    startScheduler();
  });
})();
