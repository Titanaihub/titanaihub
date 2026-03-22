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

function analyzeStablecoinFlowItem(item) {
  const inflow = toNumFromUsdText(item?.exchangeInflow);
  const outflow = toNumFromUsdText(item?.exchangeOutflow);
  const net = toNumFromUsdText(item?.netFlow);
  const symbol = String(item?.symbol || "--");

  let state = "Neutral";
  let pressure = "Balanced";
  let score = 50;

  if (net > 0) {
    state = "Exchange Inflow Dominant";
    pressure = "Future Buy Support";
    score = 68;
  } else if (net < 0) {
    state = "Exchange Outflow Dominant";
    pressure = "Defensive / Capital Leaving";
    score = 36;
  }

  const magnitudeBoost = clamp(
    Math.abs(net) / 1000000 / 3,
    0,
    18
  );

  score = clamp(score + (net >= 0 ? magnitudeBoost : -magnitudeBoost * 0.7), 0, 100);

  let explanation = `${symbol} stablecoin flow is neutral.`;
  if (net > 0) {
    explanation = `${symbol} net inflow suggests more deployable capital on exchanges.`;
  } else if (net < 0) {
    explanation = `${symbol} net outflow suggests some capital is moving off exchanges.`;
  }

  return {
    symbol,
    inflow,
    outflow,
    net,
    state,
    pressure,
    score: Math.round(score),
    explanation
  };
}

function buildStablecoinAnalysis(flowList) {
  const items = Array.isArray(flowList) ? flowList.map(analyzeStablecoinFlowItem) : [];

  const totalNet = items.reduce((acc, item) => acc + item.net, 0);
  const avgScore =
    items.length > 0
      ? items.reduce((acc, item) => acc + item.score, 0) / items.length
      : 50;

  let marketLiquidityState = "Balanced";
  if (totalNet > 0) marketLiquidityState = "Buy-Side Support";
  else if (totalNet < 0) marketLiquidityState = "Defensive Liquidity";

  let liquidityPressure = "Neutral";
  if (avgScore >= 62) liquidityPressure = "Constructive";
  else if (avgScore <= 42) liquidityPressure = "Defensive";

  let explanation = "Stablecoin conditions are balanced.";
  if (marketLiquidityState === "Buy-Side Support") {
    explanation = "Net stablecoin flow is supportive for future buy-side participation.";
  } else if (marketLiquidityState === "Defensive Liquidity") {
    explanation = "Net stablecoin flow is defensive and may reduce immediate buying pressure.";
  }

  return {
    items,
    totalNet,
    averageScore: Math.round(avgScore),
    marketLiquidityState,
    liquidityPressure,
    explanation
  };
}

module.exports = {
  toNumFromUsdText,
  analyzeStablecoinFlowItem,
  buildStablecoinAnalysis
};
