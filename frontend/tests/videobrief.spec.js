import { test, expect } from '@playwright/test';

// ── Configurable smoke-test video ─────────────────────────────────────────────
// Override via env: VIDEO_BRIEF_TEST_URL=https://www.youtube.com/watch?v=... npx playwright test
const SMOKE_VIDEO_URL = process.env.VIDEO_BRIEF_TEST_URL || 'https://www.youtube.com/watch?v=20Y1OG5SFfo';

// ── Quality-test video (selling options — specific ticker/signal assertions) ──
const QUALITY_VIDEO_URL    = 'https://www.youtube.com/watch?v=QQWouCIEAtk';
const EXPECTED_TICKERS     = ['VRT', 'CRDO', 'MU', 'GLW'];
const EXPECTED_BUY_SIGNALS = ['VRT', 'CRDO'];

// Max time to wait for briefing to complete: 60s inline timeout + 5×5s polling + buffer
const BRIEF_COMPLETE_TIMEOUT = 100000;

// ── Shared helpers ────────────────────────────────────────────────────────────
const historyRows = (page) => page.locator('table tbody tr');

async function login(page) {
  await page.goto('/');
  await page.getByPlaceholder('Username').fill('test1');
  await page.getByPlaceholder('Password').fill('pa$$w0rd');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: /market brief/i })).toBeVisible({ timeout: 10000 });
}

async function navigateToVideoBrief(page) {
  await page.getByRole('button', { name: /video in brief/i }).click();
  await expect(page.getByRole('heading', { name: 'Video In Brief' })).toBeVisible();
  // Wait for history to finish loading before we count existing rows
  await expect(
    page.locator('table').or(page.getByText('No summaries yet.'))
  ).toBeVisible({ timeout: 10000 });
}

async function submitAndWaitForBrief(page, videoUrl) {
  const beforeCount = await historyRows(page).count();

  await page.getByPlaceholder(/youtube/i).fill(videoUrl);
  await page.getByRole('button', { name: /get brief/i }).click();

  // Spinner/button changes to "Briefing…" immediately
  await expect(page.getByRole('button', { name: /briefing/i })).toBeVisible({ timeout: 5000 });

  // Wait for "Get Brief" to come back — covers both inline and polling paths
  await expect(page.getByRole('button', { name: /get brief/i })).toBeVisible({ timeout: BRIEF_COMPLETE_TIMEOUT });

  return beforeCount;
}

async function deleteFirstRow(page, beforeCount) {
  await historyRows(page).first().getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Remove?')).toBeVisible({ timeout: 3000 });

  // Wait for the DELETE API call to complete before checking count
  const [deleteResp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/summarize/history/') && r.request().method() === 'DELETE'),
    page.getByRole('button', { name: 'Yes' }).first().click(),
  ]);
  expect(deleteResp.status()).toBe(204);

  await expect(historyRows(page)).toHaveCount(beforeCount, { timeout: 5000 });
}

// ── Smoke test — configurable URL ─────────────────────────────────────────────
test.describe('Video In Brief — smoke test (configurable URL)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('generates a brief, shows it in history, then removes it', async ({ page }) => {
    await navigateToVideoBrief(page);

    const beforeCount = await submitAndWaitForBrief(page, SMOKE_VIDEO_URL);

    // A new history row should appear
    await expect(historyRows(page)).toHaveCount(beforeCount + 1, { timeout: 5000 });

    // The new row should contain a non-empty summary
    const rowText = await historyRows(page).first().innerText();
    expect(rowText.trim().length, 'Expected non-empty brief content in first history row').toBeGreaterThan(50);

    await deleteFirstRow(page, beforeCount);
  });
});

// ── Quality test — QQWouCIEAtk (selling options video) ───────────────────────
test.describe('Video In Brief — QQWouCIEAtk (selling options video)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('summarizes video, shows expected tickers and BUY signals, then removes it', async ({ page }) => {
    await navigateToVideoBrief(page);

    const beforeCount = await submitAndWaitForBrief(page, QUALITY_VIDEO_URL);

    // New row should now be at the top
    await expect(historyRows(page)).toHaveCount(beforeCount + 1, { timeout: 5000 });

    // ── Check tickers ─────────────────────────────────────────────────────────
    const pageContent = await page.content();
    for (const ticker of EXPECTED_TICKERS) {
      expect(pageContent, `Expected ticker ${ticker} in the brief`).toContain(ticker);
    }

    // ── Check BUY signals (sold puts = bullish, not SELL) ─────────────────────
    for (const ticker of EXPECTED_BUY_SIGNALS) {
      const firstRow = historyRows(page).first();
      const rowHtml = await firstRow.innerHTML();
      expect(rowHtml, `Expected BUY signal for ${ticker} (sold puts = bullish)`).toContain(ticker);
      expect(rowHtml, `Expected BUY signal for ${ticker}, not SELL`).toContain('BUY');
    }

    // ── Remove the entry ──────────────────────────────────────────────────────
    await deleteFirstRow(page, beforeCount);
  });
});
