const {
  CACHE_TTL_MS,
  COIN_UNIVERSE,
  RUNTIME_CACHE
} = require("../config/constants.js");
const { getStableOverview } = require("./overview-service.js");
const { getAllStableCoins } = require("./coin-service.js");
const { buildWhalePackage } = require("./whale-service.js");
const { formatUsd, formatPrice, formatPercent } = require("../utils/formatters.js");
const { isFresh, now, clamp } = require("../utils/helpers.js");

function scoreToLabel(score) {
  if (score >= 80) return "Very Strong";
  if (score >= 65) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 35) return "Weak";
  return "Low";
}

function marketRegimeFromOverview(overview) {
  const fearGreed = Number(overview?.fearGreed || 0);
  const bias = String(overview?.marketBias || "").toLowerCase();

  if (bias.includes("risk-off") || fearGreed <= 25) {
    return {
      regime: "Risk-Off",
      sentimentScore: 28,
      explanation: "Defensive market tone with elevated trap risk."
    };
  }

  if (bias.includes("risk-on") || fearGreed >= 70) {
    return {
      regime: "Risk-On",
      sentimentScore: 74,
      explanation: "Constructive environment with stronger momentum participation."
    };
  }

  return {
    regime: "Mixed",
    sentimentScore: 52,
    explanation: "Balanced market, follow-through is selective and rotation-driven."
  };
}

