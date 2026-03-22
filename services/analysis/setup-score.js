const { clamp } = require("../../utils/helpers.js");

function scoreToLabel(score) {
  if (score >= 80) return "Very Strong";
  if (score >= 65) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 35) return "Weak";
  return "Low";
}

function deriveSetupDirection({ coin, marketState, derivativesAnalysis, whaleAnalysis, stablecoinAnalysis }) {
  const signal = String(coin?.signal || "WAIT").toUpperCase();
  const bias = String(coin?.bias || "").toLowerCase();
  const whaleBias = String(whaleAnalysis?.pressure?.directionalBias || "Neutral");
  const marketRegime = String(marketState?.regime || "Neutral");

  if (signal.includes("LONG")) {
    if (marketRegime === "Risk-Off" || marketRegime === "Panic") return "Cautious Long";
    if (whaleBias === "Bullish") return "Long Setup";
    return "Long Bias";
  }

  if (signal.includes("SHORT")) {
    if (marketRegime === "Risk-On" && whaleBias !== "Bearish") return "Cautious Short";
    if (whaleBias === "Bearish") return "Short Setup";
    return "Short Bias";
  }

  if (bias.includes("bull") && whaleBias === "Bullish") return "Watch Bullish Break";
  if (bias.includes("bear") && whaleBias === "Bearish") return "Watch Bearish Continuation";
  return "Watchlist";
}

function buildSetupScore({ coin, marketState, derivativesAnalysis, whaleAnalysis, stablecoinAnalysis }) {
  const momentumScore = Number(derivativesAnalysis?.momentumState?.momentumScore || 50);
  const fundingExtreme = Number(derivativesAnalysis?.fundingState?.extremeScore || 20);
  const trapRiskScore = Number(derivativesAnalysis?.trapRiskScore || 40);
  const whalePressureScore = Number(whaleAnalysis?.pressure?.pressureScore || 50);
  const sponsorScore = Number(whaleAnalysis?.sponsorScore || 50);
  const stablecoinScore = Number(stablecoinAnalysis?.averageScore || 50);
  const marketSentiment = Number(marketState?.sentimentScore || 50);
  const opportunityScore = Number(marketState?.opportunityScore || 50);
  const stressScore = Number(marketState?.stressScore || 50);

  const bias = String(coin?.bias || "").toLowerCase();
  let structureScore = 50;
  if (bias.includes("bull")) structureScore = 72;
  else if (bias.includes("bear")) structureScore = 34;
  else structureScore = 52;

  const convictionScore = clamp(
    momentumScore * 0.18 +
      structureScore * 0.18 +
      sponsorScore * 0.16 +
      whalePressureScore * 0.12 +
      stablecoinScore * 0.1 +
      marketSentiment * 0.1 +
      opportunityScore * 0.08 +
      (100 - trapRiskScore) * 0.08,
    0,
    100
  );

  const executionReadinessScore = clamp(
    convictionScore * 0.5 +
      (100 - fundingExtreme) * 0.12 +
      (100 - stressScore) * 0.1 +
      (Number(coin?.oi || 0) > 0 ? 10 : 0) +
      (String(coin?.signal || "WAIT").toUpperCase() === "WAIT" ? -6 : 8),
    0,
    100
  );

  const riskScore = clamp(
    trapRiskScore * 0.4 +
      fundingExtreme * 0.22 +
      stressScore * 0.2 +
      Number(whaleAnalysis?.conflict?.conflictScore || 25) * 0.18,
    0,
    100
  );

  const setupDirection = deriveSetupDirection({
    coin,
    marketState,
    derivativesAnalysis,
    whaleAnalysis,
    stablecoinAnalysis
  });

  let tradeQuality = "Average";
  if (convictionScore >= 72 && riskScore <= 42) tradeQuality = "High Quality";
  else if (convictionScore <= 40 || riskScore >= 70) tradeQuality = "Low Quality";

  let executionMode = "Wait Confirmation";
  if (executionReadinessScore >= 72 && riskScore <= 45) executionMode = "Execution Ready";
  else if (executionReadinessScore >= 58) executionMode = "Probe / Scale";
  else executionMode = "Wait Confirmation";

  return {
    setupDirection,
    structureScore: Math.round(structureScore),
    momentumScore: Math.round(momentumScore),
    sponsorScore: Math.round(sponsorScore),
    stablecoinScore: Math.round(stablecoinScore),
    marketSentimentScore: Math.round(marketSentiment),
    convictionScore: Math.round(convictionScore),
    executionReadinessScore: Math.round(executionReadinessScore),
    riskScore: Math.round(riskScore),
    tradeQuality,
    executionMode,
    convictionLabel: scoreToLabel(convictionScore),
    readinessLabel: scoreToLabel(executionReadinessScore),
    riskLabel: scoreToLabel(100 - riskScore)
  };
}

module.exports = {
  scoreToLabel,
  deriveSetupDirection,
  buildSetupScore
};
