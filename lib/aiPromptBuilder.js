function buildAiAnalysisPrompt(symbol, featureSet) {
  const payload = {
    symbol,
    source: featureSet?.source || "coingecko",
    price: featureSet?.price ?? null,
    lastUpdatedAt: featureSet?.lastUpdatedAt ?? null,
    stats: featureSet?.raw || {},
    bias: featureSet?.bias || {},
    volatility: featureSet?.volatility || {},
    scores: featureSet?.scores || {},
    candles: featureSet?.candles || {},
    regime: featureSet?.regime || "unknown"
  };

  return `
You are Titan AI Hub's market analyst AI.

Your job:
- Analyze the provided crypto market features
- Decide the current market bias
- Decide whether the best action is BUY, SELL, or WAIT
- Give a confidence score from 0 to 100
- Give a short professional reasoning
- Give risk notes
- If there is no clear edge, choose WAIT

Rules:
- Do not mention that you are an AI model
- Do not output markdown
- Do not output explanations outside JSON
- Be conservative when signals conflict
- If higher timeframe and lower timeframe disagree, reduce confidence
- If market structure is mixed, prefer WAIT
- Entry should be current price if action is BUY or SELL
- stopLoss and takeProfit can be null if action is WAIT

Return valid JSON only with this exact shape:
{
  "symbol": "BTC",
  "market_bias": "bullish | bearish | sideway",
  "regime": "short text",
  "action": "BUY | SELL | WAIT",
  "confidence": 0,
  "entry": 0,
  "stopLoss": 0,
  "takeProfit": 0,
  "reasoning": [
    "reason 1",
    "reason 2",
    "reason 3"
  ],
  "risk_notes": [
    "risk 1",
    "risk 2"
  ]
}

Market data:
${JSON.stringify(payload, null, 2)}
`.trim();
}

module.exports = {
  buildAiAnalysisPrompt
};
