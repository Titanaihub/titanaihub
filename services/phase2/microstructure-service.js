const { getVolatilityProfile } = require("./volatility-service.js");
const { getOrderBookProfile } = require("./orderbook-service.js");
const { getLiquidationProfile } = require("./liquidation-service.js");

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(toNum(value, min), min), max);
}

function scoreOrderBook(profile) {
  const imbalance = toNum(profile?.top20ImbalancePct, 0);
  const spreadPct = toNum(profile?.spreadPct, 0);

  let score = 50;

  if (imbalance >= 20) score = 76;
  else if (imbalance >= 8) score = 64;
  else if (imbalance <= -20) score = 24;
  else if (imbalance <= -8) score = 36;

  if (spreadPct >= 0.08) score -= 8;
  else if (spreadPct <= 0.03) score += 4;

  return clamp(score, 0, 100);
}

function scoreVolatility(profile) {
  return clamp(profile?.score, 0, 100);
}

function scoreLiquidation(profile) {
  return clamp(profile?.liquidationScore, 0, 100);
}

function classifyTradeability({ volState, spreadState, liquidationState }) {
  const vol = String(volState || "");
  const spread = String(spreadState || "");
  const liq = String(liquidationState || "");

  if (spread === "Wide Spread") return "Low Tradeability";
  if (vol === "Extreme" && liq.includes("Risk")) return "Fragile / Sweep Risk";
  if (vol === "Compressed" && spread !== "Wide Spread") return "Breakout Watch";
  if (liq.includes("Risk")) return "Sweep Risk";
  return "Tradable";
}

function classifyMicrostructureBias({ bookPressureState, liquidationState, volatilityState }) {
  const book = String(bookPressureState || "");
  const liq = String(liquidationState || "");
  const vol = String(volatilityState || "");

  if (book === "Aggressive Bid Support" && !liq.includes("Long")) return "Bullish Microstructure";
  if (book === "Aggressive Ask Pressure" && !liq.includes("Short")) return "Bearish Microstructure";
  if (vol === "Compressed") return "Coiled / Balanced";
  return "Balanced";
}

function buildMicrostructureScore({ orderBookScore, volatilityScore, liquidationScore }) {
  return Math.round(
    clamp(
      orderBookScore * 0.42 +
        volatilityScore * 0.23 +
        liquidationScore * 0.35,
      0,
      100
    )
  );
}

async function getMicrostructureProfile(symbol) {
  let volatility = null;
  let orderBook = null;
  let liquidation = null;

  try {
    [volatility, orderBook, liquidation] = await Promise.all([
      getVolatilityProfile(symbol),
      getOrderBookProfile(symbol),
      getLiquidationProfile(symbol)
    ]);
  } catch (err) {
    // On production networks (Render/free tiers), Binance endpoints can be blocked or rate-limited.
    // Fallback with conservative defaults so /analysis/deep can still return partial data.
    console.error("microstructure profile fallback:", String(err?.message || err));

    const sym = String(symbol || "").trim().toUpperCase();
    const fallbackSpreadState = "Wide Spread";
    const fallbackBookPressureState = "Balanced";
    const fallbackVolState = "Extreme";
    const fallbackLiqState = "Balanced Liquidation Pressure";

    return {
      symbol: sym,
      futuresSymbol: "",
      volatility: {
        symbol: sym,
        futuresSymbol: "",
        state: fallbackVolState,
        score: 45,
        composite: 0
      },
      orderBook: {
        symbol: sym,
        futuresSymbol: "",
        bestBid: 0,
        bestAsk: 0,
        midPrice: 0,
        spread: 0,
        spreadPct: 0,
        bidNotionalTop5: 0,
        askNotionalTop5: 0,
        bidNotionalTop10: 0,
        askNotionalTop10: 0,
        bidNotionalTop20: 0,
        askNotionalTop20: 0,
        top5ImbalancePct: 0,
        top10ImbalancePct: 0,
        top20ImbalancePct: 0,
        wapBidTop10: 0,
        wapAskTop10: 0,
        imbalanceState: "Balanced Book",
        spreadState: fallbackSpreadState,
        bookPressureState: fallbackBookPressureState
      },
      liquidation: {
        symbol: sym,
        futuresSymbol: "",
        lastPrice: 0,
        priceChangePct: 0,
        oiChangePctAvg: 0,
        rangeHigh: 0,
        rangeLow: 0,
        rangeMid: 0,
        shortLiqNear: 0,
        shortLiqFar: 0,
        longLiqNear: 0,
        longLiqFar: 0,
        liquidationState: fallbackLiqState,
        liquidationScore: 45
      },

      orderBookScore: 50,
      volatilityScore: 50,
      liquidationScore: 50,
      microstructureScore: 50,

      tradeabilityState: "Low Tradeability",
      microstructureBias: "Balanced"
    };
  }

  const orderBookScore = scoreOrderBook(orderBook);
  const volatilityScore = scoreVolatility(volatility);
  const liquidationScore = scoreLiquidation(liquidation);

  const microstructureScore = buildMicrostructureScore({
    orderBookScore,
    volatilityScore,
    liquidationScore
  });

  const tradeabilityState = classifyTradeability({
    volState: volatility?.state,
    spreadState: orderBook?.spreadState,
    liquidationState: liquidation?.liquidationState
  });

  const microstructureBias = classifyMicrostructureBias({
    bookPressureState: orderBook?.bookPressureState,
    liquidationState: liquidation?.liquidationState,
    volatilityState: volatility?.state
  });

  return {
    symbol: volatility?.symbol || orderBook?.symbol || liquidation?.symbol || String(symbol || "").toUpperCase(),
    futuresSymbol:
      volatility?.futuresSymbol ||
      orderBook?.futuresSymbol ||
      liquidation?.futuresSymbol ||
      "",

    volatility,
    orderBook,
    liquidation,

    orderBookScore,
    volatilityScore,
    liquidationScore,
    microstructureScore,

    tradeabilityState,
    microstructureBias
  };
}

module.exports = {
  scoreOrderBook,
  scoreVolatility,
  scoreLiquidation,
  classifyTradeability,
  classifyMicrostructureBias,
  buildMicrostructureScore,
  getMicrostructureProfile
};
