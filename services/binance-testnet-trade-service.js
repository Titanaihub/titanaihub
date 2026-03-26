const https = require("https");
const crypto = require("crypto");

const TESTNET_BASE_URL = process.env.BINANCE_TESTNET_BASE_URL || "https://testnet.binancefuture.com";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY || "";
const API_SECRET = process.env.BINANCE_TESTNET_API_SECRET || "";

const EXCHANGE_INFO_CACHE = {
  ts: 0,
  data: null
};

function getJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET"
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data || "{}");
            if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
              resolve(json);
              return;
            }
            reject(new Error(json?.msg || `GET ${parsed.pathname} failed`));
          } catch (err) {
            reject(new Error(`Invalid JSON from Binance: ${err.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function requestSigned(method, path, params = {}) {
  return new Promise((resolve, reject) => {
    if (!API_KEY || !API_SECRET) {
      reject(new Error("Missing BINANCE_TESTNET_API_KEY or BINANCE_TESTNET_API_SECRET"));
      return;
    }

    const payload = new URLSearchParams({
      ...params,
      timestamp: String(Date.now()),
      recvWindow: "5000"
    });
    const signature = crypto.createHmac("sha256", API_SECRET).update(payload.toString()).digest("hex");
    payload.append("signature", signature);

    const parsedBase = new URL(TESTNET_BASE_URL);
    const pathWithQuery = `${path}?${payload.toString()}`;

    const req = https.request(
      {
        hostname: parsedBase.hostname,
        path: pathWithQuery,
        method,
        headers: {
          "X-MBX-APIKEY": API_KEY,
          "Content-Type": "application/json"
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data || "{}");
            if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
              resolve(json);
              return;
            }
            reject(new Error(json?.msg || `${method} ${path} failed`));
          } catch (err) {
            reject(new Error(`Invalid JSON from Binance: ${err.message}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

async function getExchangeInfo() {
  const now = Date.now();
  if (EXCHANGE_INFO_CACHE.data && now - EXCHANGE_INFO_CACHE.ts < 5 * 60 * 1000) {
    return EXCHANGE_INFO_CACHE.data;
  }

  const parsedBase = new URL(TESTNET_BASE_URL);
  const data = await getJson(`${parsedBase.origin}/fapi/v1/exchangeInfo`);
  EXCHANGE_INFO_CACHE.ts = now;
  EXCHANGE_INFO_CACHE.data = data;
  return data;
}

function decimalsFromStep(step) {
  const s = String(step || "1");
  if (!s.includes(".")) return 0;
  return s.split(".")[1].replace(/0+$/, "").length;
}

async function normalizeOrderQuantity(symbol, rawQty) {
  const info = await getExchangeInfo();
  const target = (info?.symbols || []).find((s) => String(s.symbol || "").toUpperCase() === symbol);
  if (!target) throw new Error(`Symbol ${symbol} not found in exchangeInfo`);

  const lot = (target.filters || []).find((f) => f.filterType === "LOT_SIZE");
  if (!lot) throw new Error(`LOT_SIZE filter missing for ${symbol}`);

  const stepSize = Number(lot.stepSize || "1");
  const minQty = Number(lot.minQty || "0");
  if (!Number.isFinite(stepSize) || stepSize <= 0) throw new Error(`Invalid stepSize for ${symbol}`);

  let qty = Number(rawQty || 0);
  qty = Math.floor(qty / stepSize) * stepSize;
  if (qty < minQty) {
    throw new Error(`Quantity too small for ${symbol}. Min qty ${minQty}`);
  }

  const decimals = decimalsFromStep(lot.stepSize);
  return Number(qty.toFixed(decimals));
}

async function getMarkPrice(symbol) {
  const parsedBase = new URL(TESTNET_BASE_URL);
  const data = await getJson(`${parsedBase.origin}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`);
  const markPrice = Number(data?.markPrice);
  if (!Number.isFinite(markPrice) || markPrice <= 0) {
    throw new Error(`Invalid mark price for ${symbol}`);
  }
  return markPrice;
}

async function getFuturesAccountSnapshot() {
  if (!API_KEY || !API_SECRET) {
    return { ok: false, error: "missing_keys", message: "Testnet API keys not configured" };
  }

  try {
    const [balance, positions, openOrders] = await Promise.all([
      requestSigned("GET", "/fapi/v2/balance", {}),
      requestSigned("GET", "/fapi/v2/positionRisk", {}),
      requestSigned("GET", "/fapi/v1/openOrders", {})
    ]);

    const income = await requestSigned("GET", "/fapi/v1/income", {
      incomeType: "REALIZED_PNL",
      limit: "50"
    }).catch(() => []);

    const incArr = Array.isArray(income) ? income : [];

    const symbols = new Set();
    for (const p of positions || []) {
      if (Math.abs(Number(p.positionAmt || 0)) > 1e-12) {
        symbols.add(String(p.symbol || "").toUpperCase());
      }
    }
    for (const o of openOrders || []) {
      symbols.add(String(o.symbol || "").toUpperCase());
    }
    for (const row of incArr) {
      if (row.symbol) {
        symbols.add(String(row.symbol).toUpperCase());
      }
    }
    if (symbols.size === 0) {
      symbols.add("BTCUSDT");
    }

    /** USDT-M user fills — same source as Binance UI "Trade History" (all trades, not only closes). */
    const tradeRows = [];
    for (const sym of symbols) {
      const trades = await requestSigned("GET", "/fapi/v1/userTrades", {
        symbol: sym,
        limit: "100"
      }).catch(() => []);
      if (Array.isArray(trades)) {
        tradeRows.push(...trades);
      }
    }

    tradeRows.sort((a, b) => (b.time || 0) - (a.time || 0));
    const seenTradeIds = new Set();
    const uniqueTrades = [];
    for (const t of tradeRows) {
      const id = t.id;
      if (id == null || seenTradeIds.has(id)) continue;
      seenTradeIds.add(id);
      uniqueTrades.push(t);
    }

    const usdt = Array.isArray(balance)
      ? balance.find((a) => String(a.asset || "").toUpperCase() === "USDT")
      : null;

    let unrealizedTotal = 0;
    for (const p of positions || []) {
      unrealizedTotal += Number(p.unRealizedProfit || 0);
    }

    let realizedRecent = 0;
    for (const row of incArr) {
      realizedRecent += Number(row.income || 0);
    }

    return {
      ok: true,
      testnetBaseUrl: TESTNET_BASE_URL,
      usdt,
      unrealizedTotal,
      realizedRecentSum: realizedRecent,
      balance,
      positions: Array.isArray(positions) ? positions : [],
      openOrders: Array.isArray(openOrders) ? openOrders : [],
      realizedPnlRows: incArr,
      tradeHistory: uniqueTrades.slice(0, 100)
    };
  } catch (err) {
    return {
      ok: false,
      error: "fetch_failed",
      message: String(err?.message || err)
    };
  }
}

function weightedAvgPrice(rows) {
  const valid = rows
    .map((r) => ({
      price: Number(r.stopPrice || r.price || 0),
      qty: Number(r.origQty || 0)
    }))
    .filter((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.qty) && x.qty > 0);
  if (!valid.length) return null;
  const denom = valid.reduce((acc, x) => acc + x.qty, 0);
  if (!denom) return null;
  const num = valid.reduce((acc, x) => acc + x.price * x.qty, 0);
  return num / denom;
}

async function getTestnetOrderMetrics(symbol) {
  if (!API_KEY || !API_SECRET) {
    return { ok: false, error: "missing_keys", message: "Testnet API keys not configured" };
  }
  try {
    const params = {};
    if (symbol) params.symbol = String(symbol).toUpperCase();
    const openOrders = await requestSigned("GET", "/fapi/v1/openOrders", params).catch(() => []);
    const rows = Array.isArray(openOrders) ? openOrders : [];

    const isTp = (o) => ["TAKE_PROFIT", "TAKE_PROFIT_MARKET"].includes(String(o.type || "").toUpperCase());
    const isSl = (o) => ["STOP", "STOP_MARKET"].includes(String(o.type || "").toUpperCase());
    const sideBuy = (o) => String(o.side || "").toUpperCase() === "BUY";
    const sideSell = (o) => String(o.side || "").toUpperCase() === "SELL";

    const tpBuy = rows.filter((o) => isTp(o) && sideBuy(o));
    const slBuy = rows.filter((o) => isSl(o) && sideBuy(o));
    const tpSell = rows.filter((o) => isTp(o) && sideSell(o));
    const slSell = rows.filter((o) => isSl(o) && sideSell(o));

    return {
      ok: true,
      symbol: symbol ? String(symbol).toUpperCase() : null,
      counts: {
        openOrders: rows.length,
        tpBuy: tpBuy.length,
        slBuy: slBuy.length,
        tpSell: tpSell.length,
        slSell: slSell.length
      },
      averages: {
        tpBuy: weightedAvgPrice(tpBuy),
        slBuy: weightedAvgPrice(slBuy),
        tpSell: weightedAvgPrice(tpSell),
        slSell: weightedAvgPrice(slSell)
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: "fetch_failed",
      message: String(err?.message || err)
    };
  }
}

async function placeDemoEntryOrder({ symbol, action, usdtNotional }) {
  const side = action === "OPEN_LONG" ? "BUY" : action === "OPEN_SHORT" ? "SELL" : null;
  if (!side) throw new Error("Action must be OPEN_LONG or OPEN_SHORT");

  const markPrice = await getMarkPrice(symbol);
  const rawQty = Number(usdtNotional) / markPrice;
  const quantity = await normalizeOrderQuantity(symbol, rawQty);

  const order = await requestSigned("POST", "/fapi/v1/order", {
    symbol,
    side,
    type: "MARKET",
    quantity: String(quantity),
    newOrderRespType: "RESULT"
  });

  return {
    symbol,
    side,
    action,
    markPrice,
    quantity,
    usdtNotional,
    order
  };
}

function positionDirection(p) {
  const amt = Number(p?.positionAmt || 0);
  if (!Number.isFinite(amt) || Math.abs(amt) < 1e-12) return "FLAT";
  return amt > 0 ? "LONG" : "SHORT";
}

async function getOpenTestnetPositions(symbol) {
  if (!API_KEY || !API_SECRET) {
    return [];
  }
  const positions = await requestSigned("GET", "/fapi/v2/positionRisk", {}).catch(() => []);
  const rows = Array.isArray(positions) ? positions : [];
  const filtered = rows.filter((p) => Math.abs(Number(p?.positionAmt || 0)) > 1e-12);
  if (!symbol) return filtered;
  const sym = String(symbol).toUpperCase();
  return filtered.filter((p) => String(p?.symbol || "").toUpperCase() === sym);
}

async function closeTestnetPosition(position, reason = "signal_flip") {
  const symbol = String(position?.symbol || "").toUpperCase();
  if (!symbol) throw new Error("Invalid position symbol");
  const amt = Number(position?.positionAmt || 0);
  if (!Number.isFinite(amt) || Math.abs(amt) < 1e-12) {
    return { ok: true, skipped: true, reason: "position already flat", symbol };
  }
  const side = amt > 0 ? "SELL" : "BUY";
  const rawQty = Math.abs(amt);
  const quantity = await normalizeOrderQuantity(symbol, rawQty);
  const posSide = String(position?.positionSide || "BOTH").toUpperCase();
  const params = {
    symbol,
    side,
    type: "MARKET",
    quantity: String(quantity),
    newOrderRespType: "RESULT"
  };
  // One-way mode: enforce reduce-only. Hedge mode: specify positionSide for safe close.
  if (posSide === "LONG" || posSide === "SHORT") {
    params.positionSide = posSide;
  } else {
    params.reduceOnly = "true";
  }
  const order = await requestSigned("POST", "/fapi/v1/order", params);
  return {
    ok: true,
    symbol,
    side,
    quantity,
    positionSide: posSide,
    reason,
    order
  };
}

module.exports = {
  placeDemoEntryOrder,
  getOpenTestnetPositions,
  closeTestnetPosition,
  getFuturesAccountSnapshot,
  getTestnetOrderMetrics
};

