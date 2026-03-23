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
          try {
            const json = JSON.parse(data || "[]");
            if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
              resolve(json);
            } else {
              reject(new Error(json?.msg || `HTTP ${res.statusCode}`));
            }
          } catch (err) {
            reject(new Error(`Invalid JSON: ${err.message}`));
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

async function getKlines(symbol, interval = "5m", limit = 120) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(
      futuresSymbol
    )}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`
  );
}

function mapKline(row) {
  return {
    openTime: toNum(row[0]),
    open: toNum(row[1]),
    high: toNum(row[2]),
    low: toNum(row[3]),
    close: toNum(row[4]),
    volume: toNum(row[5]),
    closeTime: toNum(row[6])
  };
}

function calcTrueRange(curr, prevClose) {
  if (!curr) return 0;
  const highLow = curr.high - curr.low;
  const highPrev = Math.abs(curr.high - prevClose);
  const lowPrev = Math.abs(curr.low - prevClose);
  return Math.max(highLow, highPrev, lowPrev);
}

function calcATR(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return 0;

  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    trs.push(calcTrueRange(candles[i], candles[i - 1].close));
  }

  const recent = trs.slice(-period);
  if (!recent.length) return 0;

  const sum = recent.reduce((acc, v) => acc + v, 0);
  return sum / recent.length;
}

function calcRealizedVolPct(candles, period = 20) {
  if (!Array.isArray(candles) || candles.length < period + 1) return 0;

  const returns = [];
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1].close;
    const curr = candles[i].close;
    if (prev > 0 && curr > 0) {
      returns.push(Math.log(curr / prev));
    }
  }

  const recent = returns.slice(-period);
  if (!recent.length) return 0;

  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance =
    recent.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / recent.length;

  return Math.sqrt(variance) * 100;
}

function calcRangePct(candles, period = 20) {
  if (!Array.isArray(candles) || candles.length < period) return 0;

  const recent = candles.slice(-period);
  const highest = Math.max(...recent.map((c) => c.high));
  const lowest = Math.min(...recent.map((c) => c.low));
  const lastClose = recent[recent.length - 1]?.close || 0;

  if (lastClose <= 0) return 0;
  return ((highest - lowest) / lastClose) * 100;
}

function classifyVolatility({ atrPct5m, atrPct1h, realizedVol5m, realizedVol1h, rangePct1h }) {
  const composite =
    atrPct5m * 0.25 +
    atrPct1h * 0.25 +
    realizedVol5m * 0.2 +
    realizedVol1h * 0.15 +
    rangePct1h * 0.15;

  if (composite >= 4.5) return { state: "Extreme", score: 90, composite };
  if (composite >= 3.0) return { state: "High", score: 72, composite };
  if (composite >= 1.8) return { state: "Elevated", score: 58, composite };
  if (composite >= 0.9) return { state: "Normal", score: 45, composite };
  return { state: "Compressed", score: 28, composite };
}

async function getVolatilityProfile(symbol) {
  const [klines5mRaw, klines1hRaw] = await Promise.all([
    getKlines(symbol, "5m", 120),
    getKlines(symbol, "1h", 120)
  ]);

  const candles5m = klines5mRaw.map(mapKline);
  const candles1h = klines1hRaw.map(mapKline);

  const last5m = candles5m[candles5m.length - 1] || null;
  const last1h = candles1h[candles1h.length - 1] || null;

  const atr5m = calcATR(candles5m, 14);
  const atr1h = calcATR(candles1h, 14);

  const atrPct5m = last5m?.close > 0 ? (atr5m / last5m.close) * 100 : 0;
  const atrPct1h = last1h?.close > 0 ? (atr1h / last1h.close) * 100 : 0;

  const realizedVol5m = calcRealizedVolPct(candles5m, 20);
  const realizedVol1h = calcRealizedVolPct(candles1h, 20);
  const rangePct1h = calcRangePct(candles1h, 20);

  const regime = classifyVolatility({
    atrPct5m,
    atrPct1h,
    realizedVol5m,
    realizedVol1h,
    rangePct1h
  });

  return {
    symbol: normalizeSymbol(symbol),
    futuresSymbol: toFuturesSymbol(symbol),
    atr5m,
    atr1h,
    atrPct5m,
    atrPct1h,
    realizedVol5m,
    realizedVol1h,
    rangePct1h,
    state: regime.state,
    score: Math.round(regime.score),
    composite: Number(regime.composite.toFixed(4))
  };
}

module.exports = {
  SYMBOL_MAP,
  normalizeSymbol,
  toFuturesSymbol,
  getKlines,
  getVolatilityProfile
};
