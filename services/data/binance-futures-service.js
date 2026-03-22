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
    const req = https.get(url, (res) => {
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
    });

    req.on("error", reject);
    req.end();
  });
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeInputSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function toBinanceSymbol(symbol) {
  const normalized = normalizeInputSymbol(symbol);
  return SYMBOL_MAP[normalized] || `${normalized}USDT`;
}

async function getPremiumIndex(symbol) {
  const futuresSymbol = toBinanceSymbol(symbol);
  return getJson(`${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(futuresSymbol)}`);
}

async function getOpenInterest(symbol) {
  const futuresSymbol = toBinanceSymbol(symbol);
  return getJson(`${BINANCE_FAPI_BASE}/fapi/v1/openInterest?symbol=${encodeURIComponent(futuresSymbol)}`);
}

async function getTicker24h(symbol) {
  const futuresSymbol = toBinanceSymbol(symbol);
  return getJson(`${BINANCE_FAPI_BASE}/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(futuresSymbol)}`);
}

async function getKlines(symbol, interval = "5m", limit = 50) {
  const futuresSymbol = toBinanceSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(
      futuresSymbol
    )}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`
  );
}

function getClosePriceFromKlines(klines, indexFromEnd) {
  if (!Array.isArray(klines) || klines.length === 0) return null;
  const index = klines.length - 1 - indexFromEnd;
  if (index < 0 || !klines[index]) return null;
  return toNum(klines[index][4], null);
}

function calcPctChange(current, previous) {
  const c = toNum(current, null);
  const p = toNum(previous, null);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return 0;
  return ((c - p) / p) * 100;
}

async function getMultiTimeframeChanges(symbol) {
  const [k5m, k15m, k1h, k4h] = await Promise.all([
    getKlines(symbol, "5m", 4),
    getKlines(symbol, "15m", 4),
    getKlines(symbol, "1h", 4),
    getKlines(symbol, "4h", 4)
  ]);

  const price5mNow = getClosePriceFromKlines(k5m, 0);
  const price5mPrev = getClosePriceFromKlines(k5m, 1);

  const price15mNow = getClosePriceFromKlines(k15m, 0);
  const price15mPrev = getClosePriceFromKlines(k15m, 1);

  const price1hNow = getClosePriceFromKlines(k1h, 0);
  const price1hPrev = getClosePriceFromKlines(k1h, 1);

  const price4hNow = getClosePriceFromKlines(k4h, 0);
  const price4hPrev = getClosePriceFromKlines(k4h, 1);

  return {
    change5m: calcPctChange(price5mNow, price5mPrev),
    change15m: calcPctChange(price15mNow, price15mPrev),
    change1h: calcPctChange(price1hNow, price1hPrev),
    change4h: calcPctChange(price4hNow, price4hPrev)
  };
}

function deriveBiasAndSignal({ change15m, change1h, change4h, funding }) {
  const c15 = toNum(change15m, 0);
  const c1 = toNum(change1h, 0);
  const c4 = toNum(change4h, 0);
  const f = toNum(funding, 0);

  let bias = "Sideway";
  let signal = "WAIT";

  if (c15 > 0 && c1 > 0 && c4 > 0) {
    bias = "Bullish";
    signal = f > 0.015 ? "WAIT" : "LONG";
  } else if (c15 < 0 && c1 < 0 && c4 < 0) {
    bias = "Bearish";
    signal = f < -0.015 ? "WAIT" : "SHORT";
  } else if (c4 > 0 && c15 < 0) {
    bias = "Bullish Pullback";
    signal = "WAIT";
  } else if (c4 < 0 && c15 > 0) {
    bias = "Bearish Bounce";
    signal = "WAIT";
  }

  return { bias, signal };
}

function deriveTradeLevels(price, signal) {
  const p = toNum(price, 0);
  if (!Number.isFinite(p) || p <= 0) {
    return { entry: 0, sl: 0, tp: 0 };
  }

  if (String(signal).toUpperCase().includes("LONG")) {
    return {
      entry: p,
      sl: p * 0.985,
      tp: p * 1.02
    };
  }

  if (String(signal).toUpperCase().includes("SHORT")) {
    return {
      entry: p,
      sl: p * 1.015,
      tp: p * 0.98
    };
  }

  return {
    entry: p,
    sl: p * 0.99,
    tp: p * 1.01
  };
}

async function getBinanceFuturesSnapshot(symbol) {
  const [premiumIndex, openInterest, ticker24h, changes] = await Promise.all([
    getPremiumIndex(symbol),
    getOpenInterest(symbol),
    getTicker24h(symbol),
    getMultiTimeframeChanges(symbol)
  ]);

  const price = toNum(premiumIndex?.markPrice || ticker24h?.lastPrice, 0);
  const funding = toNum(premiumIndex?.lastFundingRate, 0) * 100;
  const oi = toNum(openInterest?.openInterest, 0) * price;

  const { bias, signal } = deriveBiasAndSignal({
    change15m: changes.change15m,
    change1h: changes.change1h,
    change4h: changes.change4h,
    funding
  });

  const levels = deriveTradeLevels(price, signal);

  return {
    source: "binance-futures",
    symbol: normalizeInputSymbol(symbol),
    futuresSymbol: toBinanceSymbol(symbol),
    price,
    funding,
    oi,
    change5m: changes.change5m,
    change15m: changes.change15m,
    change1h: changes.change1h,
    change4h: changes.change4h,
    bias,
    signal,
    entry: levels.entry,
    sl: levels.sl,
    tp: levels.tp,
    volume24h: toNum(ticker24h?.quoteVolume, 0),
    priceChangePercent24h: toNum(ticker24h?.priceChangePercent, 0)
  };
}

module.exports = {
  BINANCE_FAPI_BASE,
  SYMBOL_MAP,
  normalizeInputSymbol,
  toBinanceSymbol,
  getPremiumIndex,
  getOpenInterest,
  getTicker24h,
  getKlines,
  getMultiTimeframeChanges,
  deriveBiasAndSignal,
  deriveTradeLevels,
  getBinanceFuturesSnapshot
};
