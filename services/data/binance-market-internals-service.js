const https = require("https");

const BINANCE_FAPI_BASE = "https://fapi.binance.com";

const SYMBOL_MAP = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  BNB: "BNBUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT",
  DOGE: "DOGEUSDT",
  ADA: "ADAUSDT",
  LINK: "LINKUSDT",
  AVAX: "AVAXUSDT",
  TON: "TONUSDT",
  PEPE: "1000PEPEUSDT",
  WIF: "WIFUSDT",
  BONK: "1000BONKUSDT",
  FLOKI: "1000FLOKIUSDT",
  SHIB: "1000SHIBUSDT"
};

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          const status = res.statusCode || 500;

          try {
            const json = JSON.parse(data || "{}");
            if (status >= 200 && status < 300) {
              resolve(json);
            } else {
              reject(new Error(json?.msg || `Binance HTTP ${status}`));
            }
          } catch (err) {
            reject(new Error(`Invalid JSON from Binance: ${err.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function toFuturesSymbol(symbol) {
  return SYMBOL_MAP[normalizeSymbol(symbol)] || `${normalizeSymbol(symbol)}USDT`;
}

async function getGlobalLongShortRatio(symbol, period = "5m", limit = 30) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/futures/data/globalLongShortAccountRatio?symbol=${encodeURIComponent(
      futuresSymbol
    )}&period=${encodeURIComponent(period)}&limit=${encodeURIComponent(limit)}`
  );
}

async function getTopLongShortRatio(symbol, period = "5m", limit = 30) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/futures/data/topLongShortAccountRatio?symbol=${encodeURIComponent(
      futuresSymbol
    )}&period=${encodeURIComponent(period)}&limit=${encodeURIComponent(limit)}`
  );
}

async function getTopLongShortPositionRatio(symbol, period = "5m", limit = 30) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/futures/data/topLongShortPositionRatio?symbol=${encodeURIComponent(
      futuresSymbol
    )}&period=${encodeURIComponent(period)}&limit=${encodeURIComponent(limit)}`
  );
}

async function getTakerBuySellVolume(symbol, period = "5m", limit = 30) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/futures/data/takerlongshortRatio?symbol=${encodeURIComponent(
      futuresSymbol
    )}&period=${encodeURIComponent(period)}&limit=${encodeURIComponent(limit)}`
  );
}

async function getOpenInterestHist(symbol, period = "5m", limit = 30) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/futures/data/openInterestHist?symbol=${encodeURIComponent(
      futuresSymbol
    )}&period=${encodeURIComponent(period)}&limit=${encodeURIComponent(limit)}`
  );
}

async function getPremiumIndex(symbol) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(futuresSymbol)}`
  );
}

function getLast(arr) {
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
}

function getPrev(arr) {
  return Array.isArray(arr) && arr.length > 1 ? arr[arr.length - 2] : null;
}

function pctChange(current, previous) {
  const c = toNum(current, NaN);
  const p = toNum(previous, NaN);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return 0;
  return ((c - p) / p) * 100;
}

function classifyPressure({ takerRatio, globalRatio, topAccountRatio, topPositionRatio }) {
  const t = toNum(takerRatio, 1);
  const g = toNum(globalRatio, 1);
  const a = toNum(topAccountRatio, 1);
  const p = toNum(topPositionRatio, 1);

  const bullVotes = [t > 1, g > 1, a > 1, p > 1].filter(Boolean).length;
  const bearVotes = [t < 1, g < 1, a < 1, p < 1].filter(Boolean).length;

  if (bullVotes >= 3) return "Buy Pressure";
  if (bearVotes >= 3) return "Sell Pressure";
  return "Balanced";
}

function classifyCrowding({ globalRatio, topAccountRatio, topPositionRatio }) {
  const g = toNum(globalRatio, 1);
  const a = toNum(topAccountRatio, 1);
  const p = toNum(topPositionRatio, 1);

  const avg = (g + a + p) / 3;

  if (avg >= 1.25) return "Long Crowded";
  if (avg <= 0.8) return "Short Crowded";
  return "Balanced";
}

function classifyOIPressure({ oiChangePct, takerRatio }) {
  const oi = toNum(oiChangePct, 0);
  const taker = toNum(takerRatio, 1);

  if (oi > 1 && taker > 1.02) return "Aggressive Long Build";
  if (oi > 1 && taker < 0.98) return "Aggressive Short Build";
  if (oi < -1 && taker > 1.02) return "Short Covering";
  if (oi < -1 && taker < 0.98) return "Long Flush";
  return "Mixed Participation";
}

function classifyBasis(premiumPct) {
  const p = toNum(premiumPct, 0);
  if (p >= 0.08) return "Rich Premium";
  if (p <= -0.08) return "Discount";
  return "Neutral Basis";
}

async function getSymbolInternals(symbol) {
  const [
    premium,
    globalRatioRows,
    topAccountRows,
    topPositionRows,
    takerRows,
    oiRows
  ] = await Promise.all([
    getPremiumIndex(symbol),
    getGlobalLongShortRatio(symbol, "5m", 30),
    getTopLongShortRatio(symbol, "5m", 30),
    getTopLongShortPositionRatio(symbol, "5m", 30),
    getTakerBuySellVolume(symbol, "5m", 30),
    getOpenInterestHist(symbol, "5m", 30)
  ]);

  const lastGlobal = getLast(globalRatioRows);
  const lastTopAccount = getLast(topAccountRows);
  const lastTopPosition = getLast(topPositionRows);
  const lastTaker = getLast(takerRows);
  const lastOi = getLast(oiRows);
  const prevOi = getPrev(oiRows);

  const globalRatio = toNum(lastGlobal?.longShortRatio, 1);
  const topAccountRatio = toNum(lastTopAccount?.longShortRatio, 1);
  const topPositionRatio = toNum(lastTopPosition?.longShortRatio, 1);
  const takerRatio = toNum(lastTaker?.buySellRatio, 1);

  const oiNow = toNum(lastOi?.sumOpenInterestValue || lastOi?.sumOpenInterest, 0);
  const oiPrev = toNum(prevOi?.sumOpenInterestValue || prevOi?.sumOpenInterest, oiNow);
  const oiChangePct = pctChange(oiNow, oiPrev);

  const markPrice = toNum(premium?.markPrice, 0);
  const indexPrice = toNum(premium?.indexPrice, markPrice);
  const premiumPct = indexPrice !== 0 ? ((markPrice - indexPrice) / indexPrice) * 100 : 0;

  return {
    source: "binance-market-internals",
    symbol: normalizeSymbol(symbol),
    futuresSymbol: toFuturesSymbol(symbol),

    markPrice,
    indexPrice,
    premiumPct,

    globalLongShortRatio: globalRatio,
    topAccountLongShortRatio: topAccountRatio,
    topPositionLongShortRatio: topPositionRatio,
    takerBuySellRatio: takerRatio,

    openInterestValue: oiNow,
    openInterestChangePct: oiChangePct,

    pressureState: classifyPressure({
      takerRatio,
      globalRatio,
      topAccountRatio,
      topPositionRatio
    }),
    crowdingState: classifyCrowding({
      globalRatio,
      topAccountRatio,
      topPositionRatio
    }),
    oiPressureState: classifyOIPressure({
      oiChangePct,
      takerRatio
    }),
    basisState: classifyBasis(premiumPct)
  };
}

module.exports = {
  SYMBOL_MAP,
  normalizeSymbol,
  toFuturesSymbol,
  getSymbolInternals
};
