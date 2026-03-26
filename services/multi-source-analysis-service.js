const https = require("https");

const COINGECKO_ID_BY_BASE = {
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

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Titan-AI-Hub/1.0",
            ...headers
          }
        },
        (res) => {
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
              reject(new Error(parsed?.msg || parsed?.error || `HTTP ${res.statusCode}`));
            } catch (err) {
              reject(new Error(`Invalid JSON: ${err.message}`));
            }
          });
        }
      )
      .on("error", reject);
  });
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

function symbolToCoinGeckoId(symbol) {
  const s = String(symbol || "").toUpperCase();
  const base = s.endsWith("USDT") ? s.slice(0, -4) : s;
  return COINGECKO_ID_BY_BASE[base] || null;
}

async function fetchBinancePack(symbol, interval, limit) {
  const sym = String(symbol || "BTCUSDT").toUpperCase();
  const intv = String(interval || "15m");
  const safeLimit = clamp(Number(limit) || 500, 120, 1000);
  const [klines, depth, fundingRows, oi] = await Promise.all([
    getJson(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(
        intv
      )}&limit=${safeLimit}`
    ),
    getJson(`https://fapi.binance.com/fapi/v1/depth?symbol=${encodeURIComponent(sym)}&limit=100`),
    getJson(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(sym)}&limit=10`),
    getJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(sym)}`)
  ]);

  const rows = Array.isArray(klines) ? klines : [];
  if (!rows.length) throw new Error("No Binance klines");

  const closes = rows.map((r) => toNum(r[4]));
  const returns = closes.slice(1).map((c, i) => (closes[i] ? ((c - closes[i]) / closes[i]) * 100 : 0));
  const volatility = stddev(returns);

  const buyVol = rows.reduce((acc, r) => acc + toNum(r[9]), 0); // taker buy base vol
  const totalVol = rows.reduce((acc, r) => acc + toNum(r[5]), 0);
  const sellVol = Math.max(0, totalVol - buyVol);
  const buyRatio = totalVol > 0 ? buyVol / totalVol : 0.5;

  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const changePct = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : 0;

  const bids = Array.isArray(depth?.bids) ? depth.bids : [];
  const asks = Array.isArray(depth?.asks) ? depth.asks : [];
  const bidQty = bids.reduce((acc, x) => acc + toNum(x[1]), 0);
  const askQty = asks.reduce((acc, x) => acc + toNum(x[1]), 0);
  const orderbookImbalance = bidQty + askQty > 0 ? (bidQty - askQty) / (bidQty + askQty) : 0;

  const fundingAvg = mean((Array.isArray(fundingRows) ? fundingRows : []).map((r) => toNum(r.fundingRate)));
  const openInterest = toNum(oi?.openInterest);

  return {
    symbol: sym,
    interval: intv,
    close: lastClose,
    changePct,
    volatilityPct: volatility,
    buyVolume: buyVol,
    sellVolume: sellVol,
    buyRatio,
    orderbookImbalance,
    fundingAvg,
    openInterest
  };
}

async function fetchCoinGeckoPack(symbol) {
  const id = symbolToCoinGeckoId(symbol);
  if (!id) {
    throw new Error(`Unsupported CoinGecko symbol: ${symbol}`);
  }
  const [market, detail] = await Promise.all([
    getJson(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=30&interval=daily`),
    getJson(`https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`)
  ]);

  const prices = Array.isArray(market?.prices) ? market.prices : [];
  const first = prices.length ? toNum(prices[0][1]) : 0;
  const last = prices.length ? toNum(prices[prices.length - 1][1]) : 0;
  const change30d = first ? ((last - first) / first) * 100 : 0;
  const marketCapRank = toNum(detail?.market_cap_rank, 0);
  const cg24h = toNum(detail?.market_data?.price_change_percentage_24h, 0);

  return {
    id,
    change30d,
    change24h: cg24h,
    marketCapRank
  };
}

function buildConsensus(binance, coingecko) {
  // Weighted multi-source score in range [-100, 100]
  const momentumScore = clamp(binance.changePct * 2.2, -25, 25);
  const flowScore = clamp((binance.buyRatio - 0.5) * 120, -20, 20);
  const bookScore = clamp(binance.orderbookImbalance * 80, -15, 15);
  const fundingScore = clamp(binance.fundingAvg * 30000, -10, 10);
  const cgTrendScore = clamp((coingecko?.change30d || 0) * 0.7, -20, 20);
  const rankBonus = coingecko?.marketCapRank > 0 ? clamp((100 - coingecko.marketCapRank) * 0.06, -5, 5) : 0;
  const volPenalty = clamp(binance.volatilityPct * -2.4, -15, 0);

  const score = clamp(
    momentumScore + flowScore + bookScore + fundingScore + cgTrendScore + rankBonus + volPenalty,
    -100,
    100
  );

  const bias = score >= 25 ? "Bullish" : score <= -25 ? "Bearish" : "Neutral";
  const confidence = clamp(Math.abs(score), 0, 100);

  return {
    bias,
    score: Math.round(score),
    confidence: Math.round(confidence),
    components: {
      momentumScore: Math.round(momentumScore),
      flowScore: Math.round(flowScore),
      orderbookScore: Math.round(bookScore),
      fundingScore: Math.round(fundingScore),
      coingeckoTrendScore: Math.round(cgTrendScore),
      rankBonus: Math.round(rankBonus),
      volatilityPenalty: Math.round(volPenalty)
    }
  };
}

async function buildMultiSourceAnalysis({ symbol = "BTCUSDT", interval = "15m", limit = 500 } = {}) {
  const binance = await fetchBinancePack(symbol, interval, limit);

  let cg = null;
  let cgError = null;
  try {
    cg = await fetchCoinGeckoPack(symbol);
  } catch (err) {
    cgError = err.message || String(err);
  }

  const consensus = buildConsensus(binance, cg);
  return {
    ok: true,
    symbol: binance.symbol,
    interval: binance.interval,
    timestamp: new Date().toISOString(),
    sources: {
      binance: {
        ok: true,
        data: binance
      },
      coingecko: cg
        ? {
            ok: true,
            data: cg
          }
        : {
            ok: false,
            message: cgError || "Unavailable"
          }
    },
    buySell: {
      buyVolume: binance.buyVolume,
      sellVolume: binance.sellVolume,
      buyRatio: binance.buyRatio
    },
    consensus
  };
}

module.exports = {
  buildMultiSourceAnalysis
};
