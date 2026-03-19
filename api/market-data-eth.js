const { fetchCoinMarketData } = require("../lib/marketDataService");

module.exports = async (req, res) => {
  try {
    const data = await fetchCoinMarketData("ethereum", "ETH");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "ETH",
      coinId: "ethereum",
      source: "coingecko",
      error: err.toString()
    });
  }
};
