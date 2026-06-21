import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MARKET_BRIEF_AI_TIMEOUT_MS = parseInt(process.env.MARKET_BRIEF_AI_TIMEOUT_MS || '45000', 10);

/**
 * Analyzes a YouTube video using its transcript (preferred) or description.
 * Returns { summary, keyPoints, recommendations, tickers, trade_signals } on success.
 * Throws an Error with a `phase` property ('ai', 'timeout', 'parse') on failure.
 */
export async function analyzeVideo(video, channelName, category = 'market') {
  const content = video.transcript?.trim()
    ? `Transcript:\n${video.transcript.slice(0, 24000)}`
    : `Description:\n${video.description || '(none)'}`;

  const isHealth = category === 'healthy';

  const userPrompt = isHealth
    ? `Summarize this YouTube health and wellness video.

Title: ${video.title}
Channel: ${channelName}
${content}

Respond with ONLY a JSON object, no markdown fences:
{
  "summary": "3-5 sentence plain-English summary",
  "keyPoints": ["Key finding or insight 1", "Key finding or insight 2"],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
  "tickers": [],
  "trade_signals": []
}

Rules:
- summary: 3-5 sentences, plain English; cover the core health topic and the main advice or findings — concise but complete enough that someone who skips the video gets the gist
- keyPoints: 5-8 of the most important health or wellness insights from the video (specific findings, dosages, research cited, mechanisms explained, risks flagged, foods/exercises named, expert opinions)
- recommendations: 3-5 specific, actionable things the viewer should do or consider based on this video (habits to adopt, changes to make, things to discuss with a doctor, products/foods to try or avoid); focus on the most practical advice
- tickers: always an empty array
- trade_signals: always an empty array
- summary is always required — write one even if the video is brief`
    : `Summarize this YouTube video for an investor audience.

Title: ${video.title}
Channel: ${channelName}
${content}

Respond with ONLY a JSON object, no markdown fences:
{
  "summary": "3-5 sentence plain-English summary; mention key stocks or positions discussed",
  "keyPoints": ["Key point 1", "Key point 2"],
  "tickers": ["AAPL", "SNOW"],
  "trade_signals": [
    { "ticker": "AAPL", "signal": "BUY", "reasoning": "reason under 120 chars" }
  ]
}

Rules:
- summary: plain English, concise, covers the main topic; mention the key stocks or positions the speaker discusses
- keyPoints: 5-8 most important takeaways, including any specific stocks, trades, or price targets the speaker highlights
- tickers: every stock/ETF/crypto mentioned by ticker symbol OR company name — resolve company names to their correct exchange-listed ticker (e.g. "Vertiv" → "VRT", "Nvidia" → "NVDA", "Micron" → "MU", "Coherent" → "COHR", "Marvell" → "MRVL"); include all even if briefly mentioned
- speakers sometimes state the wrong ticker symbol for a company — if a company name and a ticker conflict, trust the company name and use the correct ticker (e.g. speaker says "ticker COR" but refers to Coherent → use "COHR", not "COR")
- trade_signals: only when the speaker makes a clear directional call; signal must be BUY, SELL, WATCH, or HOLD (empty array if none)
- Options signal mapping (critical — do not confuse "sold" with SELL):
  * Sold puts / buying calls / bull call spread = BUY (bullish)
  * Bought puts / sold calls / bear put spread = SELL (bearish)
  * "Sold puts on AAPL" → { ticker: "AAPL", signal: "BUY", reasoning: "sold puts — bullish, willing to own at strike" }
- Only emit a signal when the speaker makes a real directional commitment, not just a mention
- summary is always required — write one even if no stocks are discussed`;

  const systemPrompt = isHealth
    ? 'You are a health and wellness AI that summarizes YouTube health videos. Be thorough, accurate, and focus on actionable insights. Never mention stocks, investments, or financial topics. Always produce a summary.'
    : 'You are a financial analyst AI that summarizes YouTube investment videos. Be concise and precise. Always produce a summary.';

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    }, { signal: AbortSignal.timeout(MARKET_BRIEF_AI_TIMEOUT_MS) });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    const e = new Error(isTimeout
      ? `AI call timed out after ${MARKET_BRIEF_AI_TIMEOUT_MS}ms`
      : err.message);
    e.phase = isTimeout ? 'timeout' : 'ai';
    throw e;
  }

  const text = response.content?.[0]?.text || '';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary:        parsed.summary        || '',
      keyPoints:      Array.isArray(parsed.keyPoints)      ? parsed.keyPoints      : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      tickers:        Array.isArray(parsed.tickers)        ? parsed.tickers        : [],
      trade_signals:  Array.isArray(parsed.trade_signals)  ? parsed.trade_signals  : [],
    };
  } catch {
    const e = new Error(`Failed to parse AI response: ${text.slice(0, 200)}`);
    e.phase = 'parse';
    throw e;
  }
}
