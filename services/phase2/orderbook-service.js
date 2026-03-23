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
            const json = JSON.parse(data || "{}");
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

async function getDepth(symbol, limit = 50) {
  const futuresSymbol = toFuturesSymbol(symbol);
  return getJson(
    `${BINANCE_FAPI_BASE}/fapi/v1/depth?symbol=${encodeURIComponent(
      futuresSymbol
    )}&limit=${encodeURIComponent(limit)}`
  );
}

function mapBookRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    price: toNum(row[0]),
    qty: toNum(row[1]),
    notional: toNum(row[0]) * toNum(row[1])
  }));
}

function sumNotional(rows, count) {
  return rows.slice(0, count).reduce((acc, row) => acc + toNum(row.notional), 0);
}

function weightedAveragePrice(rows, count) {
  const subset = rows.slice(0, count);
  const totalNotional = subset.reduce((acc, row) => acc + toNum(row.notional), 0);
  const totalQty = subset.reduce((acc, row) => acc + toNum(row.qty), 0);
  if (totalQty <= 0) return 0;
  return totalNotional / totalQty;
}

function calcImbalance(bidNotional, askNotional) {
  const total = bidNotional + askNotional;
  if (total <= 0) return 0;
  return ((bidNotional - askNotional) / total) * 100;
}

function classifyImbalance(imbalancePct) {
  const v = toNum(imbalancePct, 0);
  if (v >= 20) return "Strong Bid Imbalance";
  if (v >= 8) return "Bid Imbalance";
  if (v <= -20) return "Strong Ask Imbalance";
  if (v <= -8) return "Ask Imbalance";
  return "Balanced Book";
}

function classifySpread(spreadPct) {
  const v = toNum(spreadPct, 0);
  if (v >= 0.08) return "Wide Spread";
  if (v >= 0.03) return "Normal Spread";
  return "Tight Spread";
}

function classifyBookPressure({ imbalancePct, top5ImbalancePct, top10ImbalancePct }) {
  const base = toNum(imbalancePct, 0);
  const t5 = toNum(top5ImbalancePct, 0);
  const t10 = toNum(top10ImbalancePct, 0);

  const avg = (base + t5 + t10) / 3;

  if (avg >= 15) return "Aggressive Bid Support";
  if (avg >= 6) return "Bid Leaning";
  if (avg <= -15) return "Aggressive Ask Pressure";
  if (avg <= -6) return "Ask Leaning";
  return "Balanced";
}

async function getOrderBookProfile(symbol) {
  const depth = await getDepth(symbol, 50);

  const bids = mapBookRows(depth?.bids || []);
  const asks = mapBookRows(depth?.asks || []);

  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 0;
  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  const bidNotionalTop5 = sumNotional(bids, 5);
  const askNotionalTop5 = sumNotional(asks, 5);
  const bidNotionalTop10 = sumNotional(bids, 10);
  const askNotionalTop10 = sumNotional(asks, 10);
  const bidNotionalTop20 = sumNotional(bids, 20);
  const askNotionalTop20 = sumNotional(asks, 20);

  const top5ImbalancePct = calcImbalance(bidNotionalTop5, askNotionalTop5);
  const top10ImbalancePct = calcImbalance(bidNotionalTop10, askNotionalTop10);
  const top20ImbalancePct = calcImbalance(bidNotionalTop20, askNotionalTop20);

  const wapBidTop10 = weightedAveragePrice(bids, 10);
  const wapAskTop10 = weightedAveragePrice(asks, 10);

  return {
    symbol: normalizeSymbol(symbol),
    futuresSymbol: toFuturesSymbol(symbol),
    bestBid,
    bestAsk,
    midPrice,
    spread,
    spreadPct,
    bidNotionalTop5,
    askNotionalTop5,
    bidNotionalTop10,
    askNotionalTop10,
    bidNotionalTop20,
    askNotionalTop20,
    top5ImbalancePct,
    top10ImbalancePct,
    top20ImbalancePct,
    wapBidTop10,
    wapAskTop10,
    imbalanceState: classifyImbalance(top20ImbalancePct),
    spreadState: classifySpread(spreadPct),
    bookPressureState: classifyBookPressure({
      imbalancePct: top20ImbalancePct,
      top5ImbalancePct,
      top10ImbalancePct
    })
  };
}

module.exports = {
  SYMBOL_MAP,
  normalizeSymbol,
  toFuturesSymbol,
  getDepth,
  getOrderBookProfile
};
