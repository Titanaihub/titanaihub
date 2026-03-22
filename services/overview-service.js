const { loadMockOverviewData } = require("../js/mock-data.js");
const { getRealOverview } = require("../js/real-data.js");
const { CACHE_TTL_MS, RUNTIME_CACHE } = require("../config/constants.js");
const { isFresh, now } = require("../utils/helpers.js");

function isValidOverview(data) {
  return Boolean(
    data &&
      Number(data.totalMarketCap) > 0 &&
      Number(data.totalVolume24h) > 0 &&
      Number(data.btcDominance) > 0 &&
      Number(data.fearGreed) >= 0 &&
      typeof data.marketBias === "string" &&
      data.marketBias.length > 0
  );
}

async function getStableOverview() {
  if (isFresh(RUNTIME_CACHE.overview.updatedAt, CACHE_TTL_MS) && RUNTIME_CACHE.overview.live) {
    return RUNTIME_CACHE.overview.live;
  }

  try {
    const data = await getRealOverview();

    if (isValidOverview(data)) {
      RUNTIME_CACHE.overview.live = data;
      RUNTIME_CACHE.overview.lastGood = data;
      RUNTIME_CACHE.overview.updatedAt = now();
      return data;
    }
  } catch (err) {
    console.error("getStableOverview live failed:", err.message);
  }

  if (RUNTIME_CACHE.overview.lastGood) {
    return RUNTIME_CACHE.overview.lastGood;
  }

  const mock = loadMockOverviewData();
  RUNTIME_CACHE.overview.live = mock;
  RUNTIME_CACHE.overview.lastGood = mock;
  RUNTIME_CACHE.overview.updatedAt = now();
  return mock;
}

module.exports = {
  isValidOverview,
  getStableOverview
};
