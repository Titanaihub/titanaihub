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

function liquidityStateFromFlow(flowAnalysis) {
  const pressure = String(flowAnalysis?.pressure?.pressureState || "Balanced");
  const basis = String(flowAnalysis?.pressure?.basisState || "Neutral Basis");
  const oiPressure = String(flowAnalysis?.pressure?.oiPressureState || "Mixed Participation");

  if (pressure === "Buy Pressure" && oiPressure === "Aggressive Long Build") return "Aggressive Bid";
  if (pressure === "Sell Pressure" && oiPressure === "Aggressive Short Build") return "Aggressive Offer";
  if (basis === "Rich Premium") return "Premium Rich";
  if (basis === "Discount") return "Discounted";
  if (oiPressure === "Short Covering") return "Short Covering";
  if (oiPressure === "Long Flush") return "Long Flush";
  return "Balanced";
}

function mapDeepAnalysisToCoinFocusItem(item) {
  const coin = item || {};
  const setup = coin.setupScore || {};
  const marketState = coin.marketState || {};
  const derivatives = coin.derivativesAnalysis || {};
  const flowAnalysis = coin.whaleAnalysis || {};
  const stablecoinContext = coin.stablecoinContext || {};
  const phase2 = coin.phase2 || {};
  const micro = phase2.microstructure || {};
  const riskFlags = Array.isArray(setup.riskFlags) ? setup.riskFlags : [];

  const price = Number(coin.price || 0);
  const oi = Number(coin.oi || 0);

  return {
    symbol: coin.symbol || "--",
    key: coin.key || "",
    className: coin.className || "",
    chain: coin.chain || "",
    source: coin.source || "unknown",
    model: setup.model || "real-data-flow-core-phase2",

    price: formatPrice(price),
    rawPrice: price,
    signal: coin.signal || "WAIT",
    bias: coin.bias || "Sideway",

    trendState: derivatives?.momentumState?.state || "Balanced",
    macroSentiment: marketState?.conviction || "Balanced",
    marketRegime: marketState?.regime || "Neutral",
    setupDirection: setup?.setupDirection || "Watchlist",

    momentumScore: Math.round(
      Number(setup?.momentumScore || derivatives?.momentumState?.momentumScore || 50)
    ),
    structureScore: Math.round(Number(setup?.structureScore || 50)),
    derivativesScore: Math.round(Number(100 - (derivatives?.trapRiskScore ?? 50))),
    marketSentimentScore: Math.round(Number(setup?.marketSentimentScore || 50)),
    liquidityRisk: Math.round(Number(derivatives?.trapRiskScore || 50)),

    finalSetupScore: Math.round(Number(setup?.convictionScore || 50)),
    confidenceScore: Math.round(Number(setup?.executionReadinessScore || 50)),
    riskScore: Math.round(Number(setup?.riskScore || 50)),

    scoreLabel: scoreToLabel(setup?.convictionScore || 50),
    confidenceLabel: scoreToLabel(setup?.executionReadinessScore || 50),
    riskLabel: scoreToLabel(100 - Number(setup?.riskScore || 50)),

    liquiditySignal: liquidityStateFromFlow(flowAnalysis),

    funding: `${Number(coin.funding || 0).toFixed(4)}%`,
    oi: formatUsd(oi),
    change5m: formatPercent(coin.change5m || 0),
    change15m: formatPercent(coin.change15m || 0),
    change1h: formatPercent(coin.change1h || 0),
    change4h: formatPercent(coin.change4h || 0),

    entry: formatPrice(coin.entry || price),
    sl: formatPrice(coin.sl || price * 0.985),
    tp: formatPrice(coin.tp || price * 1.02),

    tradeQuality: setup?.tradeQuality || "Average",
    executionMode: setup?.executionMode || "Wait Confirmation",
    dataCompleteness: setup?.dataCompleteness || "Medium",

    derivativesState: derivatives?.oiPriceState?.oiState || "Mixed Participation",
    derivativesBias: derivatives?.oiPriceState?.derivativesBias || "Neutral",
    squeezeRisk: derivatives?.oiPriceState?.squeezeRisk || "Balanced",
    squeezeSide: derivatives?.oiPriceState?.squeezeSide || "None",
    fundingState: derivatives?.fundingState?.state || "Neutral",
    trapRisk: derivatives?.trapRisk || "Medium",

    realDataOnly: true,
    usesWhales: false,
    usesStablecoinFlow: false,
    usesRealFlow: true,

    flowDirection: flowAnalysis?.pressure?.directionalBias || "Balanced",
    flowPressure: flowAnalysis?.pressure?.pressureState || "Balanced",
    flowCrowding: flowAnalysis?.pressure?.crowdingState || "Balanced",
    flowOIState: flowAnalysis?.pressure?.oiPressureState || "Mixed Participation",
    flowBasisState: flowAnalysis?.pressure?.basisState || "Neutral Basis",
    flowScore: Number(flowAnalysis?.pressure?.compositeScore || 50),

    liquidityBackdrop: stablecoinContext?.marketLiquidityState || "Balanced",
    liquidityPressure: stablecoinContext?.liquidityPressure || "Balanced",

    phase2Enabled: Boolean(setup?.phase2Enabled),
    microstructureScore: Number(setup?.microstructureScore || 50),
    decisionScore: Number(setup?.decisionScore || 50),
    executionTier: setup?.executionTier || "No Trade",
    recommendedAction: setup?.recommendedAction || "Wait",
    noTradeReason: setup?.noTradeReason || "",
    riskFlags,

    microstructureBias: micro?.microstructureBias || "Balanced",
    tradeabilityState: micro?.tradeabilityState || "Unknown",
    volatilityState: micro?.volatility?.state || "Unknown",
    orderBookState: micro?.orderBook?.bookPressureState || "Unknown",
    spreadState: micro?.orderBook?.spreadState || "Unknown",
    liquidationState: micro?.liquidation?.liquidationState || "Unknown",

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
  liquidityStateFromFlow,
  mapDeepAnalysisToCoinFocusItem,
  buildCoinFocusPackage
};
