import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before the module factory, so mockCreate is safe to reference inside vi.mock
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  return { mockCreate };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { analyzeVideo } from '../claude.js';

const HEALTH_VIDEO = {
  title: 'Top 5 Foods for Heart Health',
  description: 'We look at research-backed foods that reduce cardiovascular risk.',
  transcript: 'Today we discuss omega-3 fatty acids, leafy greens, and how they reduce inflammation.',
};

const MARKET_VIDEO = {
  title: 'NVDA and AAPL Trade Setups This Week',
  description: 'Breaking down Nvidia and Apple options setups.',
  transcript: 'Nvidia is breaking out above 900. I would buy calls here.',
};

function makeClaudeResponse(json) {
  return { content: [{ type: 'text', text: JSON.stringify(json) }] };
}

beforeEach(() => vi.clearAllMocks());

describe('analyzeVideo — health category', () => {
  it('sends a wellness-focused prompt (not investor) to Claude', async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse({
      summary: 'A health-focused summary.',
      keyPoints: ['Eat more omega-3', 'Reduce sugar'],
      tickers: [],
      trade_signals: [],
    }));

    await analyzeVideo(HEALTH_VIDEO, 'HealthChannel', 'healthy');

    expect(mockCreate).toHaveBeenCalledOnce();
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('health and wellness');
    expect(prompt).not.toContain('investor audience');
  });

  it('returns empty tickers and trade_signals for health category', async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse({
      summary: 'Helpful health tips.',
      keyPoints: ['Tip A', 'Tip B'],
      tickers: [],
      trade_signals: [],
    }));

    const result = await analyzeVideo(HEALTH_VIDEO, 'HealthChannel', 'healthy');

    expect(result.tickers).toEqual([]);
    expect(result.trade_signals).toEqual([]);
  });

  it('returns summary and keyPoints', async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse({
      summary: 'Omega-3 reduces cardiovascular risk.',
      keyPoints: ['Eat salmon twice a week', 'Supplement with fish oil'],
      tickers: [],
      trade_signals: [],
    }));

    const result = await analyzeVideo(HEALTH_VIDEO, 'HealthChannel', 'healthy');

    expect(result.summary).toBe('Omega-3 reduces cardiovascular risk.');
    expect(result.keyPoints).toEqual(['Eat salmon twice a week', 'Supplement with fish oil']);
  });
});

describe('analyzeVideo — market category', () => {
  it('sends an investor-focused prompt (not wellness) to Claude', async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse({
      summary: 'Nvidia is breaking out.',
      keyPoints: ['Buy NVDA calls'],
      tickers: ['NVDA'],
      trade_signals: [{ ticker: 'NVDA', signal: 'BUY', reasoning: 'Breakout above 900' }],
    }));

    await analyzeVideo(MARKET_VIDEO, 'TradeChannel', 'market');

    expect(mockCreate).toHaveBeenCalledOnce();
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('investor audience');
    expect(prompt).not.toContain('health and wellness');
  });

  it('returns tickers and trade_signals from Claude response', async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse({
      summary: 'Nvidia looks bullish.',
      keyPoints: ['NVDA above resistance'],
      tickers: ['NVDA', 'AAPL'],
      trade_signals: [{ ticker: 'NVDA', signal: 'BUY', reasoning: 'Breakout' }],
    }));

    const result = await analyzeVideo(MARKET_VIDEO, 'TradeChannel', 'market');

    expect(result.tickers).toEqual(['NVDA', 'AAPL']);
    expect(result.trade_signals).toHaveLength(1);
    expect(result.trade_signals[0].signal).toBe('BUY');
  });

  it('defaults to market category when none specified', async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse({
      summary: 'Market summary.',
      keyPoints: ['Buy the dip'],
      tickers: ['SPY'],
      trade_signals: [],
    }));

    await analyzeVideo(MARKET_VIDEO, 'TradeChannel');

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('investor audience');
  });

  it('throws when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    await expect(analyzeVideo(MARKET_VIDEO, 'TradeChannel', 'market')).rejects.toThrow();
  });
});
