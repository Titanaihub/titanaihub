const https = require("https");

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Titan-AI-Hub/1.0"
          }
        },
        (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (err) {
              reject(err);
            }
          });
        }
      )
      .on("error", reject);
  });
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatThaiTime(date = new Date()) {
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok"
  });
}

async function getRealOverview() {
  const [globalData, fearData] = await Promise.all([
    getJson("https://api.coingecko.com/api/v3/global"),
    getJson("https://api.alternative.me/fng/?limit=1")
  ]);

  const market = globalData?.data || {};
  const totalMarketCap = toNumber(market?.total_market_cap?.usd);
  const totalVolume24h = toNumber(market?.total_volume?.usd);
  const btcDominance = toNumber(market?.market_cap_percentage?.btc);
  const fearGreed = toNumber(fearData?.data?.[0]?.value);

  let marketBias = "Neutral";
  if (btcDominance >= 55 && fearGreed >= 60) marketBias = "Sideway";
  if (btcDominance < 52 && fearGreed >= 65) marketBias = "Risk-On";
  if (fearGreed <= 40) marketBias = "Risk-Off";

  return {
    status: "LIVE",
    lastUpdated: formatThaiTime(),
    marketBias,
    totalMarketCap,
    totalVolume24h,
    btcDominance,
    fearGreed
  };
}

function mapSymbol(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (s === "BTC") return "BTCUSDT";
  if (s === "ETH") return "ETHUSDT";
  if (s === "BNB") return "BNBUSDT";
  return `${s}USDT`;
}

async function getRealCoin(symbol) {
  const pair = mapSymbol(symbol);

  const [premium, openInterest, klines5m, klines15m, klines1h, klines4h] =
    await Promise.all([
      getJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`),
      getJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${pair}`),
      getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=5m&limit=2`),
      getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=15m&limit=2`),
      getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=1h&limit=2`),
      getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=4h&limit=2`)
    ]);

  const price = toNumber(premium?.markPrice || premium?.indexPrice);
  const funding = toNumber(premium?.lastFundingRate);
  const oi = toNumber(openInterest?.openInterest);

  function changeFromKlines(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return 0;
    const prevClose = toNumber(rows[0][4]);
    const lastClose = toNumber(rows[1][4]);
    if (!prevClose) return 0;
    return ((lastClose - prevClose) / prevClose) * 100;
  }

  const change5m = changeFromKlines(klines5m);
  const change15m = changeFromKlines(klines15m);
  const change1h = changeFromKlines(klines1h);
  const change4h = changeFromKlines(klines4h);

  let bias = "Neutral";
  let signal = "WAIT";

  if (change1h > 0 && change4h > 0) {
    bias = "Bullish";
    signal = "LONG";
  } else if (change1h < 0 && change4h < 0) {
    bias = "Bearish";
    signal = "SHORT";
  } else if (Math.abs(change1h) < 0.2 && Math.abs(change4h) < 0.5) {
    bias = "Sideway";
    signal = "WAIT";
  }

  const riskPct = symbol.toUpperCase() === "BTC" ? 0.01 : 0.015;
  const rewardPct = symbol.toUpperCase() === "BTC" ? 0.022 : 0.03;

  let entry = price;
  let sl = price * (1 - riskPct);
  let tp = price * (1 + rewardPct);

  if (signal === "SHORT") {
    sl = price * (1 + riskPct);
    tp = price * (1 - rewardPct);
  }

  return {
    price,
    signal,
    change5m,
    change15m,
    change1h,
    change4h,
    funding,
    oi,
    bias,
    entry: Math.round(entry * 100) / 100,
    sl: Math.round(sl * 100) / 100,
    tp: Math.round(tp * 100) / 100
  };
}

module.exports = {
  getRealOverview,
  getRealCoin
};
