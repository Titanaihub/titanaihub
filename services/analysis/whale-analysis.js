const { clamp } = require("../../utils/helpers.js");

function toNumFromUsdText(value) {
  const s = String(value || "").trim().replace(/\$/g, "").toUpperCase();
  if (!s) return 0;

  if (s.endsWith("T")) return Number(s.slice(0, -1)) * 1e12 || 0;
  if (s.endsWith("B")) return Number(s.slice(0, -1)) * 1e9 || 0;
  if (s.endsWith("M")) return Number(s.slice(0, -1)) * 1e6 || 0;
  if (s.endsWith("K")) return Number(s.slice(0, -1)) * 1e3 || 0;

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function buildWhalePressure(whaleSummaryItem) {
  const longUsd = toNumFromUsdText(whaleSummaryItem?.openLongUsd);
  const shortUsd = toNumFromUsdText(whaleSummaryItem?.openShortUsd);
  const pendingOrders = Number(whaleSummaryItem?.pendingOrders || 0);
  const whaleCount = Number(whaleSummaryItem?.whaleCount || 0);
  const netBias = String(whaleSummaryItem?.netBias || "Mixed");

  const totalOpen = longUsd + shortUsd;
  const imbalancePct =
    totalOpen > 0 ? ((longUsd - shortUsd) / totalOpen) * 100 : 0;

  let pressureState = "Balanced";
  let directionalBias = "Neutral";
  let pressureScore = 50;

  if (netBias === "Long Dominant") {
    pressureState = "Bullish Whale Pressure";
    directionalBias = "Bullish";
    pressureScore = 72;
  } else if (netBias === "Short Dominant") {
    pressureState = "Bearish Whale Pressure";
    directionalBias = "Bearish";
    pressureScore = 30;
  }

  pressureScore = clamp(
    pressureScore +
      Math.sign(imbalancePct) * Math.min(Math.abs(imbalancePct) * 0.22, 12) +
      Math.min(pendingOrders * 1.8, 10) +
      Math.min(whaleCount * 0.5, 8),
    0,
    100
  );

  let absorptionState = "Low";
  if (pendingOrders >= 8) absorptionState = "High";
  else if (pendingOrders >= 4) absorptionState = "Medium";

  let routeState = "Internal Positioning";
  if (pressureState === "Bullish Whale Pressure" && absorptionState !== "Low") {
    routeState = "Bid Support / Layered Buy Interest";
  } else if (pressureState === "Bearish Whale Pressure" && absorptionState !== "Low") {
    routeState = "Offer Pressure / Layered Sell Interest";
  }

  let explanation = "Whale participation is mixed without a strong directional edge.";
  if (pressureState === "Bullish Whale Pressure") {
    explanation =
      "Open long exposure outweighs open short exposure, suggesting buy-side whale sponsorship.";
  } else if (pressureState === "Bearish Whale Pressure") {
    explanation =
      "Open short exposure outweighs open long exposure, suggesting defensive or bearish whale pressure.";
  }

  return {
    longUsd,
    shortUsd,
    totalOpen,
    imbalancePct: Number(imbalancePct.toFixed(2)),
    pendingOrders,
    whaleCount,
    netBias,
    pressureState,
    directionalBias,
    pressureScore: Math.round(pressureScore),
    absorptionState,
    routeState,
    explanation
  };
}

function detectWhaleConflict(coinBias, whalePressure) {
  const bias = String(coinBias || "").toLowerCase();
  const whaleDir = String(whalePressure?.directionalBias || "Neutral");

  let conflict = "No Major Conflict";
  let conflictScore = 18;

  if (bias.includes("bull") && whaleDir === "Bearish") {
    conflict = "Bullish Chart vs Bearish Whales";
    conflictScore = 72;
  } else if (bias.includes("bear") && whaleDir === "Bullish") {
    conflict = "Bearish Chart vs Bullish Whales";
    conflictScore = 68;
  } else if (whaleDir === "Neutral") {
    conflict = "No Clear Whale Bias";
    conflictScore = 34;
  }

  return {
    conflict,
    conflictScore
  };
}

function buildWhaleAnalysis(coin, whaleSummaryItem) {
  const pressure = buildWhalePressure(whaleSummaryItem);
  const conflict = detectWhaleConflict(coin?.bias, pressure);

  const sponsorScore = clamp(
    pressure.pressureScore * 0.7 + (100 - conflict.conflictScore) * 0.3,
    0,
    100
  );

  let sponsorState = "Neutral";
  if (sponsorScore >= 68) sponsorState = "Supported";
  else if (sponsorScore <= 38) sponsorState = "Unsupportive";

  return {
    pressure,
    conflict,
    sponsorScore: Math.round(sponsorScore),
    sponsorState
  };
}

module.exports = {
  toNumFromUsdText,
  buildWhalePressure,
  detectWhaleConflict,
  buildWhaleAnalysis
};
