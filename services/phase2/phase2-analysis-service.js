const { buildDecisionEngineProfile } = require("./decision-engine-service.js");

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(toNum(value, min), min), max);
}

function mergePhase2IntoSetupScore(setupScore, decisionProfile) {
  const micro = decisionProfile?.microstructure || {};
  const microScore = toNum(micro?.microstructureScore, 50);
  const decisionScore = toNum(decisionProfile?.decisionScore, 50);
  const oldConviction = toNum(setupScore?.convictionScore, 50);
  const oldRisk = toNum(setupScore?.riskScore, 50);

  const enhancedConviction = clamp(
    oldConviction * 0.72 + microScore * 0.14 + decisionScore * 0.14,
    0,
    100
  );

  const enhancedRisk = clamp(
    oldRisk * 0.72 +
      toNum(micro?.liquidationScore, 50) * 0.12 +
      toNum(micro?.volatilityScore, 50) * 0.08 +
      (String(micro?.orderBook?.spreadState || "") === "Wide Spread" ? 10 : 0) +
      (decisionProfile?.noTradeReason ? 10 : 0),
    0,
    100
  );

  return {
    ...setupScore,
    convictionScore: Math.round(enhancedConviction),
    riskScore: Math.round(enhancedRisk),
    phase2Enabled: true,
    microstructureScore: Math.round(microScore),
    decisionScore: Math.round(decisionScore),
    executionTier: decisionProfile?.executionTier || "No Trade",
    recommendedAction: decisionProfile?.recommendedAction || "Wait",
    noTradeReason: decisionProfile?.noTradeReason || "",
    riskFlags: Array.isArray(decisionProfile?.riskFlags)
      ? decisionProfile.riskFlags
      : []
  };
}

function buildPhase2Explanation(baseExplanation, decisionProfile) {
  const micro = decisionProfile?.microstructure || {};
  const extra = [
    `Microstructure is ${String(micro?.microstructureBias || "balanced").toLowerCase()}.`,
    `Tradeability is ${String(micro?.tradeabilityState || "unknown").toLowerCase()}.`,
    `Execution tier is ${String(decisionProfile?.executionTier || "No Trade").toLowerCase()}.`
  ];

  if (decisionProfile?.noTradeReason) {
    extra.push(`No-trade reason: ${decisionProfile.noTradeReason}.`);
  }

  if (Array.isArray(decisionProfile?.riskFlags) && decisionProfile.riskFlags.length) {
    extra.push(`Risk flags: ${decisionProfile.riskFlags.join(", ")}.`);
  }

  return `${String(baseExplanation || "").trim()} ${extra.join(" ")}`.trim();
}

async function buildPhase2AnalysisBlock({
  symbol,
  coin,
  setupScore,
  flowAnalysis,
  stablecoinContext,
  derivativesAnalysis,
  explanation
}) {
  const decisionProfile = await buildDecisionEngineProfile({
    symbol,
    coin,
    setupScore,
    flowAnalysis,
    stablecoinContext,
    derivativesAnalysis
  });

  const enhancedSetupScore = mergePhase2IntoSetupScore(setupScore, decisionProfile);
  const enhancedExplanation = buildPhase2Explanation(explanation, decisionProfile);

  return {
    decisionProfile,
    enhancedSetupScore,
    enhancedExplanation
  };
}

module.exports = {
  mergePhase2IntoSetupScore,
  buildPhase2Explanation,
  buildPhase2AnalysisBlock
};
