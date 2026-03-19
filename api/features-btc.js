const { fetchCoinMarketData } = require("../lib/marketDataService");
const { buildFeatureSet } = require("../lib/featureEngine");

module.exports = async (req, res) => {
  try {
    const marketData = await fetchCoinMarketData("bitcoin", "BTC");
    const features = buildFeatureSet(marketData);

    res.status(200).json(features);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BTC",
      error: err.toString()
    });
  }
};
