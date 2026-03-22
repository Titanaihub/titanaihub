const { CACHE_TTL_MS, COIN_UNIVERSE, RUNTIME_CACHE } = require("../config/constants.js");
const { loadMockCoinData } = require("../js/mock-data.js");
const { getRealCoin } = require("../js/real-data.js");
const { isFresh, now } = require("../utils/helpers.js");
const { getBinanceFuturesSnapshot } = require("./data/binance-futures-service.js");

function isValidCoin(data) {
  return Boolean(
    data &&
      Number(data.price) > 0 &&
      typeof data.signal === "string" &&
      data.signal.length > 0 &&
      Number.isFinite(Number(data.entry)) &&
      Number.isFinite(Number(data.sl)) &&
      Number.isFinite(Number(data.tp)) &&
      typeof data.bias === "string"
  );
}

function getCoinBucket(key) {
  if (!RUNTIME_CACHE.coins[key]) {
    RUNTIME_CACHE.coins[key] = {
      live: null,
      lastGood: null,
      updatedAt: 0
    };
  }
  return RUNTIME_CACHE.coins[key];
}

function findMetaByKey(key) {
  return COIN_UNIVERSE.find((item) => item.key === String(key || "").toLowerCase()) || null;
}

function buildFallbackCoin(meta) {
  const price = Number(meta?.fallbackPrice || 0);

  return {
    source: "fallback",
    price,
    signal: "WAIT",
    change5m: 0,
    change15m: 0,
    change1h: 0,
    change4h: 0,
    funding: 0,
    oi: 0,
    bias: "Sideway",
    entry: price,
    sl: price * 0.985,
    tp: price * 1.02
  };
}

async function getStableCoin(symbol) {
  const key = String(symbol || "").toLowerCase();
  const mockCoins = loadMockCoinData();
  const bucket = getCoinBucket(key);
  const meta = findMetaByKey(key);

  if (isFresh(bucket.updatedAt, CACHE_TTL_MS) && bucket.live) {
    return bucket.live;
  }

  try {
    const binanceData = await getBinanceFuturesSnapshot((meta?.symbol || key).toUpperCase());

    if (isValidCoin(binanceData)) {
      bucket.live = binanceData;
      bucket.lastGood = binanceData;
      bucket.updatedAt = now();
      return binanceData;
    }
  } catch (err) {
    console.error(`binance futures failed ${key}:`, err.message);
  }

  try {
    const legacyReal = await getRealCoin(key);

    if (isValidCoin(legacyReal)) {
      bucket.live = legacyReal;
      bucket.lastGood = legacyReal;
      bucket.updatedAt = now();
      return legacyReal;
    }
  } catch (err) {
    console.error(`legacy real coin failed ${key}:`, err.message);
  }

  if (bucket.lastGood) {
    return bucket.lastGood;
  }

  if (mockCoins[key] && isValidCoin(mockCoins[key])) {
    bucket.live = mockCoins[key];
    bucket.lastGood = mockCoins[key];
    bucket.updatedAt = now();
    return mockCoins[key];
  }

  const fallback = buildFallbackCoin(meta || { fallbackPrice: 0 });
  bucket.live = fallback;
  bucket.lastGood = fallback;
  bucket.updatedAt = now();
  return fallback;
}

async function getAllStableCoins() {
  const result = {};

  for (const meta of COIN_UNIVERSE) {
    try {
      result[meta.symbol] = await getStableCoin(meta.key);
    } catch (err) {
      console.error(`getAllStableCoins failed ${meta.symbol}:`, err.message);
      result[meta.symbol] = buildFallbackCoin(meta);
    }
  }

  return result;
}

module.exports = {
  isValidCoin,
  getCoinBucket,
  findMetaByKey,
  buildFallbackCoin,
  getStableCoin,
  getAllStableCoins
};
