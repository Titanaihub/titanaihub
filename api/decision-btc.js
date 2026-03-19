const { fetchCoinMarketData } = require("../lib/marketDataService");
const { buildFeatureSet } = require("../lib/featureEngine");
const { buildDecision } = require("../lib/decisionEngine");

module.exports = async (req, res) => {
  try {
    const marketData = await fetchCoinMarketData("bitcoin", "BTC");
    const features = buildFeatureSet(marketData);
    const decision = buildDecision(features);

    res.status(200).json(decision);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BTC",
      error: err.toString()
    });
  }
};
