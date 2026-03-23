const {
  CACHE_TTL_MS,
  COIN_UNIVERSE,
  RUNTIME_CACHE
} = require("../config/constants.js");
const { isFresh, now } = require("../utils/helpers.js");
const { formatUsd, formatPrice, formatPercent } = require("../utils/formatters.js");
const { getSymbolInternals } = require("./data/binance-market-internals-service.js");

function scorePressureState(value) {
  const v = String(value || "");
  if (v === "Buy Pressure") return 70;
  if (v === "Sell Pressure") return 30;
  return 50;
}

function scoreCrowdingState(value) {
  const v = String(value || "");
  if (v === "Long Crowded") return 72;
  if (v === "Short Crowded") return 28;
  return 50;
}

function scoreOIPressureState(value) {
  const v = String(value || "");
  if (v === "Aggressive Long Build") return 74;
  if (v === "Aggressive Short Build") return 26;
  if (v === "Short Covering") return 58;
  if (v === "Long Flush") return 42;
  return 50;
}

function scoreBasisState(value) {
  const v = String(value || "");
  if (v === "Rich Premium") return 62;
  if (v === "Discount") return 38;
  return 50;
}

function buildFlowFeedRow(meta, internals) {
  return {
    symbol: meta.symbol,
    chain: meta.chain,
    source: "binance-market-internals",
    futuresSymbol: internals.futuresSymbol,

    markPrice: formatPrice(internals.markPrice),
    indexPrice: formatPrice(internals.indexPrice),
    premiumPct: formatPercent(internals.premiumPct),

    globalLongShortRatio: Number(internals.globalLongShortRatio || 0).toFixed(3),
    topAccountLongShortRatio: Number(internals.topAccountLongShortRatio || 0).toFixed(3),
    topPositionLongShortRatio: Number(internals.topPositionLongShortRatio || 0).toFixed(3),
    takerBuySellRatio: Number(internals.takerBuySellRatio || 0).toFixed(3),

    openInterestValue: formatUsd(internals.openInterestValue),
    openInterestChangePct: formatPercent(internals.openInterestChangePct),

    pressureState: internals.pressureState,
    crowdingState: internals.crowdingState,
    oiPressureState: internals.oiPressureState,
    basisState: internals.basisState
  };
}

function buildPositioningSummaryRow(meta, internals) {
  const pressureScore = scorePressureState(internals.pressureState);
  const crowdingScore = scoreCrowdingState(internals.crowdingState);
  const oiScore = scoreOIPressureState(internals.oiPressureState);
  const basisScore = scoreBasisState(internals.basisState);

  const compositeScore = Math.round(
    pressureScore * 0.3 +
      crowdingScore * 0.2 +
      oiScore * 0.35 +
      basisScore * 0.15
  );

  let directionalBias = "Balanced";
  if (compositeScore >= 60) directionalBias = "Bullish Positioning";
  else if (compositeScore <= 40) directionalBias = "Bearish Positioning";

  return {
    symbol: meta.symbol,
    source: "binance-market-internals",
    directionalBias,
    compositeScore,

    pressureState: internals.pressureState,
    crowdingState: internals.crowdingState,
    oiPressureState: internals.oiPressureState,
    basisState: internals.basisState,

    globalLongShortRatio: Number(internals.globalLongShortRatio || 0).toFixed(3),
    topAccountLongShortRatio: Number(internals.topAccountLongShortRatio || 0).toFixed(3),
    topPositionLongShortRatio: Number(internals.topPositionLongShortRatio || 0).toFixed(3),
    takerBuySellRatio: Number(internals.takerBuySellRatio || 0).toFixed(3),

    openInterestValue: formatUsd(internals.openInterestValue),
    openInterestChangePct: formatPercent(internals.openInterestChangePct),
    premiumPct: formatPercent(internals.premiumPct)
  };
}

function buildLiquiditySummary(flowRows) {
  const rows = Array.isArray(flowRows) ? flowRows : [];
  if (!rows.length) {
    return {
      source: "binance-market-internals",
      totalSymbols: 0,
      buyPressureCount: 0,
      sellPressureCount: 0,
      balancedCount: 0,
      longCrowdedCount: 0,
      shortCrowdedCount: 0,
      richPremiumCount: 0,
      discountCount: 0,
      summaryState: "Unavailable"
    };
  }

  const buyPressureCount = rows.filter((r) => r.pressureState === "Buy Pressure").length;
  const sellPressureCount = rows.filter((r) => r.pressureState === "Sell Pressure").length;
  const balancedCount = rows.filter((r) => r.pressureState === "Balanced").length;

  const longCrowdedCount = rows.filter((r) => r.crowdingState === "Long Crowded").length;
  const shortCrowdedCount = rows.filter((r) => r.crowdingState === "Short Crowded").length;

  const richPremiumCount = rows.filter((r) => r.basisState === "Rich Premium").length;
  const discountCount = rows.filter((r) => r.basisState === "Discount").length;

  let summaryState = "Balanced";
  if (sellPressureCount > buyPressureCount + 2) summaryState = "Defensive";
  else if (buyPressureCount > sellPressureCount + 2) summaryState = "Risk-On";

  return {
    source: "binance-market-internals",
    totalSymbols: rows.length,
    buyPressureCount,
    sellPressureCount,
    balancedCount,
    longCrowdedCount,
    shortCrowdedCount,
    richPremiumCount,
    discountCount,
    summaryState
  };
}

async function buildRealFlowPackage() {
  if (isFresh(RUNTIME_CACHE.whales.updatedAt, CACHE_TTL_MS) && RUNTIME_CACHE.whales.allRows) {
    return {
      flowFeed: RUNTIME_CACHE.whales.allRows,
      positioningSummary: RUNTIME_CACHE.whales.summary,
      liquiditySummary: RUNTIME_CACHE.whales.stablecoinFlows
    };
  }

  const feed = [];
  const summary = [];

  for (const meta of COIN_UNIVERSE) {
    try {
      const internals = await getSymbolInternals(meta.symbol);
      feed.push(buildFlowFeedRow(meta, internals));
      summary.push(buildPositioningSummaryRow(meta, internals));
    } catch (err) {
      console.error(`real flow failed ${meta.symbol}:`, err.message);
    }
  }

  summary.sort((a, b) => Number(b.compositeScore || 0) - Number(a.compositeScore || 0));
  const liquiditySummary = buildLiquiditySummary(feed);

  RUNTIME_CACHE.whales.allRows = feed;
  RUNTIME_CACHE.whales.summary = summary;
  RUNTIME_CACHE.whales.stablecoinFlows = liquiditySummary;
  RUNTIME_CACHE.whales.updatedAt = now();

  return {
    flowFeed: feed,
    positioningSummary: summary,
    liquiditySummary
  };
}

module.exports = {
  buildFlowFeedRow,
  buildPositioningSummaryRow,
  buildLiquiditySummary,
  buildRealFlowPackage
};
