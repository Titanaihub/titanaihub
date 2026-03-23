const { COIN_UNIVERSE } = require("../config/constants.js");
const { getStableOverview } = require("./overview-service.js");
const { getAllStableCoins } = require("./coin-service.js");
const { buildRealFlowPackage } = require("./real-flow-service.js");

const { detectMarketState } = require("./analysis/market-regime.js");
const { buildDerivativesAnalysis } = require("./analysis/derivatives-analysis.js");
const { buildExecutionNotes } = require("./analysis/explanation-builder.js");
const { buildPhase2AnalysisBlock } = require("./phase2/phase2-analysis-service.js");

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value || 0), min), max);
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildStablecoinContextFromLiquiditySummary(liquiditySummary) {
  const summaryState = String(liquiditySummary?.summaryState || "Unavailable");

  let averageScore = 50;
  if (summaryState === "Risk-On") averageScore = 65;
  else if (summaryState === "Defensive") averageScore = 35;

  return {
    items: [],
    totalNet: 0,
    averageScore,
    marketLiquidityState: summaryState,
    liquidityPressure: summaryState,
    explanation: "Liquidity state derived from real Binance futures internals."
  };
}

function buildFlowAnalysisForSymbol(symbol, realFlowPkg) {
  const summaryRows = Array.isArray(realFlowPkg?.positioningSummary)
    ? realFlowPkg.positioningSummary
    : [];
  const feedRows = Array.isArray(realFlowPkg?.flowFeed)
    ? realFlowPkg.flowFeed
    : [];

  const summary = summaryRows.find((row) => row.symbol === symbol) || null;
  const feed = feedRows.find((row) => row.symbol === symbol) || null;

  if (!summary && !feed) {
    return {
      pressure: {
        directionalBias: "Unavailable",
        pressureState: "Unavailable",
        crowdingState: "Unavailable",
        oiPressureState: "Unavailable",
        basisState: "Unavailable",
        pressureScore: 50,
        compositeScore: 50,
        explanation: "Real flow data unavailable for this symbol."
      },
      conflict: {
        conflict: "Unavailable",
        conflictScore: 50
      },
      sponsorScore: 50,
      sponsorState: "Unavailable"
    };
  }

  const directionalBias = summary?.directionalBias || "Balanced";
  const pressureState = summary?.pressureState || feed?.pressureState || "Balanced";
  const crowdingState = summary?.crowdingState || feed?.crowdingState || "Balanced";
  const oiPressureState = summary?.oiPressureState || feed?.oiPressureState || "Mixed Participation";
  const basisState = summary?.basisState || feed?.basisState || "Neutral Basis";
  const compositeScore = toNum(summary?.compositeScore, 50);

  let sponsorState = "Balanced";
  if (directionalBias === "Bullish Positioning") sponsorState = "Bullish Sponsor";
  else if (directionalBias === "Bearish Positioning") sponsorState = "Bearish Sponsor";

  return {
    pressure: {
      directionalBias,
      pressureState,
      crowdingState,
      oiPressureState,
      basisState,
      pressureScore: compositeScore,
      compositeScore,
      explanation: `Real flow shows ${directionalBias.toLowerCase()} with ${pressureState.toLowerCase()}, ${crowdingState.toLowerCase()}, and ${oiPressureState.toLowerCase()}.`
    },
    conflict: {
      conflict: "Low",
      conflictScore: 25
    },
    sponsorScore: compositeScore,
    sponsorState
  };
}

