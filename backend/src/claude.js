import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analyzes a YouTube video using its transcript (preferred) or description.
 * Returns { summary, tickers, trade_signals }.
 */
export async function analyzeVideo(video, channelName) {
  const content = video.transcript?.trim()
    ? `Transcript:\n${video.transcript.slice(0, 20000)}`
    : `Description:\n${video.description || '(none)'}`;

  const userPrompt = `Summarize this YouTube video for an investor audience.

Title: ${video.title}
Channel: ${channelName}
${content}

Respond with ONLY a JSON object, no markdown fences:
{
  "summary": "3-4 sentence plain-English summary of what was discussed",
  "tickers": ["AAPL", "SNOW"],
  "trade_signals": [
    { "ticker": "AAPL", "signal": "BUY", "reasoning": "reason under 120 chars" }
  ]
}

Rules:
- summary is required — always write one even if no stocks are discussed
- tickers: every stock/ETF/crypto mentioned by ticker symbol OR company name — resolve company names to their correct exchange-listed ticker (e.g. "Vertiv" → "VRT", "Nvidia" → "NVDA", "Micron" → "MU", "Coherent" → "COHR", "Marvell" → "MRVL"); include all even if briefly mentioned
- speakers sometimes state the wrong ticker symbol for a company — if a company name and a ticker conflict, trust the company name and use the correct ticker (e.g. speaker says "ticker COR" but refers to Coherent → use "COHR", not "COR")
- trade_signals: only when the speaker makes a clear directional call; signal must be BUY, SELL, WATCH, or HOLD
- Options signal mapping (critical — do not confuse "sold" with SELL):
  * Sold puts / buying calls / bull call spread = BUY (bullish)
  * Bought puts / sold calls / bear put spread = SELL (bearish)
  * "Sold puts on AAPL" → { ticker: "AAPL", signal: "BUY", reasoning: "sold puts — bullish, willing to own at strike" }
- Only emit a signal when the speaker makes a real directional commitment, not just a mention`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: 'You are a financial analyst AI that summarizes YouTube investment videos. Be concise. Always produce a summary.',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content?.[0]?.text || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      return {
        summary: parsed.summary || '',
        tickers: Array.isArray(parsed.tickers) ? parsed.tickers : [],
        trade_signals: Array.isArray(parsed.trade_signals) ? parsed.trade_signals : [],
      };
    } catch {
      console.error('Claude returned non-JSON:', text.slice(0, 200));
      return { summary: '', tickers: [], trade_signals: [] };
    }
  } catch (err) {
    console.error('Claude API error:', err.status ?? '', err.message);
    return { summary: '', tickers: [], trade_signals: [] };
  }
}
