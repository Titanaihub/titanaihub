const express = require("express");
const cors = require("cors");

const { fetchCoinMarketData } = require("./lib/marketDataService");
const { buildFeatureSet } = require("./lib/featureEngine");
const { buildDecision } = require("./lib/decisionEngine");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Titan AI Hub API",
    endpoints: [
      "/api/market-data-btc",
      "/api/market-data-eth",
      "/api/market-data-bnb",
      "/api/features-btc",
      "/api/decision-btc"
    ]
  });
});

app.get("/api/market-data-btc", async (req, res) => {
  try {
    const data = await fetchCoinMarketData("bitcoin", "BTC");
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, symbol: "BTC", error: err.toString() });
  }
});

app.get("/api/market-data-eth", async (req, res) => {
  try {
    const data = await fetchCoinMarketData("ethereum", "ETH");
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, symbol: "ETH", error: err.toString() });
  }
});

app.get("/api/market-data-bnb", async (req, res) => {
  try {
    const data = await fetchCoinMarketData("binancecoin", "BNB");
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, symbol: "BNB", error: err.toString() });
  }
});

app.get("/api/features-btc", async (req, res) => {
  try {
    const marketData = await fetchCoinMarketData("bitcoin", "BTC");
    const features = buildFeatureSet(marketData);
    res.json(features);
  } catch (err) {
    res.status(500).json({ ok: false, symbol: "BTC", error: err.toString() });
  }
});

app.get("/api/decision-btc", async (req, res) => {
  try {
    const marketData = await fetchCoinMarketData("bitcoin", "BTC");
    const features = buildFeatureSet(marketData);
    const decision = buildDecision(features);
    res.json(decision);
  } catch (err) {
    res.status(500).json({ ok: false, symbol: "BTC", error: err.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Titan AI Hub API running on port ${PORT}`);
});