function buildCoinFocusItem(meta, coin, whaleSummaryMap, regime) {
  const price = Number(coin?.price || meta.fallbackPrice || 0);
  const c5 = Number(coin?.change5m || 0);
  const c15 = Number(coin?.change15m || 0);
  const c1h = Number(coin?.change1h || 0);
  const c4h = Number(coin?.change4h || 0);
  const funding = Number(coin?.funding || 0);
  const oi = Number(coin?.oi || 0);
  const bias = String(coin?.bias || "Sideway");
  const signal = String(coin?.signal || "WAIT").toUpperCase();
  const whale = whaleSummaryMap[meta.symbol] || null;

  const momentumScore = clamp(
    50 + c5 * 120 + c15 * 80 + c1h * 40 + c4h * 15,
    0,
    100
  );

  const fundingExtremeScore = clamp(Math.abs(funding) * 50000, 0, 100);
  const derivativesScore = clamp(
    50 +
      (signal.includes("LONG") ? 10 : signal.includes("SHORT") ? -10 : 0) -
      fundingExtremeScore * 0.2,
    0,
    100
  );

  let structureScore = 50;
  const biasLower = bias.toLowerCase();
  if (biasLower.includes("bull")) structureScore = 72;
  else if (biasLower.includes("bear")) structureScore = 34;
  else structureScore = 52;

  let whaleBiasScore = 50;
  if (whale?.netBias === "Long Dominant") whaleBiasScore = 74;
  else if (whale?.netBias === "Short Dominant") whaleBiasScore = 31;
  else whaleBiasScore = 50;

  const liquidityRisk = clamp(
    45 +
      fundingExtremeScore * 0.4 +
      (signal === "WAIT" ? 8 : 0) +
      (Math.abs(c5 - c15) > 0.2 ? 10 : 0),
    0,
    100
  );

  const newsSentimentScore = clamp(
    regime.sentimentScore +
      (meta.className === "major" ? 6 : meta.className === "meme" ? -4 : 0) +
      (biasLower.includes("bull") ? 5 : biasLower.includes("bear") ? -5 : 0),
    0,
    100
  );

  const finalSetupScore = clamp(
    momentumScore * 0.22 +
      structureScore * 0.2 +
      derivativesScore * 0.15 +
      whaleBiasScore * 0.18 +
      newsSentimentScore * 0.15 +
      (100 - liquidityRisk) * 0.1,
    0,
    100
  );

  const confidenceScore = clamp(
    finalSetupScore * 0.55 +
      (signal === "WAIT" ? 8 : 16) +
      (oi > 0 ? 8 : 0) +
      (whale ? 10 : 0),
    0,
    100
  );

  let trendState = "Balanced";
  if (structureScore >= 65 && momentumScore >= 55) trendState = "Bullish Trend";
  else if (structureScore <= 40 && momentumScore <= 45) trendState = "Bearish Pressure";
  else if (liquidityRisk >= 65) trendState = "Trap Risk";
  else trendState = "Range / Rotation";

  let macroSentiment = "Neutral";
  if (newsSentimentScore >= 65) macroSentiment = "Constructive";
  else if (newsSentimentScore <= 40) macroSentiment = "Defensive";

  let liquiditySignal = "Balanced";
  if (liquidityRisk >= 72) liquiditySignal = "High Sweep Risk";
  else if (liquidityRisk >= 58) liquiditySignal = "Stop Hunt Risk";
  else if (liquidityRisk <= 38) liquiditySignal = "Cleaner Path";

  const setupDirection =
    finalSetupScore >= 62
      ? signal.includes("SHORT")
        ? "Short Setup"
        : "Long Setup"
      : signal === "WAIT"
      ? "Watchlist"
      : signal.includes("SHORT")
      ? "Cautious Short"
      : "Cautious Long";

  const entry = Number(coin?.entry || price);
  const sl = Number(coin?.sl || price * 0.985);
  const tp = Number(coin?.tp || price * 1.02);

  return {
    symbol: meta.symbol,
    key: meta.key,
    className: meta.className,
    chain: meta.chain,
    price: formatPrice(price),
    rawPrice: price,
    signal,
    bias,
    trendState,
    macroSentiment,
    setupDirection,
    momentumScore: Math.round(momentumScore),
    structureScore: Math.round(structureScore),
    derivativesScore: Math.round(derivativesScore),
    whaleBiasScore: Math.round(whaleBiasScore),
    newsSentimentScore: Math.round(newsSentimentScore),
    liquidityRisk: Math.round(liquidityRisk),
    finalSetupScore: Math.round(finalSetupScore),
    confidenceScore: Math.round(confidenceScore),
    scoreLabel: scoreToLabel(finalSetupScore),
    confidenceLabel: scoreToLabel(confidenceScore),
    liquiditySignal,
    funding: `${funding.toFixed(3)}%`,
    oi: formatUsd(oi),
    change5m: formatPercent(c5),
    change15m: formatPercent(c15),
    change1h: formatPercent(c1h),
    change4h: formatPercent(c4h),
    entry: formatPrice(entry),
    sl: formatPrice(sl),
    tp: formatPrice(tp),
    longShortContext: whale?.netBias || "Mixed",
    pendingOrders: whale?.pendingOrders ?? 0
  };
}

async function buildCoinFocusPackage() {
  if (isFresh(RUNTIME_CACHE.coinFocus.updatedAt, CACHE_TTL_MS) && RUNTIME_CACHE.coinFocus.list) {
    return RUNTIME_CACHE.coinFocus.list;
  }

  const overview = await getStableOverview();
  const liveCoins = await getAllStableCoins();
  const whalePkg = await buildWhalePackage();
  const regime = marketRegimeFromOverview(overview);

  const whaleSummaryMap = {};
  for (const item of whalePkg.summary) {
    whaleSummaryMap[item.symbol] = item;
  }

  const list = COIN_UNIVERSE.map((meta) =>
    buildCoinFocusItem(meta, liveCoins[meta.symbol] || {}, whaleSummaryMap, regime)
  ).sort((a, b) => b.finalSetupScore - a.finalSetupScore);

  RUNTIME_CACHE.coinFocus.list = list;
  RUNTIME_CACHE.coinFocus.updatedAt = now();

  return list;
}

module.exports = {
  scoreToLabel,
  marketRegimeFromOverview,
  buildCoinFocusItem,
  buildCoinFocusPackage
};
