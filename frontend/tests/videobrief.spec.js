import { test, expect } from '@playwright/test';

const VIDEO_URL = 'https://www.youtube.com/watch?v=QQWouCIEAtk';
const EXPECTED_TICKERS = ['VRT', 'CRDO', 'MU', 'GLW'];
const EXPECTED_BUY_SIGNALS = ['VRT', 'CRDO'];

// History rows live in a table (desktop view) — one <tr> per item
const historyRows = (page) => page.locator('table tbody tr');

test.describe('Video In Brief — QQWouCIEAtk (selling options video)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Username').fill('test1');
    await page.getByPlaceholder('Password').fill('pa$$w0rd');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /market brief/i })).toBeVisible({ timeout: 10000 });
  });

  test('summarizes video, shows expected tickers and BUY signals, then removes it', async ({ page }) => {
    // Navigate to Video In Brief
    await page.getByRole('button', { name: /video in brief/i }).click();
    await expect(page.getByRole('heading', { name: 'Video In Brief' })).toBeVisible();

    const beforeCount = await historyRows(page).count();

    // Submit the video URL
    const urlInput = page.getByPlaceholder(/youtube/i);
    await urlInput.fill(VIDEO_URL);
    await page.getByRole('button', { name: /get brief/i }).click();

    // Wait for "Briefing…" to appear, then disappear (real Claude + transcript call)
    await expect(page.getByRole('button', { name: /briefing/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /get brief/i })).toBeVisible({ timeout: 65000 });

    // New row should now be at the top
    await expect(historyRows(page)).toHaveCount(beforeCount + 1, { timeout: 5000 });

    // ── Check tickers ─────────────────────────────────────────────────────────
    const pageContent = await page.content();
    for (const ticker of EXPECTED_TICKERS) {
      expect(pageContent, `Expected ticker ${ticker} in the brief`).toContain(ticker);
    }

    // ── Check BUY signals (sold puts = bullish, not SELL) ─────────────────────
    for (const ticker of EXPECTED_BUY_SIGNALS) {
      // The first row contains the new summary — find BUY badge near the ticker
      const firstRow = historyRows(page).first();
      const rowHtml = await firstRow.innerHTML();
      expect(rowHtml, `Expected BUY signal for ${ticker} (sold puts = bullish)`).toContain(ticker);
      expect(rowHtml, `Expected BUY signal for ${ticker}, not SELL`).toContain('BUY');
    }

    // ── Remove the entry ──────────────────────────────────────────────────────
    await historyRows(page).first().getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Remove?')).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'Yes' }).first().click();

    // Row should disappear
    await expect(historyRows(page)).toHaveCount(beforeCount, { timeout: 5000 });
  });
});
