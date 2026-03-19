const { fetchCoinMarketData } = require("../lib/marketDataService");

module.exports = async (req, res) => {
  try {
    const data = await fetchCoinMarketData("bitcoin", "BTC");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BTC",
      coinId: "bitcoin",
      source: "coingecko",
      error: err.toString()
    });
  }
};