function buildRealOnlySetupScore({
  coin,
  marketState,
  derivativesAnalysis,
  flowAnalysis,
  stablecoinContext
}) {
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
  const sponsorScore = toNum(flowAnalysis?.sponsorScore, 50);
  const liquidityScore = toNum(stablecoinContext?.averageScore, 50);

  const convictionScore = clamp(
    momentumScore * 0.24 +
      structureScore * 0.18 +
      marketSentimentScore * 0.12 +
      opportunityScore * 0.10 +
      sponsorScore * 0.22 +
      liquidityScore * 0.06 +
      (100 - trapRiskScore) * 0.08,
    0,
    100
  );

  const executionReadinessScore = clamp(
    convictionScore * 0.5 +
      sponsorScore * 0.15 +
      (100 - fundingExtreme) * 0.1 +
      (100 - stressScore) * 0.1 +
      (toNum(coin?.oi, 0) > 0 ? 10 : 0) +
      (signal === "WAIT" ? -8 : 5),
    0,
    100
  );

  const riskScore = clamp(
    trapRiskScore * 0.4 +
      fundingExtreme * 0.16 +
      stressScore * 0.16 +
      (100 - sponsorScore) * 0.18 +
      (signal === "WAIT" ? 8 : 0) +
      (regime === "Panic" ? 10 : 0),
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
    model: "real-data-flow-core",
    usesWhales: false,
    usesStablecoinFlow: false,
    usesRealFlow: true,
    phase2Enabled: false,
    setupDirection,
    structureScore: Math.round(structureScore),
    momentumScore: Math.round(momentumScore),
    sponsorScore: Math.round(sponsorScore),
    stablecoinScore: Math.round(liquidityScore),
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

function buildRealFlowExplanation({
  symbol,
  marketState,
  derivativesAnalysis,
  flowAnalysis,
  stablecoinContext,
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
    `Real flow shows ${String(
      flowAnalysis?.pressure?.directionalBias || "balanced"
    ).toLowerCase()} with ${String(
      flowAnalysis?.pressure?.pressureState || "balanced"
    ).toLowerCase()} and ${String(
      flowAnalysis?.pressure?.crowdingState || "balanced"
    ).toLowerCase()}.`
  );

  lines.push(
    `Liquidity backdrop is ${String(
      stablecoinContext?.marketLiquidityState || "unavailable"
    ).toLowerCase()}.`
  );

  lines.push(
    `Final read: ${setupScore.setupDirection}, trade quality ${setupScore.tradeQuality.toLowerCase()}, execution mode ${setupScore.executionMode.toLowerCase()}.`
  );

  return lines.join(" ");
}

async function buildSingleCoinAnalysis({
  meta,
  coin,
  marketState,
  realFlowPkg,
  stablecoinContext
}) {
  const derivativesAnalysis = buildDerivativesAnalysis(coin || {});
  const flowAnalysis = buildFlowAnalysisForSymbol(meta.symbol, realFlowPkg);

  const baseSetupScore = buildRealOnlySetupScore({
    coin: coin || {},
    marketState,
    derivativesAnalysis,
    flowAnalysis,
    stablecoinContext
  });

  const baseExplanation = buildRealFlowExplanation({
    symbol: meta.symbol,
    marketState,
    derivativesAnalysis,
    flowAnalysis,
    stablecoinContext,
    setupScore: baseSetupScore
  });

  const phase2Block = await buildPhase2AnalysisBlock({
    symbol: meta.symbol,
    coin: coin || {},
    setupScore: baseSetupScore,
    flowAnalysis,
    stablecoinContext,
    derivativesAnalysis,
    explanation: baseExplanation
  });

  const setupScore = phase2Block?.enhancedSetupScore || baseSetupScore;
  const explanation = phase2Block?.enhancedExplanation || baseExplanation;
  const decisionProfile = phase2Block?.decisionProfile || null;

  const executionNotes = buildExecutionNotes({
    coin: coin || {},
    setupScore,
    derivativesAnalysis,
    whaleAnalysis: flowAnalysis
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
    whaleAnalysis: flowAnalysis,
    stablecoinContext: {
      marketLiquidityState: stablecoinContext.marketLiquidityState,
      liquidityPressure: stablecoinContext.liquidityPressure,
      averageScore: stablecoinContext.averageScore
    },
    phase2: decisionProfile,
    setupScore,
    explanation,
    executionNotes
  };
}

async function buildDeepAnalysisPackage() {
  const overview = await getStableOverview();
  const liveCoins = await getAllStableCoins();
  const realFlowPkg = await buildRealFlowPackage();

  const marketState = detectMarketState({
    marketBias: overview?.marketBias,
    fearGreed: overview?.fearGreed,
    btcDominance: overview?.btcDominance
  });

  const stablecoinAnalysis = buildStablecoinContextFromLiquiditySummary(
    realFlowPkg.liquiditySummary
  );

  const coins = await Promise.all(
    COIN_UNIVERSE.map((meta) =>
      buildSingleCoinAnalysis({
        meta,
        coin: liveCoins[meta.symbol] || {},
        marketState,
        realFlowPkg,
        stablecoinContext: stablecoinAnalysis
      })
    )
  );

  coins.sort(
    (a, b) =>
      Number(b?.setupScore?.convictionScore || 0) -
      Number(a?.setupScore?.convictionScore || 0)
  );

  return {
    mode: "real-data-flow-core-phase2",
    overview,
    marketState,
    stablecoinAnalysis,
    whales: {
      summary: realFlowPkg.positioningSummary,
      mixedFeed: realFlowPkg.flowFeed,
      stablecoinFlows: realFlowPkg.liquiditySummary,
      status: "real-flow-from-binance-internals"
    },
    coins
  };
}

module.exports = {
  buildStablecoinContextFromLiquiditySummary,
  buildFlowAnalysisForSymbol,
  buildRealOnlySetupScore,
  buildSingleCoinAnalysis,
  buildDeepAnalysisPackage
};
