const { CACHE_TTL_MS, RUNTIME_CACHE } = require("../config/constants.js");
const { isFresh, now } = require("../utils/helpers.js");
const { buildDeepAnalysisPackage } = require("./analysis-service.js");

function buildRealOnlyAlerts(deepPkg) {
  const alerts = [];
  const coins = Array.isArray(deepPkg?.coins) ? deepPkg.coins : [];
  const marketState = deepPkg?.marketState || {};
  const mode = deepPkg?.mode || "unknown";

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
      "Current alert engine uses real futures market data only. Whale flow and stablecoin exchange-flow are excluded until real providers are connected."
  });

  alerts.push({
    type: "macro",
    symbol: "MACRO",
    title: `Market regime: ${marketState.regime || "Unknown"}`,
    detail:
      marketState.explanation ||
      "Macro market regime unavailable."
  });

  for (const coin of strongest) {
    alerts.push({
      type: "opportunity",
      symbol: coin.symbol,
      title: `${coin.symbol} conviction ${coin.setupScore?.convictionScore ?? "--"}`,
      detail:
        `${coin.setupScore?.setupDirection || "Watchlist"} | ` +
        `${coin.derivativesAnalysis?.momentumState?.state || "Balanced"} | ` +
        `Execution mode: ${coin.setupScore?.executionMode || "Wait Confirmation"}`
    });
  }

  for (const coin of riskiest) {
    alerts.push({
      type: "risk",
      symbol: coin.symbol,
      title: `${coin.symbol} risk ${coin.setupScore?.riskScore ?? "--"}`,
      detail:
        `Trap risk: ${coin.derivativesAnalysis?.trapRisk || "Medium"} | ` +
        `Funding: ${coin.derivativesAnalysis?.fundingState?.state || "Neutral"} | ` +
        `OI/Price: ${coin.derivativesAnalysis?.oiPriceState?.oiState || "Mixed"}`
    });
  }

  const squeezeCandidates = coins
    .filter((coin) => {
      const side = String(coin?.derivativesAnalysis?.oiPriceState?.squeezeSide || "");
      return side && side !== "None" && side !== "Unknown" && side !== "Two-Way";
    })
    .slice(0, 4);

  for (const coin of squeezeCandidates) {
    alerts.push({
      type: "derivatives",
      symbol: coin.symbol,
      title: `${coin.symbol} ${coin.derivativesAnalysis?.oiPriceState?.squeezeSide || "Squeeze Risk"}`,
      detail:
        `Funding state: ${coin.derivativesAnalysis?.fundingState?.state || "Neutral"} | ` +
        `Derivatives bias: ${coin.derivativesAnalysis?.oiPriceState?.derivativesBias || "Neutral"}`
    });
  }

  return alerts.slice(0, 12);
}

async function buildAlertPackage() {
  if (isFresh(RUNTIME_CACHE.alerts.updatedAt, CACHE_TTL_MS) && RUNTIME_CACHE.alerts.list) {
    return RUNTIME_CACHE.alerts.list;
  }

  const deepPkg = await buildDeepAnalysisPackage();
  const alerts = buildRealOnlyAlerts(deepPkg);

  RUNTIME_CACHE.alerts.list = alerts;
  RUNTIME_CACHE.alerts.updatedAt = now();

  return alerts;
}

module.exports = {
  buildRealOnlyAlerts,
  buildAlertPackage
};
