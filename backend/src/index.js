import 'dotenv/config';
import { createApp } from './app.js';
import { startScheduler } from './scheduler.js';
import { seedAdminUser } from './seed.js';

const PORT = process.env.PORT || 3001;

(async () => {
  await seedAdminUser();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
    startScheduler();
  });
})();
