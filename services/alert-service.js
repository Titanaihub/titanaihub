const { CACHE_TTL_MS, RUNTIME_CACHE } = require("../config/constants.js");
const { buildCoinFocusPackage } = require("./coinfocus-service.js");
const { buildWhalePackage } = require("./whale-service.js");
const { isFresh, now } = require("../utils/helpers.js");

function buildSmartMoneyAlerts(coinFocusList, stablecoinFlows, whaleSummary) {
  const alerts = [];

  const sortedCoins = [...coinFocusList].sort((a, b) => b.finalSetupScore - a.finalSetupScore);
  const strongest = sortedCoins.slice(0, 4);
  const weakest = [...sortedCoins]
    .sort((a, b) => a.finalSetupScore - b.finalSetupScore)
    .slice(0, 3);

  for (const coin of strongest) {
    alerts.push({
      type: "opportunity",
      symbol: coin.symbol,
      title: `${coin.symbol} setup strength ${coin.finalSetupScore}`,
      detail: `${coin.setupDirection} with ${coin.trendState}, whale bias ${coin.longShortContext}, liquidity signal ${coin.liquiditySignal}.`
    });
  }

  for (const coin of weakest) {
    alerts.push({
      type: "risk",
      symbol: coin.symbol,
      title: `${coin.symbol} trap risk ${coin.liquidityRisk}`,
      detail: `Market structure is ${coin.trendState}. Watch for failed breakout, stop hunt, or squeeze before continuation.`
    });
  }

  for (const flow of stablecoinFlows || []) {
    alerts.push({
      type: String(flow.netFlow || "").trim().startsWith("-") ? "risk" : "flow",
      symbol: flow.symbol,
      title: `${flow.symbol} net flow ${flow.netFlow}`,
      detail: flow.interpretation
    });
  }

  const whaleHot = (whaleSummary || []).filter(
    (x) => x.netBias === "Long Dominant" || x.netBias === "Short Dominant"
  );

  for (const item of whaleHot.slice(0, 5)) {
    alerts.push({
      type: item.netBias === "Long Dominant" ? "flow" : "risk",
      symbol: item.symbol,
      title: `${item.symbol} ${item.netBias}`,
      detail: `Open long ${item.openLongUsd}, open short ${item.openShortUsd}, pending orders ${item.pendingOrders}.`
    });
  }

  return alerts.slice(0, 12);
}

async function buildAlertPackage() {
  if (isFresh(RUNTIME_CACHE.alerts.updatedAt, CACHE_TTL_MS) && RUNTIME_CACHE.alerts.list) {
    return RUNTIME_CACHE.alerts.list;
  }

  const coinFocusList = await buildCoinFocusPackage();
  const whalePkg = await buildWhalePackage();

  const alerts = buildSmartMoneyAlerts(
    coinFocusList,
    whalePkg.stablecoinFlows,
    whalePkg.summary
  );

  RUNTIME_CACHE.alerts.list = alerts;
  RUNTIME_CACHE.alerts.updatedAt = now();

  return alerts;
}

module.exports = {
  buildSmartMoneyAlerts,
  buildAlertPackage
};
