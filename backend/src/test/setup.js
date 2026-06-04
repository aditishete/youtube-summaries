import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import 'dotenv/config';
import { afterAll } from 'vitest';

// Point db.js at a fresh temp file — must be set before any module imports db.js
const tmpDir = mkdtempSync(join(tmpdir(), 'marketbrief-test-'));
process.env.DB_PATH = join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
