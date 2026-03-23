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

async function getKlines(symbol, interval = "5m", limit = 60) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(
      futuresSymbol
    )}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`
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

function pctChange(current, previous) {
  const c = toNum(current, NaN);
  const p = toNum(previous, NaN);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return 0;
  return ((c - p) / p) * 100;
}

function average(nums) {
  const clean = nums.map((v) => toNum(v, NaN)).filter(Number.isFinite);
  if (!clean.length) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function buildRangeLevels(candles, lookback = 20) {
  const recent = candles.slice(-lookback);
  if (!recent.length) {
    return {
      high: 0,
      low: 0,
      mid: 0
    };
  }

  const high = Math.max(...recent.map((c) => c.high));
  const low = Math.min(...recent.map((c) => c.low));
  const mid = (high + low) / 2;

  return { high, low, mid };
}

function estimateLiquidationBands(lastPrice, rangeHigh, rangeLow, oiStress) {
  const price = toNum(lastPrice, 0);
  const high = toNum(rangeHigh, price);
  const low = toNum(rangeLow, price);
  const stress = toNum(oiStress, 0);

  const upperBandPct = Math.max(0.35, 0.45 + stress * 0.08);
  const lowerBandPct = Math.max(0.35, 0.45 + stress * 0.08);

  const shortLiqNear = price * (1 + upperBandPct / 100);
  const shortLiqFar = Math.max(high, price * (1 + (upperBandPct + 0.6) / 100));

  const longLiqNear = price * (1 - lowerBandPct / 100);
  const longLiqFar = Math.min(low || longLiqNear, price * (1 - (lowerBandPct + 0.6) / 100));

  return {
    shortLiqNear,
    shortLiqFar,
    longLiqNear,
    longLiqFar
  };
}

function classifyLiquidationPressure({ priceChangePct, oiChangePctAvg, lastClose, rangeHigh, rangeLow }) {
  const priceMove = toNum(priceChangePct, 0);
  const oiMove = toNum(oiChangePctAvg, 0);
  const price = toNum(lastClose, 0);
  const high = toNum(rangeHigh, 0);
  const low = toNum(rangeLow, 0);

  const nearHigh = price > 0 && high > 0 ? ((high - price) / price) * 100 <= 0.6 : false;
  const nearLow = price > 0 && low > 0 ? ((price - low) / price) * 100 <= 0.6 : false;

  if (priceMove > 0.45 && oiMove > 0.8 && nearHigh) {
    return {
      state: "Short Liquidation Risk Above",
      score: 74
    };
  }

  if (priceMove < -0.45 && oiMove > 0.8 && nearLow) {
    return {
      state: "Long Liquidation Risk Below",
      score: 74
    };
  }

  if (priceMove > 0.2 && oiMove < -0.4) {
    return {
      state: "Short Covering / Less Clustered",
      score: 52
    };
  }

  if (priceMove < -0.2 && oiMove < -0.4) {
    return {
      state: "Long Flush / Less Clustered",
      score: 52
    };
  }

  return {
    state: "Balanced Liquidation Pressure",
    score: 45
  };
}

async function getLiquidationProfile(symbol) {
  const [klinesRaw, oiHist] = await Promise.all([
    getKlines(symbol, "5m", 60),
    getOpenInterestHist(symbol, "5m", 30)
  ]);

  const candles = klinesRaw.map(mapKline);
  const last = candles[candles.length - 1] || null;
  const prev = candles[candles.length - 2] || null;

  const priceChangePct = last && prev ? pctChange(last.close, prev.close) : 0;

  const oiValues = Array.isArray(oiHist)
    ? oiHist.map((row) => toNum(row.sumOpenInterestValue || row.sumOpenInterest, 0))
    : [];

  const oiChanges = [];
  for (let i = 1; i < oiValues.length; i += 1) {
    oiChanges.push(pctChange(oiValues[i], oiValues[i - 1]));
  }

  const oiChangePctAvg = average(oiChanges.slice(-5));
  const range = buildRangeLevels(candles, 20);
  const liqClass = classifyLiquidationPressure({
    priceChangePct,
    oiChangePctAvg,
    lastClose: last?.close || 0,
    rangeHigh: range.high,
    rangeLow: range.low
  });

  const bands = estimateLiquidationBands(
    last?.close || 0,
    range.high,
    range.low,
    Math.abs(oiChangePctAvg)
  );

  return {
    symbol: normalizeSymbol(symbol),
    futuresSymbol: toFuturesSymbol(symbol),
    lastPrice: toNum(last?.close, 0),
    priceChangePct,
    oiChangePctAvg,
    rangeHigh: range.high,
    rangeLow: range.low,
    rangeMid: range.mid,
    shortLiqNear: bands.shortLiqNear,
    shortLiqFar: bands.shortLiqFar,
    longLiqNear: bands.longLiqNear,
    longLiqFar: bands.longLiqFar,
    liquidationState: liqClass.state,
    liquidationScore: liqClass.score
  };
}

module.exports = {
  SYMBOL_MAP,
  normalizeSymbol,
  toFuturesSymbol,
  getKlines,
  getOpenInterestHist,
  getLiquidationProfile
};
