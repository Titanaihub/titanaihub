function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getBiasFromReturn(ret) {
  const value = safeNumber(ret);

  if (value >= 1.0) return "strong_bullish";
  if (value >= 0.2) return "bullish";
  if (value <= -1.0) return "strong_bearish";
  if (value <= -0.2) return "bearish";
  return "neutral";
}

function getVolatilityLevel(rangePct) {
  const value = safeNumber(rangePct);

  if (value >= 3) return "high";
  if (value >= 1.2) return "medium";
  return "low";
}

function buildFeatureSet(marketData) {
  const price = safeNumber(marketData?.price);
  const stats = marketData?.stats || {};
  const timeframes = marketData?.timeframes || {};

  const return5m = safeNumber(stats.return5m);
  const return15m = safeNumber(stats.return15m);
  const return1h = safeNumber(stats.return1h);
  const return4h = safeNumber(stats.return4h);

  const range1hPct = safeNumber(stats.range1hPct);
  const range4hPct = safeNumber(stats.range4hPct);

  const tf5m = timeframes["5m"] || null;
  const tf15m = timeframes["15m"] || null;
  const tf1h = timeframes["1h"] || null;
  const tf4h = timeframes["4h"] || null;

  const shortBias = getBiasFromReturn(return5m);
  const intradayBias = getBiasFromReturn(return15m);
  const mediumBias = getBiasFromReturn(return1h);
  const higherTimeframeBias = getBiasFromReturn(return4h);

  const volatility1h = getVolatilityLevel(range1hPct);
  const volatility4h = getVolatilityLevel(range4hPct);

  const momentumScore =
    (return5m * 0.35) +
    (return15m * 0.65);

  const trendScore =
    (return1h * 0.4) +
    (return4h * 0.6);

  const marketRegime =
    volatility4h === "high"
      ? "volatile"
      : higherTimeframeBias === "bullish" || higherTimeframeBias === "strong_bullish"
        ? "bull_trend"
        : higherTimeframeBias === "bearish" || higherTimeframeBias === "strong_bearish"
          ? "bear_trend"
          : "sideways";

  return {
    ok: true,
    symbol: marketData?.symbol || null,
    coinId: marketData?.coinId || null,
    source: marketData?.source || null,
    price,
    lastUpdatedAt: marketData?.lastUpdatedAt || null,

    raw: {
      return5m,
      return15m,
      return1h,
      return4h,
      range1hPct,
      range4hPct
    },

    bias: {
      shortBias,
      intradayBias,
      mediumBias,
      higherTimeframeBias
    },

    volatility: {
      volatility1h,
      volatility4h
    },

    scores: {
      momentumScore: Number(momentumScore.toFixed(3)),
      trendScore: Number(trendScore.toFixed(3))
    },

    candles: {
      "5m": tf5m,
      "15m": tf15m,
      "1h": tf1h,
      "4h": tf4h
    },

    regime: marketRegime
  };
}

module.exports = {
  buildFeatureSet,
  getBiasFromReturn,
  getVolatilityLevel
};
