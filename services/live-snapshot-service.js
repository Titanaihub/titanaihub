const { getStableOverview } = require("./overview-service.js");
const { getStableCoin } = require("./coin-service.js");
const { buildCoinFocusPackage } = require("./coinfocus-service.js");
const { buildAlertPackage } = require("./alert-service.js");
const { buildRealFlowPackage } = require("./real-flow-service.js");

async function buildLiveSnapshot() {
  const overview = await getStableOverview();
  const coins = {
    btc: await getStableCoin("btc"),
    eth: await getStableCoin("eth"),
    bnb: await getStableCoin("bnb")
  };
  const coinFocus = await buildCoinFocusPackage();
  const alerts = await buildAlertPackage();
  const flowPkg = await buildRealFlowPackage();

  return {
    overview,
    coins,
    coinFocus,
    alerts,
    whales: flowPkg.flowFeed.slice(0, 30),
    positioningSummary: flowPkg.positioningSummary,
    liquiditySummary: flowPkg.liquiditySummary
  };
}

module.exports = { buildLiveSnapshot };
