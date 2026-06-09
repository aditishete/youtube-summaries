/**
 * Quality tests for the Video In Brief summarization prompt.
 * These hit the real Claude API and real YouTube transcript API — skip in CI
 * unless ANTHROPIC_API_KEY is set.
 *
 * Run with:  npm test -- summarize.quality
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, seedUsers, getToken, resetDB } from './helpers.js';

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_API_KEY)('Summarization quality — QQWouCIEAtk (selling options video)', () => {
  let token;
  let result;

  beforeAll(async () => {
    resetDB();
    await seedUsers();
    token = await getToken('viewer', 'viewerpass');

    // Real API call — allow up to 60s
    const res = await request(app)
      .post('/api/summarize')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://www.youtube.com/watch?v=QQWouCIEAtk' })
      .timeout(60000);

    expect(res.status, `Summarize failed: ${JSON.stringify(res.body)}`).toBe(200);
    expect(res.body.status, `Expected done, got: ${JSON.stringify(res.body)}`).toBe('done');
    result = res.body.result;
    console.log('tickers returned:', result.tickers);
    console.log('trade_signals returned:', JSON.stringify(result.trade_signals, null, 2));
  }, 65000);

  // ── Tickers ──────────────────────────────────────────────────────────────

  it('captures VRT (Vertiv Holdings) — mentioned by company name', () => {
    expect(result.tickers).toContain('VRT');
  });

  it('captures CRDO (Credo Technology)', () => {
    expect(result.tickers).toContain('CRDO');
  });

  it('captures MU (Micron)', () => {
    expect(result.tickers).toContain('MU');
  });

  it('captures GLW (Corning)', () => {
    expect(result.tickers).toContain('GLW');
  });

  // ── Trade signals — options logic ─────────────────────────────────────────

  it('VRT signal is BUY — speaker sold cash-secured puts (bullish)', () => {
    const signal = result.trade_signals.find((s) => s.ticker === 'VRT');
    expect(signal, 'VRT signal missing').toBeTruthy();
    expect(signal.signal).toBe('BUY');
  });

  it('CRDO signal is BUY — speaker sold cash-secured puts (bullish)', () => {
    const signal = result.trade_signals.find((s) => s.ticker === 'CRDO');
    expect(signal, 'CRDO signal missing').toBeTruthy();
    expect(signal.signal).toBe('BUY');
  });

  it('no SELL signals for stocks where speaker sold puts', () => {
    const wrongSells = result.trade_signals.filter(
      (s) => ['VRT', 'CRDO', 'GLW'].includes(s.ticker) && s.signal === 'SELL'
    );
    expect(wrongSells, `Incorrect SELL signals: ${JSON.stringify(wrongSells)}`).toHaveLength(0);
  });

  // ── Other fields ──────────────────────────────────────────────────────────

  it('recommendations is empty for an investment video', () => {
    expect(result.recommendations).toEqual([]);
  });

  it('summary mentions key positions', () => {
    const summary = (result.summary || '').toLowerCase();
    const keyTerms = ['vrt', 'vertiv', 'crdo', 'credo', 'put'];
    const mentioned = keyTerms.filter((t) => summary.includes(t));
    expect(mentioned.length, `Summary does not mention any key positions. Got: "${result.summary}"`).toBeGreaterThan(0);
  });

  it('returns at least 5 key points', () => {
    expect(result.keyPoints.length).toBeGreaterThanOrEqual(5);
  });

  it('response includes an id for delete to work', () => {
    expect(typeof result.id).toBe('number');
  });
});
