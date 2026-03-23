const { getMicrostructureProfile } = require("./microstructure-service.js");

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(toNum(value, min), min), max);
}

function classifyExecutionTier(score) {
  const s = toNum(score, 0);
  if (s >= 78) return "Tier 1";
  if (s >= 64) return "Tier 2";
  if (s >= 50) return "Tier 3";
  return "No Trade";
}

function classifyNoTradeReason({
  tradeabilityState,
  volatilityState,
  spreadState,
  liquidationState,
  microstructureBias
}) {
  if (tradeabilityState === "Low Tradeability") {
    return "Spread too wide";
  }

  if (tradeabilityState === "Fragile / Sweep Risk") {
    return "High sweep risk";
  }

  if (volatilityState === "Extreme" && liquidationState.includes("Risk")) {
    return "Extreme volatility with liquidation risk";
  }

  if (
    microstructureBias === "Balanced" &&
    (liquidationState === "Balanced Liquidation Pressure" || spreadState === "Wide Spread")
  ) {
    return "No clear edge";
  }

  return "";
}

function deriveActionBias({ signal, bias, flowDirection, microstructureBias }) {
  const sig = String(signal || "WAIT").toUpperCase();
  const chartBias = String(bias || "").toLowerCase();
  const flow = String(flowDirection || "Balanced");
  const micro = String(microstructureBias || "Balanced");

  if (sig.includes("LONG")) {
    if (flow.includes("Bullish") || micro.includes("Bullish")) return "Long";
    return "Cautious Long";
  }

  if (sig.includes("SHORT")) {
    if (flow.includes("Bearish") || micro.includes("Bearish")) return "Short";
    return "Cautious Short";
  }

  if (chartBias.includes("bull") && micro.includes("Bullish")) return "Watch Long";
  if (chartBias.includes("bear") && micro.includes("Bearish")) return "Watch Short";
  return "Wait";
}

function buildDecisionScore({
  convictionScore,
  riskScore,
  flowScore,
  microstructureScore,
  tradeabilityState,
  liquidityBackdrop
}) {
  let score =
    toNum(convictionScore, 50) * 0.34 +
    (100 - toNum(riskScore, 50)) * 0.22 +
    toNum(flowScore, 50) * 0.18 +
    toNum(microstructureScore, 50) * 0.18 +
    (String(liquidityBackdrop || "").includes("Risk-On")
      ? 8
      : String(liquidityBackdrop || "").includes("Defensive")
      ? -8
      : 0);

  if (tradeabilityState === "Low Tradeability") score -= 18;
  if (tradeabilityState === "Fragile / Sweep Risk") score -= 14;
  if (tradeabilityState === "Breakout Watch") score -= 4;
  if (tradeabilityState === "Tradable") score += 4;

  return Math.round(clamp(score, 0, 100));
}

function buildRiskFlags({
  volatilityState,
  spreadState,
  liquidationState,
  crowdingState,
  fundingState
}) {
  const flags = [];

  if (volatilityState === "Extreme") flags.push("Extreme volatility");
  if (spreadState === "Wide Spread") flags.push("Wide spread");
  if (String(liquidationState || "").includes("Risk")) flags.push("Liquidation nearby");
  if (String(crowdingState || "").includes("Crowded")) flags.push("Crowded positioning");
  if (String(fundingState || "").includes("Extreme")) flags.push("Funding extreme");

  return flags;
}

async function buildDecisionEngineProfile({
  symbol,
  coin,
  setupScore,
  flowAnalysis,
  stablecoinContext,
  derivativesAnalysis
}) {
  const microstructure = await getMicrostructureProfile(symbol);

  const actionBias = deriveActionBias({
    signal: coin?.signal,
    bias: coin?.bias,
    flowDirection: flowAnalysis?.pressure?.directionalBias,
    microstructureBias: microstructure?.microstructureBias
  });

  const decisionScore = buildDecisionScore({
    convictionScore: setupScore?.convictionScore,
    riskScore: setupScore?.riskScore,
    flowScore: flowAnalysis?.pressure?.compositeScore,
    microstructureScore: microstructure?.microstructureScore,
    tradeabilityState: microstructure?.tradeabilityState,
    liquidityBackdrop: stablecoinContext?.marketLiquidityState
  });

  const noTradeReason = classifyNoTradeReason({
    tradeabilityState: microstructure?.tradeabilityState,
    volatilityState: microstructure?.volatility?.state,
    spreadState: microstructure?.orderBook?.spreadState,
    liquidationState: microstructure?.liquidation?.liquidationState,
    microstructureBias: microstructure?.microstructureBias
  });

  const executionTier = noTradeReason ? "No Trade" : classifyExecutionTier(decisionScore);

  const recommendedAction = noTradeReason
    ? "No Trade"
    : executionTier === "Tier 1"
    ? actionBias
    : executionTier === "Tier 2"
    ? actionBias
    : executionTier === "Tier 3"
    ? String(actionBias).startsWith("Watch")
      ? actionBias
      : `Probe ${actionBias}`
    : "Wait";

  const riskFlags = buildRiskFlags({
    volatilityState: microstructure?.volatility?.state,
    spreadState: microstructure?.orderBook?.spreadState,
    liquidationState: microstructure?.liquidation?.liquidationState,
    crowdingState: flowAnalysis?.pressure?.crowdingState,
    fundingState: derivativesAnalysis?.fundingState?.state
  });

  return {
    symbol: String(symbol || "").toUpperCase(),
    microstructure,
    decisionScore,
    executionTier,
    recommendedAction,
    noTradeReason,
    riskFlags
  };
}

module.exports = {
  classifyExecutionTier,
  classifyNoTradeReason,
  deriveActionBias,
  buildDecisionScore,
  buildRiskFlags,
  buildDecisionEngineProfile
};
