function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deriveMarketBias(features) {
  const trendScore = safeNumber(features?.scores?.trendScore);
  const momentumScore = safeNumber(features?.scores?.momentumScore);
  const regime = features?.regime || "sideways";

  const composite = trendScore * 0.65 + momentumScore * 0.35;

  if (regime === "volatile") {
    if (composite >= 0.8) return "Bullish";
    if (composite <= -0.8) return "Bearish";
    return "Volatile";
  }

  if (composite >= 0.25) return "Bullish";
  if (composite <= -0.25) return "Bearish";
  return "Sideway";
}

function deriveSignal(features) {
  const trendScore = safeNumber(features?.scores?.trendScore);
  const momentumScore = safeNumber(features?.scores?.momentumScore);

  const shortBias = features?.bias?.shortBias || "neutral";
  const intradayBias = features?.bias?.intradayBias || "neutral";
  const mediumBias = features?.bias?.mediumBias || "neutral";
  const higherBias = features?.bias?.higherTimeframeBias || "neutral";
  const regime = features?.regime || "sideways";

  let bullPoints = 0;
  let bearPoints = 0;

  if (trendScore > 0.2) bullPoints += 2;
  if (trendScore < -0.2) bearPoints += 2;

  if (momentumScore > 0.1) bullPoints += 1;
  if (momentumScore < -0.1) bearPoints += 1;

  if (shortBias === "bullish" || shortBias === "strong_bullish") bullPoints += 1;
  if (shortBias === "bearish" || shortBias === "strong_bearish") bearPoints += 1;

  if (intradayBias === "bullish" || intradayBias === "strong_bullish") bullPoints += 1;
  if (intradayBias === "bearish" || intradayBias === "strong_bearish") bearPoints += 1;

  if (mediumBias === "bullish" || mediumBias === "strong_bullish") bullPoints += 2;
  if (mediumBias === "bearish" || mediumBias === "strong_bearish") bearPoints += 2;

  if (higherBias === "bullish" || higherBias === "strong_bullish") bullPoints += 2;
  if (higherBias === "bearish" || higherBias === "strong_bearish") bearPoints += 2;

  if (regime === "bull_trend") bullPoints += 1;
  if (regime === "bear_trend") bearPoints += 1;

  if (bullPoints >= bearPoints + 2) return "BUY";
  if (bearPoints >= bullPoints + 2) return "SELL";
  return "WAIT";
}

function deriveConfidence(features, signal) {
  const trendScore = Math.abs(safeNumber(features?.scores?.trendScore));
  const momentumScore = Math.abs(safeNumber(features?.scores?.momentumScore));
  const range1hPct = safeNumber(features?.raw?.range1hPct);
  const range4hPct = safeNumber(features?.raw?.range4hPct);

  let confidence = 50;

  confidence += trendScore * 12;
  confidence += momentumScore * 10;
  confidence += Math.min(range1hPct, 2) * 4;
  confidence += Math.min(range4hPct, 4) * 2;

  if (signal === "WAIT") confidence -= 12;

  return Math.round(clamp(confidence, 55, 92));
}

function deriveRiskPlan(features, signal) {
  const price = safeNumber(features?.price);
  const range1hPct = safeNumber(features?.raw?.range1hPct, 0.8);
  const range4hPct = safeNumber(features?.raw?.range4hPct, 1.5);

  if (!price) {
    return {
      entry: null,
      stopLoss: null,
      takeProfit: null
    };
  }

  const stopPct = Math.max(range1hPct * 0.6, 0.35) / 100;
  const takePct = Math.max(range4hPct * 0.8, 0.7) / 100;

  if (signal === "BUY") {
    return {
      entry: Number(price.toFixed(2)),
      stopLoss: Number((price * (1 - stopPct)).toFixed(2)),
      takeProfit: Number((price * (1 + takePct)).toFixed(2))
    };
  }

  if (signal === "SELL") {
    return {
      entry: Number(price.toFixed(2)),
      stopLoss: Number((price * (1 + stopPct)).toFixed(2)),
      takeProfit: Number((price * (1 - takePct)).toFixed(2))
    };
  }

  return {
    entry: Number(price.toFixed(2)),
    stopLoss: null,
    takeProfit: null
  };
}

function deriveReason(features, signal, marketBias) {
  const shortBias = features?.bias?.shortBias || "neutral";
  const mediumBias = features?.bias?.mediumBias || "neutral";
  const higherBias = features?.bias?.higherTimeframeBias || "neutral";
  const regime = features?.regime || "sideways";

  if (signal === "BUY") {
    return `Momentum and trend align to upside. short=${shortBias}, medium=${mediumBias}, higher=${higherBias}, regime=${regime}, bias=${marketBias}`;
  }

  if (signal === "SELL") {
    return `Momentum and trend align to downside. short=${shortBias}, medium=${mediumBias}, higher=${higherBias}, regime=${regime}, bias=${marketBias}`;
  }

  return `Mixed structure, no clean edge. short=${shortBias}, medium=${mediumBias}, higher=${higherBias}, regime=${regime}, bias=${marketBias}`;
}

function buildDecision(features) {
  const marketBias = deriveMarketBias(features);
  const signal = deriveSignal(features);
  const confidence = deriveConfidence(features, signal);
  const riskPlan = deriveRiskPlan(features, signal);
  const reason = deriveReason(features, signal, marketBias);

  return {
    ok: true,
    symbol: features?.symbol || null,
    coinId: features?.coinId || null,
    source: features?.source || null,
    price: safeNumber(features?.price),
    signal,
    confidence,
    marketBias,
    entry: riskPlan.entry,
    stopLoss: riskPlan.stopLoss,
    takeProfit: riskPlan.takeProfit,
    regime: features?.regime || null,
    reason
  };
}

module.exports = {
  buildDecision
};
