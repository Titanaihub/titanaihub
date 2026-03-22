const { COIN_UNIVERSE } = require("../config/constants.js");
const { getStableOverview } = require("./overview-service.js");
const { getAllStableCoins } = require("./coin-service.js");

const { detectMarketState } = require("./analysis/market-regime.js");
const { buildDerivativesAnalysis } = require("./analysis/derivatives-analysis.js");
const {
  buildAnalysisExplanation,
  buildExecutionNotes
} = require("./analysis/explanation-builder.js");

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value || 0), min), max);
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildUnavailableWhaleAnalysis() {
  return {
    pressure: {
      longUsd: 0,
      shortUsd: 0,
      totalOpen: 0,
      imbalancePct: 0,
      pendingOrders: 0,
      whaleCount: 0,
      netBias: "Unavailable",
      pressureState: "Unavailable",
      directionalBias: "Unavailable",
      pressureScore: 50,
      absorptionState: "Unavailable",
      routeState: "Unavailable",
      explanation: "Whale analysis disabled until real on-chain / flow source is connected."
    },
    conflict: {
      conflict: "Unavailable",
      conflictScore: 50
    },
    sponsorScore: 50,
    sponsorState: "Unavailable"
  };
}

function buildUnavailableStablecoinContext() {
  return {
    items: [],
    totalNet: 0,
    averageScore: 50,
    marketLiquidityState: "Unavailable",
    liquidityPressure: "Unavailable",
    explanation: "Stablecoin exchange-flow analysis disabled until real provider is connected."
  };
}

function buildRealOnlySetupScore({ coin, marketState, derivativesAnalysis }) {
  const momentumScore = toNum(derivativesAnalysis?.momentumState?.momentumScore, 50);
  const trapRiskScore = toNum(derivativesAnalysis?.trapRiskScore, 50);
  const fundingExtreme = toNum(derivativesAnalysis?.fundingState?.extremeScore, 20);

  const bias = String(coin?.bias || "").toLowerCase();
  const signal = String(coin?.signal || "WAIT").toUpperCase();
  const regime = String(marketState?.regime || "Neutral");

  let structureScore = 50;
  if (bias.includes("bull")) structureScore = 72;
  else if (bias.includes("bear")) structureScore = 34;
  else structureScore = 52;

  const marketSentimentScore = toNum(marketState?.sentimentScore, 50);
  const stressScore = toNum(marketState?.stressScore, 50);
  const opportunityScore = toNum(marketState?.opportunityScore, 50);

  const convictionScore = clamp(
    momentumScore * 0.34 +
      structureScore * 0.26 +
      marketSentimentScore * 0.16 +
      opportunityScore * 0.12 +
      (100 - trapRiskScore) * 0.12,
    0,
    100
  );

  const executionReadinessScore = clamp(
    convictionScore * 0.56 +
      (100 - fundingExtreme) * 0.14 +
      (100 - stressScore) * 0.12 +
      (toNum(coin?.oi, 0) > 0 ? 10 : 0) +
      (signal === "WAIT" ? -8 : 6),
    0,
    100
  );

  const riskScore = clamp(
    trapRiskScore * 0.48 +
      fundingExtreme * 0.22 +
      stressScore * 0.2 +
      (signal === "WAIT" ? 8 : 0) +
      (regime === "Panic" ? 12 : 0),
    0,
    100
  );

  let setupDirection = "Watchlist";
  if (signal.includes("LONG")) {
    setupDirection = regime === "Risk-Off" || regime === "Panic" ? "Cautious Long" : "Long Setup";
  } else if (signal.includes("SHORT")) {
    setupDirection = regime === "Risk-On" ? "Cautious Short" : "Short Setup";
  } else if (bias.includes("bull")) {
    setupDirection = "Watch Bullish Break";
  } else if (bias.includes("bear")) {
    setupDirection = "Watch Bearish Continuation";
  }

  let tradeQuality = "Average";
  if (convictionScore >= 72 && riskScore <= 42) tradeQuality = "High Quality";
  else if (convictionScore <= 40 || riskScore >= 70) tradeQuality = "Low Quality";

  let executionMode = "Wait Confirmation";
  if (executionReadinessScore >= 72 && riskScore <= 45) executionMode = "Execution Ready";
  else if (executionReadinessScore >= 58) executionMode = "Probe / Scale";

  return {
    model: "real-data-only-core",
    usesWhales: false,
    usesStablecoinFlow: false,
    setupDirection,
    structureScore: Math.round(structureScore),
    momentumScore: Math.round(momentumScore),
    sponsorScore: 50,
    stablecoinScore: 50,
    marketSentimentScore: Math.round(marketSentimentScore),
    convictionScore: Math.round(convictionScore),
    executionReadinessScore: Math.round(executionReadinessScore),
    riskScore: Math.round(riskScore),
    tradeQuality,
    executionMode,
    dataCompleteness:
      toNum(coin?.price, 0) > 0 && toNum(coin?.oi, 0) > 0 ? "High" : "Medium"
  };
}

