const { COIN_UNIVERSE } = require("../../config/constants.js");
const { getBinanceFuturesSnapshot } = require("./binance-futures-service.js");

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isHealthySnapshot(snapshot) {
  return Boolean(
    snapshot &&
      toNum(snapshot.price, 0) > 0 &&
      Number.isFinite(toNum(snapshot.change5m, NaN)) &&
      Number.isFinite(toNum(snapshot.change15m, NaN)) &&
      Number.isFinite(toNum(snapshot.change1h, NaN)) &&
      Number.isFinite(toNum(snapshot.change4h, NaN)) &&
      typeof snapshot.signal === "string" &&
      typeof snapshot.bias === "string"
  );
}

async function checkSingleSymbolHealth(meta) {
  try {
    const snapshot = await getBinanceFuturesSnapshot(meta.symbol);

    return {
      symbol: meta.symbol,
      key: meta.key,
      futuresSymbol: snapshot?.futuresSymbol || null,
      source: snapshot?.source || "binance-futures",
      ok: isHealthySnapshot(snapshot),
      price: toNum(snapshot?.price, 0),
      funding: toNum(snapshot?.funding, 0),
      oi: toNum(snapshot?.oi, 0),
      signal: snapshot?.signal || "WAIT",
      bias: snapshot?.bias || "Sideway",
      error: null
    };
  } catch (err) {
    return {
      symbol: meta.symbol,
      key: meta.key,
      futuresSymbol: null,
      source: "binance-futures",
      ok: false,
      price: 0,
      funding: 0,
      oi: 0,
      signal: "WAIT",
      bias: "Unavailable",
      error: err.message
    };
  }
}

async function buildMarketDataHealthReport() {
  const rows = [];

  for (const meta of COIN_UNIVERSE) {
    const row = await checkSingleSymbolHealth(meta);
    rows.push(row);
  }

  const okCount = rows.filter((x) => x.ok).length;
  const failCount = rows.length - okCount;

  return {
    total: rows.length,
    okCount,
    failCount,
    coveragePct: rows.length > 0 ? Number(((okCount / rows.length) * 100).toFixed(2)) : 0,
    rows
  };
}

module.exports = {
  isHealthySnapshot,
  checkSingleSymbolHealth,
  buildMarketDataHealthReport
};
