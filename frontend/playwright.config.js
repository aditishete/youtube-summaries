import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000, // 2 min — allows for 60s inline timeout + 5×5s polling
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
});
