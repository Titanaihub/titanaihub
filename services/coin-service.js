const { loadMockCoinData } = require("../js/mock-data.js");
const { getRealCoin } = require("../js/real-data.js");
const {
  CACHE_TTL_MS,
  COIN_UNIVERSE,
  RUNTIME_CACHE
} = require("../config/constants.js");
const { isFresh, now } = require("../utils/helpers.js");

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

async function getStableCoin(symbol) {
  const key = String(symbol || "").toLowerCase();
  const mockCoins = loadMockCoinData();
  const bucket = getCoinBucket(key);

  if (isFresh(bucket.updatedAt, CACHE_TTL_MS) && bucket.live) {
    return bucket.live;
  }

  try {
    const data = await getRealCoin(key);

    if (isValidCoin(data)) {
      bucket.live = data;
      bucket.lastGood = data;
      bucket.updatedAt = now();
      return data;
    }
  } catch (err) {
    console.error(`getStableCoin live failed ${key}:`, err.message);
  }

  if (bucket.lastGood) {
    return bucket.lastGood;
  }

  const mock = mockCoins[key] || {};
  bucket.live = mock;
  bucket.lastGood = mock;
  bucket.updatedAt = now();
  return mock;
}

async function getAllStableCoins() {
  const result = {};

  for (const meta of COIN_UNIVERSE) {
    try {
      if (["btc", "eth", "bnb"].includes(meta.key)) {
        result[meta.symbol] = await getStableCoin(meta.key);
      } else {
        result[meta.symbol] = {
          price: meta.fallbackPrice,
          signal: "WAIT",
          change5m: 0,
          change15m: 0,
          change1h: 0,
          change4h: 0,
          funding: 0,
          oi: 0,
          bias: "Sideway",
          entry: meta.fallbackPrice,
          sl: meta.fallbackPrice * 0.985,
          tp: meta.fallbackPrice * 1.02
        };
      }
    } catch (_) {
      result[meta.symbol] = {
        price: meta.fallbackPrice,
        signal: "WAIT",
        change5m: 0,
        change15m: 0,
        change1h: 0,
        change4h: 0,
        funding: 0,
        oi: 0,
        bias: "Sideway",
        entry: meta.fallbackPrice,
        sl: meta.fallbackPrice * 0.985,
        tp: meta.fallbackPrice * 1.02
      };
    }
  }

  return result;
}

module.exports = {
  isValidCoin,
  getCoinBucket,
  getStableCoin,
  getAllStableCoins
};
