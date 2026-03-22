const { clamp } = require("../../utils/helpers.js");

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBiasText(value) {
  return String(value || "").trim().toLowerCase();
}

function detectMarketState({ marketBias, fearGreed, btcDominance }) {
  const bias = normalizeBiasText(marketBias);
  const fg = toNum(fearGreed, 50);
  const dom = toNum(btcDominance, 50);

  let regime = "Neutral";
  let sentimentScore = 50;
  let riskLevel = "Medium";
  let conviction = "Balanced";

  if (bias.includes("risk-off") || bias.includes("bear")) {
    regime = "Risk-Off";
    sentimentScore = 30;
    riskLevel = "High";
    conviction = "Defensive";
  } else if (bias.includes("risk-on") || bias.includes("bull")) {
    regime = "Risk-On";
    sentimentScore = 70;
    riskLevel = "Low";
    conviction = "Constructive";
  }

  if (fg <= 15) {
    regime = "Panic";
    sentimentScore = 18;
    riskLevel = "Very High";
    conviction = "Capitulation Risk";
  } else if (fg <= 25) {
    regime = regime === "Risk-On" ? "Neutral" : "Risk-Off";
    sentimentScore = Math.min(sentimentScore, 28);
    riskLevel = "High";
    conviction = "Fearful";
  } else if (fg >= 75) {
    sentimentScore = Math.max(sentimentScore, 76);
    conviction = "Crowded Risk-On";
  } else if (fg >= 60) {
    sentimentScore = Math.max(sentimentScore, 62);
  }

  let dominanceState = "Balanced";
  if (dom >= 58) dominanceState = "BTC Dominant";
  else if (dom <= 48) dominanceState = "Alt Rotation";

  let liquidityPreference = "Balanced";
  if (regime === "Panic" || regime === "Risk-Off") {
    liquidityPreference = dom >= 56 ? "Defensive Majors" : "Defensive Rotation";
  } else if (regime === "Risk-On") {
    liquidityPreference = dom <= 52 ? "Higher Beta" : "Majors First";
  }

  const stressScore = clamp(
    (100 - sentimentScore) * 0.6 +
      (dom >= 58 ? 10 : 0) +
      (fg <= 20 ? 18 : 0),
    0,
    100
  );

  const opportunityScore = clamp(
    sentimentScore * 0.55 +
      (dom <= 52 ? 10 : 0) +
      (fg >= 55 && fg <= 72 ? 8 : 0),
    0,
    100
  );

  let explanation = "Market is balanced with selective participation.";
  if (regime === "Panic") {
    explanation = "Extreme fear dominates. High volatility, high trap risk, and forced positioning likely.";
  } else if (regime === "Risk-Off") {
    explanation = "Defensive market tone. Protect capital and avoid over-aggressive positioning.";
  } else if (regime === "Risk-On") {
    explanation = "Constructive environment. Momentum can follow through, but crowding still matters.";
  }

  return {
    regime,
    sentimentScore: Math.round(sentimentScore),
    riskLevel,
    conviction,
    dominanceState,
    liquidityPreference,
    stressScore: Math.round(stressScore),
    opportunityScore: Math.round(opportunityScore),
    explanation
  };
}

module.exports = {
  detectMarketState
};
