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

module.exports = {
  placeDemoEntryOrder
};

