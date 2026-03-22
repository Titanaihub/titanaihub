const { COIN_UNIVERSE } = require("../config/constants.js");
const { getStableOverview } = require("./overview-service.js");
const { getAllStableCoins } = require("./coin-service.js");
const { buildWhalePackage } = require("./whale-service.js");

const { detectMarketState } = require("./analysis/market-regime.js");
const { buildDerivativesAnalysis } = require("./analysis/derivatives-analysis.js");
const { buildWhaleAnalysis } = require("./analysis/whale-analysis.js");
const { buildStablecoinAnalysis } = require("./analysis/stablecoin-analysis.js");
const { buildSetupScore } = require("./analysis/setup-score.js");
const {
  buildAnalysisExplanation,
  buildExecutionNotes
} = require("./analysis/explanation-builder.js");

function buildWhaleSummaryMap(summaryList) {
  const map = {};
  for (const item of summaryList || []) {
    map[item.symbol] = item;
  }
  return map;
}

function buildSingleCoinAnalysis({
  meta,
  coin,
  marketState,
  whaleSummaryMap,
  stablecoinAnalysis
}) {
  const whaleSummaryItem = whaleSummaryMap[meta.symbol] || null;

  const derivativesAnalysis = buildDerivativesAnalysis(coin || {});
  const whaleAnalysis = buildWhaleAnalysis(coin || {}, whaleSummaryItem);
  const setupScore = buildSetupScore({
    coin: coin || {},
    marketState,
    derivativesAnalysis,
    whaleAnalysis,
    stablecoinAnalysis
  });

  const explanation = buildAnalysisExplanation({
    symbol: meta.symbol,
    marketState,
    derivativesAnalysis,
    whaleAnalysis,
    stablecoinAnalysis,
    setupScore
  });

  const executionNotes = buildExecutionNotes({
    coin: coin || {},
    setupScore,
    derivativesAnalysis,
    whaleAnalysis
  });

  return {
    symbol: meta.symbol,
    key: meta.key,
    className: meta.className,
    chain: meta.chain,
    price: coin?.price ?? meta.fallbackPrice,
    signal: coin?.signal || "WAIT",
    bias: coin?.bias || "Sideway",
    funding: coin?.funding ?? 0,
    oi: coin?.oi ?? 0,
    change5m: coin?.change5m ?? 0,
    change15m: coin?.change15m ?? 0,
    change1h: coin?.change1h ?? 0,
    change4h: coin?.change4h ?? 0,
    entry: coin?.entry ?? meta.fallbackPrice,
    sl: coin?.sl ?? meta.fallbackPrice * 0.985,
    tp: coin?.tp ?? meta.fallbackPrice * 1.02,

    marketState,
    derivativesAnalysis,
    whaleAnalysis,
    stablecoinContext: {
      marketLiquidityState: stablecoinAnalysis.marketLiquidityState,
      liquidityPressure: stablecoinAnalysis.liquidityPressure,
      averageScore: stablecoinAnalysis.averageScore
    },
    setupScore,
    explanation,
    executionNotes
  };
}

async function buildDeepAnalysisPackage() {
  const overview = await getStableOverview();
  const liveCoins = await getAllStableCoins();
  const whalePkg = await buildWhalePackage();

  const marketState = detectMarketState({
    marketBias: overview?.marketBias,
    fearGreed: overview?.fearGreed,
    btcDominance: overview?.btcDominance
  });

  const stablecoinAnalysis = buildStablecoinAnalysis(whalePkg.stablecoinFlows || []);
  const whaleSummaryMap = buildWhaleSummaryMap(whalePkg.summary || []);

  const coins = COIN_UNIVERSE.map((meta) =>
    buildSingleCoinAnalysis({
      meta,
      coin: liveCoins[meta.symbol] || {},
      marketState,
      whaleSummaryMap,
      stablecoinAnalysis
    })
  ).sort(
    (a, b) =>
      Number(b?.setupScore?.convictionScore || 0) -
      Number(a?.setupScore?.convictionScore || 0)
  );

  return {
    overview,
    marketState,
    stablecoinAnalysis,
    whales: {
      summary: whalePkg.summary || [],
      mixedFeed: whalePkg.mixedFeed || [],
      stablecoinFlows: whalePkg.stablecoinFlows || []
    },
    coins
  };
}

module.exports = {
  buildWhaleSummaryMap,
  buildSingleCoinAnalysis,
  buildDeepAnalysisPackage
};
