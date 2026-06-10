import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/quality/**/*.test.js'],
    setupFiles: ['./src/test/setup.js'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: ['verbose'],
    testTimeout: 65000,
  },
});
