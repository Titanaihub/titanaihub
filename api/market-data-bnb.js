const { fetchCoinMarketData } = require("../lib/marketDataService");

module.exports = async (req, res) => {
  try {
    const data = await fetchCoinMarketData("binancecoin", "BNB");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BNB",
      coinId: "binancecoin",
      source: "coingecko",
      error: err.toString()
    });
  }
};