function buildRealOnlyExplanation({
  symbol,
  marketState,
  derivativesAnalysis,
  setupScore
}) {
  const lines = [];

  lines.push(
    `${symbol} is evaluated in ${marketState.regime} conditions with ${String(
      marketState.conviction || "balanced"
    ).toLowerCase()} market tone.`
  );

  lines.push(
    `Momentum is ${String(
      derivativesAnalysis?.momentumState?.state || "balanced"
    ).toLowerCase()} and OI/price behaviour shows ${String(
      derivativesAnalysis?.oiPriceState?.oiState || "mixed participation"
    ).toLowerCase()}.`
  );

  lines.push(
    `Funding is ${String(
      derivativesAnalysis?.fundingState?.state || "neutral"
    ).toLowerCase()} with trap risk ${String(
      derivativesAnalysis?.trapRisk || "medium"
    ).toLowerCase()}.`
  );

  lines.push(
    `This score currently uses real futures market data only. Whale flow and stablecoin exchange-flow are excluded until real providers are connected.`
  );

  lines.push(
    `Final read: ${setupScore.setupDirection}, trade quality ${setupScore.tradeQuality.toLowerCase()}, execution mode ${setupScore.executionMode.toLowerCase()}.`
  );

  return lines.join(" ");
}

function buildSingleCoinAnalysis({ meta, coin, marketState }) {
  const derivativesAnalysis = buildDerivativesAnalysis(coin || {});
  const whaleAnalysis = buildUnavailableWhaleAnalysis();
  const stablecoinAnalysis = buildUnavailableStablecoinContext();

  const setupScore = buildRealOnlySetupScore({
    coin: coin || {},
    marketState,
    derivativesAnalysis
  });

  const explanation = buildRealOnlyExplanation({
    symbol: meta.symbol,
    marketState,
    derivativesAnalysis,
    setupScore
  });

  const executionNotes = buildExecutionNotes({
    coin: coin || {},
    setupScore,
    derivativesAnalysis,
    whaleAnalysis
  });

  return {
    symbol: meta.symbol,
    key: meta.key,
    className: meta.className,
    chain: meta.chain,
    source: coin?.source || "unknown",
    price: coin?.price ?? meta.fallbackPrice,
    signal: coin?.signal || "WAIT",
    bias: coin?.bias || "Sideway",
    funding: coin?.funding ?? 0,
    oi: coin?.oi ?? 0,
    change5m: coin?.change5m ?? 0,
    change15m: coin?.change15m ?? 0,
    change1h: coin?.change1h ?? 0,
    change4h: coin?.change4h ?? 0,
    entry: coin?.entry ?? meta.fallbackPrice,
    sl: coin?.sl ?? meta.fallbackPrice * 0.985,
    tp: coin?.tp ?? meta.fallbackPrice * 1.02,

    marketState,
    derivativesAnalysis,
    whaleAnalysis,
    stablecoinContext: {
      marketLiquidityState: stablecoinAnalysis.marketLiquidityState,
      liquidityPressure: stablecoinAnalysis.liquidityPressure,
      averageScore: stablecoinAnalysis.averageScore
    },
    setupScore,
    explanation,
    executionNotes
  };
}

async function buildDeepAnalysisPackage() {
  const overview = await getStableOverview();
  const liveCoins = await getAllStableCoins();

  const marketState = detectMarketState({
    marketBias: overview?.marketBias,
    fearGreed: overview?.fearGreed,
    btcDominance: overview?.btcDominance
  });

  const stablecoinAnalysis = buildUnavailableStablecoinContext();

  const coins = COIN_UNIVERSE.map((meta) =>
    buildSingleCoinAnalysis({
      meta,
      coin: liveCoins[meta.symbol] || {},
      marketState
    })
  ).sort(
    (a, b) =>
      Number(b?.setupScore?.convictionScore || 0) -
      Number(a?.setupScore?.convictionScore || 0)
  );

  return {
    mode: "real-data-only-core",
    overview,
    marketState,
    stablecoinAnalysis,
    whales: {
      summary: [],
      mixedFeed: [],
      stablecoinFlows: [],
      status: "disabled-until-real-provider"
    },
    coins
  };
}

module.exports = {
  buildUnavailableWhaleAnalysis,
  buildUnavailableStablecoinContext,
  buildRealOnlySetupScore,
  buildSingleCoinAnalysis,
  buildDeepAnalysisPackage
};
