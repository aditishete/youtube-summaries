import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.getByPlaceholder('Username').fill('test1');
  await page.getByPlaceholder('Password').fill('pa$$w0rd');
  await page.getByRole('button', { name: /sign in/i }).click();
  // Land on the homepage after login
  await expect(page.getByRole('heading', { name: /market brief/i })).toBeVisible({ timeout: 10000 });
}

async function goToMarketBriefs(page) {
  // If already on landing, click Market Briefs card
  const marketCard = page.getByRole('button', { name: /market brief/i });
  if (await marketCard.isVisible({ timeout: 2000 }).catch(() => false)) {
    await marketCard.click();
  }
  // Wait for sidebar to show with "Market Briefs" heading
  await expect(page.getByText('Market Briefs').first()).toBeVisible({ timeout: 8000 });
}

// ── Market Tabs ───────────────────────────────────────────────────────────────

test.describe('Market Briefs — US / India tabs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goToMarketBriefs(page);
  });

  test('shows US and India tab buttons on the Market Briefs page', async ({ page }) => {
    await expect(page.getByRole('button', { name: /🇺🇸 US/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /🇮🇳 India/ })).toBeVisible();
  });

  test('US tab is active by default', async ({ page }) => {
    const usBtn = page.getByRole('button', { name: /🇺🇸 US/ });
    // Active tab has blue background class
    await expect(usBtn).toHaveClass(/bg-blue-600/);
  });

  test('clicking India tab makes it active and deactivates US', async ({ page }) => {
    const usBtn = page.getByRole('button', { name: /🇺🇸 US/ });
    const indiaBtn = page.getByRole('button', { name: /🇮🇳 India/ });

    await indiaBtn.click();

    await expect(indiaBtn).toHaveClass(/bg-orange-600/);
    await expect(usBtn).not.toHaveClass(/bg-blue-600/);
  });

  test('switching back to US tab restores US as active', async ({ page }) => {
    const usBtn = page.getByRole('button', { name: /🇺🇸 US/ });
    const indiaBtn = page.getByRole('button', { name: /🇮🇳 India/ });

    await indiaBtn.click();
    await expect(indiaBtn).toHaveClass(/bg-orange-600/);

    await usBtn.click();
    await expect(usBtn).toHaveClass(/bg-blue-600/);
    await expect(indiaBtn).not.toHaveClass(/bg-orange-600/);
  });

  test('market tabs are NOT shown on Health Briefs page', async ({ page }) => {
    // Navigate back to landing and go to Health Briefs
    await page.getByRole('button', { name: /← home/i }).click();
    await page.getByRole('button', { name: /health brief/i }).click();
    await expect(page.getByText('Health Briefs').first()).toBeVisible({ timeout: 8000 });

    await expect(page.getByRole('button', { name: /🇺🇸 US/ })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /🇮🇳 India/ })).not.toBeVisible();
  });
});

// ── Sidebar Overview label ────────────────────────────────────────────────────

test.describe('Sidebar — Overview label', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goToMarketBriefs(page);
  });

  test('sidebar shows "Overview" instead of "All Channels"', async ({ page }) => {
    await expect(page.getByText('Overview').first()).toBeVisible();
    await expect(page.getByText('All Channels')).not.toBeVisible();
  });

  test('"Overview" info icon is present in sidebar', async ({ page }) => {
    // The ⓘ character appears next to Overview
    await expect(page.locator('text=ⓘ').first()).toBeVisible();
  });
});

// ── Add Channel Modal — market badge ─────────────────────────────────────────

test.describe('Add Channel Modal — market badge', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goToMarketBriefs(page);
  });

  test('modal shows "Adding to 🇺🇸 US Market" when US tab is active', async ({ page }) => {
    // Only admins see the Add Channel button — skip if not visible
    const addBtn = page.getByRole('button', { name: /\+ add channel/i });
    if (!await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await addBtn.click();
    await expect(page.getByText(/Adding to.*US Market/i)).toBeVisible({ timeout: 3000 });
    // Close modal
    await page.keyboard.press('Escape');
  });

  test('modal shows "Adding to 🇮🇳 India Market" when India tab is active', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /\+ add channel/i });
    if (!await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }

    // Switch to India tab first
    await page.getByRole('button', { name: /🇮🇳 India/ }).click();
    await addBtn.click();
    await expect(page.getByText(/Adding to.*India Market/i)).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
  });
});
