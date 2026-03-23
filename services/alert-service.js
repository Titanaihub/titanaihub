const { CACHE_TTL_MS, RUNTIME_CACHE } = require("../config/constants.js");
const { isFresh, now } = require("../utils/helpers.js");
const { buildDeepAnalysisPackage } = require("./analysis-service.js");

function buildRealFlowAlerts(deepPkg) {
  const alerts = [];
  const coins = Array.isArray(deepPkg?.coins) ? deepPkg.coins : [];
  const marketState = deepPkg?.marketState || {};
  const mode = deepPkg?.mode || "unknown";
  const flowSummary = deepPkg?.whales?.stablecoinFlows || {};

  const strongest = [...coins]
    .sort(
      (a, b) =>
        Number(b?.setupScore?.convictionScore || 0) -
        Number(a?.setupScore?.convictionScore || 0)
    )
    .slice(0, 4);

  const riskiest = [...coins]
    .sort(
      (a, b) =>
        Number(b?.setupScore?.riskScore || 0) -
        Number(a?.setupScore?.riskScore || 0)
    )
    .slice(0, 4);

  alerts.push({
    type: "system",
    symbol: "SYSTEM",
    title: `Analysis mode: ${mode}`,
    detail:
      "Current alert engine uses real Binance futures data, derivatives internals, positioning pressure, crowding, and liquidity backdrop."
  });

  alerts.push({
    type: "macro",
    symbol: "MACRO",
    title: `Market regime: ${marketState.regime || "Unknown"}`,
    detail:
      marketState.explanation ||
      "Macro market regime unavailable."
  });

  alerts.push({
    type: "flow",
    symbol: "FLOW",
    title: `Liquidity backdrop: ${flowSummary.summaryState || "Balanced"}`,
    detail:
      `Buy pressure ${flowSummary.buyPressureCount ?? 0}, ` +
      `sell pressure ${flowSummary.sellPressureCount ?? 0}, ` +
      `long crowded ${flowSummary.longCrowdedCount ?? 0}, ` +
      `short crowded ${flowSummary.shortCrowdedCount ?? 0}.`
  });

  for (const coin of strongest) {
    const flow = coin?.whaleAnalysis?.pressure || {};
    alerts.push({
      type: "opportunity",
      symbol: coin.symbol,
      title: `${coin.symbol} conviction ${coin.setupScore?.convictionScore ?? "--"}`,
      detail:
        `${coin.setupScore?.setupDirection || "Watchlist"} | ` +
        `${flow.directionalBias || "Balanced"} | ` +
        `${flow.pressureState || "Balanced"} | ` +
        `Execution mode: ${coin.setupScore?.executionMode || "Wait Confirmation"}`
    });
  }

  for (const coin of riskiest) {
    const flow = coin?.whaleAnalysis?.pressure || {};
    alerts.push({
      type: "risk",
      symbol: coin.symbol,
      title: `${coin.symbol} risk ${coin.setupScore?.riskScore ?? "--"}`,
      detail:
        `Trap risk: ${coin.derivativesAnalysis?.trapRisk || "Medium"} | ` +
        `Flow: ${flow.pressureState || "Balanced"} | ` +
        `Crowding: ${flow.crowdingState || "Balanced"}`
    });
  }

  const squeezeCandidates = coins
    .filter((coin) => {
      const side = String(coin?.derivativesAnalysis?.oiPriceState?.squeezeSide || "");
      return side && side !== "None" && side !== "Unknown" && side !== "Two-Way";
    })
    .slice(0, 3);

  for (const coin of squeezeCandidates) {
    alerts.push({
      type: "derivatives",
      symbol: coin.symbol,
      title: `${coin.symbol} ${coin.derivativesAnalysis?.oiPriceState?.squeezeSide || "Squeeze Risk"}`,
      detail:
        `Funding: ${coin.derivativesAnalysis?.fundingState?.state || "Neutral"} | ` +
        `OI/Price: ${coin.derivativesAnalysis?.oiPriceState?.oiState || "Mixed"} | ` +
        `Bias: ${coin.derivativesAnalysis?.oiPriceState?.derivativesBias || "Neutral"}`
    });
  }

  const crowdedNames = coins
    .filter((coin) => {
      const crowd = String(coin?.whaleAnalysis?.pressure?.crowdingState || "");
      return crowd === "Long Crowded" || crowd === "Short Crowded";
    })
    .slice(0, 3);

  for (const coin of crowdedNames) {
    alerts.push({
      type: "positioning",
      symbol: coin.symbol,
      title: `${coin.symbol} ${coin.whaleAnalysis?.pressure?.crowdingState || "Crowding"}`,
      detail:
        `Directional bias: ${coin.whaleAnalysis?.pressure?.directionalBias || "Balanced"} | ` +
        `OI state: ${coin.whaleAnalysis?.pressure?.oiPressureState || "Mixed Participation"} | ` +
        `Basis: ${coin.whaleAnalysis?.pressure?.basisState || "Neutral Basis"}`
    });
  }

  return alerts.slice(0, 12);
}

async function buildAlertPackage() {
  if (isFresh(RUNTIME_CACHE.alerts.updatedAt, CACHE_TTL_MS) && RUNTIME_CACHE.alerts.list) {
    return RUNTIME_CACHE.alerts.list;
  }

  const deepPkg = await buildDeepAnalysisPackage();
  const alerts = buildRealFlowAlerts(deepPkg);

  RUNTIME_CACHE.alerts.list = alerts;
  RUNTIME_CACHE.alerts.updatedAt = now();

  return alerts;
}

module.exports = {
  buildRealFlowAlerts,
  buildAlertPackage
};
