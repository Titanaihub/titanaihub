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

const BINANCE_SYMBOL_MAP = {
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
  PEPE: "PEPEUSDT",
  WIF: "WIFUSDT",
  BONK: "BONKUSDT",
  FLOKI: "FLOKIUSDT",
  SHIB: "SHIBUSDT"
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

function getJsonWithHeaders(url, headers) {
  return new Promise((resolve, reject) => {
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
            reject(new Error(parsed?.msg || parsed?.error || `Request failed: ${res.statusCode}`));
          } catch (err) {
            reject(new Error(`Invalid JSON: ${err.message}`));
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

function summarizeRowsByDay(rows, volByDay) {
  const byDay = new Map();
  const sortedAsc = [...rows].sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));

  for (const r of sortedAsc) {
    const d = String(r.date || "");
    if (!d) continue;
    const cur = byDay.get(d);
    if (!cur) {
      byDay.set(d, {
        symbol: r.symbol,
        date: d,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.price,
        price: r.price,
        approximate: Boolean(r.approximate),
        tsOpen: Number(r.ts || 0),
        tsClose: Number(r.ts || 0)
      });
      continue;
    }

    if (Number(r.ts || 0) < cur.tsOpen) {
      cur.tsOpen = Number(r.ts || 0);
      cur.open = r.open;
    }
    if (Number(r.ts || 0) >= cur.tsClose) {
      cur.tsClose = Number(r.ts || 0);
      cur.close = r.price;
      cur.price = r.price;
    }
    cur.high = Math.max(Number(cur.high), Number(r.high));
    cur.low = Math.min(Number(cur.low), Number(r.low));
    cur.approximate = cur.approximate || Boolean(r.approximate);
  }

  const daysAsc = [...byDay.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let prevClose = null;
  const withChange = daysAsc.map((d) => {
    const close = Number(d.close);
    const changePct = prevClose && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;
    prevClose = close;
    return {
      symbol: d.symbol,
      date: d.date,
      price: close,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      volume: volByDay.get(d.date) ?? null,
      changePct,
      approximate: d.approximate
    };
  });

  withChange.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return withChange;
}

function buildApproxRowsFromPrices(prices, sym, volByDay) {
  const rows = [];
  let prevClose = null;
  for (const row of prices) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const ts = row[0];
    const close = toNum(row[1]);
    if (close == null) continue;
    const open = prevClose ?? close;
    const high = Math.max(open, close);
    const low = Math.min(open, close);

    rows.push({
      symbol: sym,
      date: dayKey(ts),
      ts,
      price: close,
      open,
      high,
      low,
      volume: volByDay.get(dayKey(ts)) ?? null,
      changePct: null,
      approximate: true
    });
    prevClose = close;
  }
  return rows;
}

async function fetchCoinHistory(symbol, days = 30) {
  const sym = String(symbol || "").toUpperCase();
  const id = COIN_ID_MAP[sym];
  if (!id) {
    throw new Error(`Unsupported symbol for CoinGecko history: ${sym}`);
  }

  const safeDays = Math.max(1, Math.min(Number(days) || 30, 1825));
  const shortDaysParam = safeDays > 365 ? "365" : String(safeDays);
  const marketDaysParam = safeDays > 365 ? "max" : String(safeDays);

  let ohlc = [];
  let market = null;
  if (safeDays <= 365) {
    market = await getJson(
      `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${marketDaysParam}&interval=daily`
    );
    try {
      // CoinGecko OHLC can intermittently fail for longer presets; keep UI alive with market-chart fallback.
      ohlc = await getJson(`${COINGECKO_BASE}/coins/${id}/ohlc?vs_currency=usd&days=${shortDaysParam}`);
    } catch (_) {
      ohlc = [];
    }
  } else {
    market = await getJson(
      `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${marketDaysParam}&interval=daily`
    );
  }

  const volByDay = new Map();
  const totalVolumes = Array.isArray(market?.total_volumes) ? market.total_volumes : [];
  for (const pair of totalVolumes) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    volByDay.set(dayKey(pair[0]), toNum(pair[1]));
  }

  const rows = [];
  if (safeDays <= 365) {
    const ohlcRows = Array.isArray(ohlc) ? ohlc : [];
    if (ohlcRows.length) {
      for (const row of ohlcRows) {
        if (!Array.isArray(row) || row.length < 5) continue;
        const ts = row[0];
        const open = toNum(row[1]);
        const high = toNum(row[2]);
        const low = toNum(row[3]);
        const close = toNum(row[4]);
        if (open == null || high == null || low == null || close == null) continue;

        rows.push({
          symbol: sym,
          date: dayKey(ts),
          ts,
          price: close,
          open,
          high,
          low,
          volume: volByDay.get(dayKey(ts)) ?? null,
          changePct: null,
          approximate: false
        });
      }
    } else {
      const prices = Array.isArray(market?.prices) ? market.prices : [];
      rows.push(...buildApproxRowsFromPrices(prices, sym, volByDay));
    }
  } else {
    const prices = Array.isArray(market?.prices) ? market.prices : [];
    rows.push(...buildApproxRowsFromPrices(prices, sym, volByDay));
  }

  const summarized = summarizeRowsByDay(rows, volByDay);
  return summarized.slice(0, safeDays);
}

async function fetchBinanceHistory(symbol, days = 30) {
  const sym = String(symbol || "").toUpperCase();
  const pair = BINANCE_SYMBOL_MAP[sym];
  if (!pair) {
    throw new Error(`Unsupported symbol for Binance history: ${sym}`);
  }

  const safeDays = Math.max(1, Math.min(Number(days) || 30, 1825));
  const need = safeDays;
  const chunkLimit = 1000;
  const all = [];
  let endTime = Date.now();

  while (all.length < need) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=1d&limit=${Math.min(
      chunkLimit,
      need - all.length
    )}&endTime=${endTime}`;
    const rows = await getJsonWithHeaders(url, { "User-Agent": "Titan-AI-Hub/1.0" });
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    const firstOpenTs = Number(rows[0]?.[0] || 0);
    if (!firstOpenTs) break;
    endTime = firstOpenTs - 1;
    if (rows.length < chunkLimit) break;
  }

  const asc = all
    .filter((r) => Array.isArray(r) && r.length >= 6)
    .sort((a, b) => Number(a[0] || 0) - Number(b[0] || 0))
    .slice(-safeDays);

  let prevClose = null;
  const rows = asc.map((r) => {
    const open = toNum(r[1]);
    const high = toNum(r[2]);
    const low = toNum(r[3]);
    const close = toNum(r[4]);
    const vol = toNum(r[5]);
    const changePct = prevClose && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;
    prevClose = close;
    return {
      symbol: sym,
      pair,
      date: dayKey(Number(r[0] || 0)),
      price: close,
      open,
      high,
      low,
      volume: vol,
      changePct,
      approximate: false
    };
  });

  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return rows;
}

async function getMultiCoinHistory({ symbols = [], days = 30, limitPerCoin = 30, source = "coingecko" } = {}) {
  const src = String(source || "coingecko").toLowerCase() === "binance" ? "binance" : "coingecko";
  const requested = Array.isArray(symbols)
    ? symbols.map((s) => String(s || "").toUpperCase()).filter(Boolean)
    : [];

  const uniqueSymbols = [...new Set(requested)].filter((s) =>
    src === "binance" ? Boolean(BINANCE_SYMBOL_MAP[s]) : Boolean(COIN_ID_MAP[s])
  );
  const list = uniqueSymbols.length ? uniqueSymbols : ["BTC", "ETH", "BNB", "SOL", "XRP"];

  const out = [];
  const errors = [];
  for (const symbol of list) {
    try {
      const rows =
        src === "binance"
          ? await fetchBinanceHistory(symbol, days)
          : await fetchCoinHistory(symbol, days);
      out.push(...rows.slice(0, Math.max(1, Math.min(Number(limitPerCoin) || 30, 2500))));
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
    source: src,
    symbols: list,
    days: Math.max(1, Math.min(Number(days) || 30, 1825)),
    rows: out,
    errors,
    approximate: src === "coingecko" && Math.max(1, Math.min(Number(days) || 30, 1825)) > 365
  };
}

async function getHistoryBehaviorStats({ symbol = "BTC", days = 365, source = "binance" } = {}) {
  const sym = String(symbol || "BTC").toUpperCase().replace(/USDT$/i, "");
  const src = String(source || "binance").toLowerCase() === "coingecko" ? "coingecko" : "binance";
  const safeDays = Math.max(45, Math.min(Number(days) || 365, 1825));
  const rows =
    src === "binance" ? await fetchBinanceHistory(sym, safeDays) : await fetchCoinHistory(sym, safeDays);
  const desc = Array.isArray(rows) ? rows : [];
  if (!desc.length) {
    return { ok: false, symbol: sym, source: src, message: "No history rows" };
  }

  const latest = desc[0];
  const past = desc.slice(1).filter((r) => Number(r.open) > 0 && Number(r.high) > 0 && Number(r.low) > 0);
  if (!past.length) {
    return { ok: false, symbol: sym, source: src, message: "Insufficient history rows" };
  }

  const pct = {
    openHigh: (r) => ((Number(r.high) - Number(r.open)) / Number(r.open)) * 100,
    openLow: (r) => ((Number(r.open) - Number(r.low)) / Number(r.open)) * 100,
    lowHigh: (r) => ((Number(r.high) - Number(r.low)) / Math.max(Number(r.low), 1e-12)) * 100,
    highLow: (r) => ((Number(r.high) - Number(r.low)) / Math.max(Number(r.high), 1e-12)) * 100,
    openClose: (r) => ((Number(r.close) - Number(r.open)) / Number(r.open)) * 100
  };
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const avg = {
    openHighPct: mean(past.map(pct.openHigh)),
    openLowPct: mean(past.map(pct.openLow)),
    lowHighPct: mean(past.map(pct.lowHigh)),
    highLowPct: mean(past.map(pct.highLow)),
    openClosePct: mean(past.map(pct.openClose)),
    absOpenClosePct: mean(past.map((r) => Math.abs(pct.openClose(r))))
  };
  const today = {
    openHighPct: pct.openHigh(latest),
    openLowPct: pct.openLow(latest),
    lowHighPct: pct.lowHigh(latest),
    highLowPct: pct.highLow(latest),
    openClosePct: pct.openClose(latest)
  };

  return {
    ok: true,
    source: src,
    symbol: sym,
    daysUsed: past.length,
    date: latest.date,
    latest: {
      open: Number(latest.open),
      high: Number(latest.high),
      low: Number(latest.low),
      close: Number(latest.close),
      price: Number(latest.price)
    },
    averages: avg,
    today
  };
}

module.exports = {
  getMultiCoinHistory,
  getHistoryBehaviorStats
};
