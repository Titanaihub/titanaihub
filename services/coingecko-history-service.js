const https = require("https");

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_API_KEY = String(process.env.COINGECKO_API_KEY || "").trim();

const COIN_ID_MAP = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  DOGE: "dogecoin",
  ADA: "cardano",
  LINK: "chainlink",
  AVAX: "avalanche-2",
  TON: "the-open-network",
  PEPE: "pepe",
  WIF: "dogwifcoin",
  BONK: "bonk",
  FLOKI: "floki",
  SHIB: "shiba-inu"
};

function getJson(url) {
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: "application/json",
      "User-Agent": "Titan-AI-Hub/1.0"
    };
    if (COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
    }

    https
      .get(url, { headers }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data || "{}");
            if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
              resolve(parsed);
              return;
            }
            reject(new Error(parsed?.error || parsed?.message || `CoinGecko request failed: ${res.statusCode}`));
          } catch (err) {
            reject(new Error(`CoinGecko invalid JSON: ${err.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

async function fetchCoinHistory(symbol, days = 30) {
  const sym = String(symbol || "").toUpperCase();
  const id = COIN_ID_MAP[sym];
  if (!id) {
    throw new Error(`Unsupported symbol for CoinGecko history: ${sym}`);
  }

  const safeDays = Math.max(1, Math.min(Number(days) || 30, 365));
  const [ohlc, market] = await Promise.all([
    getJson(`${COINGECKO_BASE}/coins/${id}/ohlc?vs_currency=usd&days=${safeDays}`),
    getJson(`${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${safeDays}&interval=daily`)
  ]);

  const volByDay = new Map();
  const totalVolumes = Array.isArray(market?.total_volumes) ? market.total_volumes : [];
  for (const pair of totalVolumes) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    volByDay.set(dayKey(pair[0]), toNum(pair[1]));
  }

  const rows = [];
  let prevClose = null;
  const ohlcRows = Array.isArray(ohlc) ? ohlc : [];
  for (const row of ohlcRows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const ts = row[0];
    const open = toNum(row[1]);
    const high = toNum(row[2]);
    const low = toNum(row[3]);
    const close = toNum(row[4]);
    if (open == null || high == null || low == null || close == null) continue;

    const changePct = prevClose && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;
    prevClose = close;

    rows.push({
      symbol: sym,
      date: dayKey(ts),
      price: close,
      open,
      high,
      low,
      volume: volByDay.get(dayKey(ts)) ?? null,
      changePct
    });
  }

  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return rows;
}

async function getMultiCoinHistory({ symbols = [], days = 30, limitPerCoin = 30 } = {}) {
  const requested = Array.isArray(symbols)
    ? symbols.map((s) => String(s || "").toUpperCase()).filter(Boolean)
    : [];

  const uniqueSymbols = [...new Set(requested)].filter((s) => COIN_ID_MAP[s]);
  const list = uniqueSymbols.length ? uniqueSymbols : ["BTC", "ETH", "BNB", "SOL", "XRP"];

  const out = [];
  const errors = [];
  for (const symbol of list) {
    try {
      const rows = await fetchCoinHistory(symbol, days);
      out.push(...rows.slice(0, Math.max(1, Math.min(Number(limitPerCoin) || 30, 200))));
    } catch (err) {
      errors.push({ symbol, message: err.message || String(err) });
    }
  }

  out.sort((a, b) => {
    const d = String(b.date).localeCompare(String(a.date));
    if (d !== 0) return d;
    return String(a.symbol).localeCompare(String(b.symbol));
  });

  return {
    ok: true,
    source: "coingecko",
    symbols: list,
    days: Math.max(1, Math.min(Number(days) || 30, 365)),
    rows: out,
    errors
  };
}

module.exports = {
  getMultiCoinHistory
};
