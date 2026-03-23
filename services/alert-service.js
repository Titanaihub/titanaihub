const { CACHE_TTL_MS, RUNTIME_CACHE } = require("../config/constants.js");
const { isFresh, now } = require("../utils/helpers.js");
const { buildDeepAnalysisPackage } = require("./analysis-service.js");

function buildPhase2Alerts(deepPkg) {
  const alerts = [];
  const coins = Array.isArray(deepPkg?.coins) ? deepPkg.coins : [];
  const marketState = deepPkg?.marketState || {};
  const mode = deepPkg?.mode || "unknown";
  const flowSummary = deepPkg?.whales?.stablecoinFlows || {};

  const strongest = [...coins]
    .sort(
      (a, b) =>
        Number(b?.setupScore?.decisionScore || 0) -
        Number(a?.setupScore?.decisionScore || 0)
    )
    .slice(0, 4);

  const noTradeCoins = coins
    .filter((coin) => String(coin?.setupScore?.executionTier || "") === "No Trade")
    .slice(0, 4);

  const riskCoins = [...coins]
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
      "Phase 2 enabled: real futures data + real flow + volatility + order book + liquidation proxy + decision engine."
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
    const phase2 = coin?.phase2 || {};
    const micro = phase2?.microstructure || {};
    const flow = coin?.whaleAnalysis?.pressure || {};

    alerts.push({
      type: "opportunity",
      symbol: coin.symbol,
      title: `${coin.symbol} ${coin?.setupScore?.executionTier || "Tier"} / ${coin?.setupScore?.decisionScore ?? "--"}`,
      detail:
        `${coin?.setupScore?.recommendedAction || "Wait"} | ` +
        `${flow.directionalBias || "Balanced"} | ` +
        `${micro.microstructureBias || "Balanced"} | ` +
        `${micro.tradeabilityState || "Unknown"}`
    });
  }

  for (const coin of noTradeCoins) {
    const phase2 = coin?.phase2 || {};
    const micro = phase2?.microstructure || {};

    alerts.push({
      type: "caution",
      symbol: coin.symbol,
      title: `${coin.symbol} No Trade`,
      detail:
        `${coin?.setupScore?.noTradeReason || "No clear edge"} | ` +
        `Vol: ${micro?.volatility?.state || "Unknown"} | ` +
        `Spread: ${micro?.orderBook?.spreadState || "Unknown"} | ` +
        `Liq: ${micro?.liquidation?.liquidationState || "Unknown"}`
    });
  }

  for (const coin of riskCoins) {
    const phase2 = coin?.phase2 || {};
    const micro = phase2?.microstructure || {};
    const flags = Array.isArray(coin?.setupScore?.riskFlags)
      ? coin.setupScore.riskFlags.join(", ")
      : "";

    alerts.push({
      type: "risk",
      symbol: coin.symbol,
      title: `${coin.symbol} risk ${coin?.setupScore?.riskScore ?? "--"}`,
      detail:
        `Trap: ${coin?.derivativesAnalysis?.trapRisk || "Medium"} | ` +
        `Book: ${micro?.orderBook?.bookPressureState || "Unknown"} | ` +
        `Flags: ${flags || "None"}`
    });
  }

  const crowdingCoins = coins
    .filter((coin) => {
      const crowd = String(coin?.whaleAnalysis?.pressure?.crowdingState || "");
      return crowd === "Long Crowded" || crowd === "Short Crowded";
    })
    .slice(0, 3);

  for (const coin of crowdingCoins) {
    alerts.push({
      type: "positioning",
      symbol: coin.symbol,
      title: `${coin.symbol} ${coin?.whaleAnalysis?.pressure?.crowdingState || "Crowding"}`,
      detail:
        `Flow: ${coin?.whaleAnalysis?.pressure?.directionalBias || "Balanced"} | ` +
        `OI: ${coin?.whaleAnalysis?.pressure?.oiPressureState || "Mixed Participation"} | ` +
        `Basis: ${coin?.whaleAnalysis?.pressure?.basisState || "Neutral Basis"}`
    });
  }

  const liquidationCoins = coins
    .filter((coin) =>
      String(coin?.phase2?.microstructure?.liquidation?.liquidationState || "").includes("Risk")
    )
    .slice(0, 3);

  for (const coin of liquidationCoins) {
    const liq = coin?.phase2?.microstructure?.liquidation || {};
    alerts.push({
      type: "liquidation",
      symbol: coin.symbol,
      title: `${coin.symbol} ${liq?.liquidationState || "Liquidation Risk"}`,
      detail:
        `Short near: ${liq?.shortLiqNear ? Number(liq.shortLiqNear).toFixed(4) : "--"} | ` +
        `Long near: ${liq?.longLiqNear ? Number(liq.longLiqNear).toFixed(4) : "--"} | ` +
        `Score: ${liq?.liquidationScore ?? "--"}`
    });
  }

  return alerts.slice(0, 14);
}

async function buildAlertPackage() {
  if (isFresh(RUNTIME_CACHE.alerts.updatedAt, CACHE_TTL_MS) && RUNTIME_CACHE.alerts.list) {
    return RUNTIME_CACHE.alerts.list;
  }

  const deepPkg = await buildDeepAnalysisPackage();
  const alerts = buildPhase2Alerts(deepPkg);

  RUNTIME_CACHE.alerts.list = alerts;
  RUNTIME_CACHE.alerts.updatedAt = now();

  return alerts;
}

module.exports = {
  buildPhase2Alerts,
  buildAlertPackage
};
