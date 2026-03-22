const {
  CACHE_TTL_MS,
  COIN_UNIVERSE,
  RUNTIME_CACHE
} = require("../config/constants.js");
const { isFresh, now } = require("../utils/helpers.js");
const { formatUsd, formatPrice, formatPercent } = require("../utils/formatters.js");
const { buildDeepAnalysisPackage } = require("./analysis-service.js");

function scoreToLabel(score) {
  const n = Number(score || 0);
  if (n >= 80) return "Very Strong";
  if (n >= 65) return "Strong";
  if (n >= 50) return "Moderate";
  if (n >= 35) return "Weak";
  return "Low";
}

function mapDeepAnalysisToCoinFocusItem(item) {
  const coin = item || {};
  const setup = coin.setupScore || {};
  const marketState = coin.marketState || {};
  const derivatives = coin.derivativesAnalysis || {};
  const whale = coin.whaleAnalysis || {};
  const stable = coin.stablecoinContext || {};

  const price = Number(coin.price || 0);
  const oi = Number(coin.oi || 0);

  return {
    symbol: coin.symbol || "--",
    key: coin.key || "",
    className: coin.className || "",
    chain: coin.chain || "",
    price: formatPrice(price),
    rawPrice: price,
    signal: coin.signal || "WAIT",
    bias: coin.bias || "Sideway",

    trendState: derivatives?.momentumState?.state || "Balanced",
    macroSentiment: marketState?.conviction || "Balanced",
    setupDirection: setup?.setupDirection || "Watchlist",

    momentumScore: Math.round(Number(setup?.momentumScore || derivatives?.momentumState?.momentumScore || 50)),
    structureScore: Math.round(Number(setup?.structureScore || 50)),
    derivativesScore: Math.round(
      Number(100 - (derivatives?.trapRiskScore ?? 50))
    ),
    whaleBiasScore: Math.round(Number(whale?.pressure?.pressureScore || 50)),
    newsSentimentScore: Math.round(Number(marketState?.sentimentScore || 50)),
    liquidityRisk: Math.round(Number(derivatives?.trapRiskScore || 50)),

    finalSetupScore: Math.round(Number(setup?.convictionScore || 50)),
    confidenceScore: Math.round(Number(setup?.executionReadinessScore || 50)),

    scoreLabel: scoreToLabel(setup?.convictionScore || 50),
    confidenceLabel: scoreToLabel(setup?.executionReadinessScore || 50),

    liquiditySignal:
      derivatives?.trapRisk === "High"
        ? "High Sweep Risk"
        : derivatives?.trapRisk === "Medium"
        ? "Stop Hunt Risk"
        : "Cleaner Path",

    funding: `${Number(coin.funding || 0).toFixed(3)}%`,
    oi: formatUsd(oi),
    change5m: formatPercent(coin.change5m || 0),
    change15m: formatPercent(coin.change15m || 0),
    change1h: formatPercent(coin.change1h || 0),
    change4h: formatPercent(coin.change4h || 0),

    entry: formatPrice(coin.entry || price),
    sl: formatPrice(coin.sl || price * 0.985),
    tp: formatPrice(coin.tp || price * 1.02),

    longShortContext: whale?.pressure?.netBias || whale?.pressure?.directionalBias || "Mixed",
    pendingOrders: Number(whale?.pressure?.pendingOrders || 0),

    tradeQuality: setup?.tradeQuality || "Average",
    executionMode: setup?.executionMode || "Wait Confirmation",
    riskScore: Math.round(Number(setup?.riskScore || 50)),
    marketRegime: marketState?.regime || "Neutral",
    stablecoinState: stable?.marketLiquidityState || "Balanced",
    explanation: coin.explanation || "",
    executionNotes: Array.isArray(coin.executionNotes) ? coin.executionNotes : []
  };
}

async function buildCoinFocusPackage() {
  if (isFresh(RUNTIME_CACHE.coinFocus.updatedAt, CACHE_TTL_MS) && RUNTIME_CACHE.coinFocus.list) {
    return RUNTIME_CACHE.coinFocus.list;
  }

  const deepPkg = await buildDeepAnalysisPackage();
  const deepCoins = Array.isArray(deepPkg?.coins) ? deepPkg.coins : [];

  const list = deepCoins
    .map(mapDeepAnalysisToCoinFocusItem)
    .filter((item) => COIN_UNIVERSE.some((c) => c.symbol === item.symbol))
    .sort((a, b) => Number(b.finalSetupScore || 0) - Number(a.finalSetupScore || 0));

  RUNTIME_CACHE.coinFocus.list = list;
  RUNTIME_CACHE.coinFocus.updatedAt = now();

  return list;
}

module.exports = {
  scoreToLabel,
  mapDeepAnalysisToCoinFocusItem,
  buildCoinFocusPackage
};
