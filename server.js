
const express = require("express");
const cors = require("cors");

const { fetchCoinMarketData } = require("./lib/marketDataService");
const { buildFeatureSet } = require("./lib/featureEngine");
const { buildDecision } = require("./lib/decisionEngine");
const { buildAiAnalysisPrompt } = require("./lib/aiPromptBuilder");

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
      "/api/decision-btc",
      "/api/ai-analysis-btc"
    ]
  });
});

app.get("/api/market-data-btc", async (req, res) => {
  try {
    const data = await fetchCoinMarketData("bitcoin", "BTC");
    res.json(data);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BTC",
      error: err.message || String(err)
    });
  }
});

app.get("/api/market-data-eth", async (req, res) => {
  try {
    const data = await fetchCoinMarketData("ethereum", "ETH");
    res.json(data);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "ETH",
      error: err.message || String(err)
    });
  }
});

app.get("/api/market-data-bnb", async (req, res) => {
  try {
    const data = await fetchCoinMarketData("binancecoin", "BNB");
    res.json(data);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BNB",
      error: err.message || String(err)
    });
  }
});

app.get("/api/features-btc", async (req, res) => {
  try {
    const marketData = await fetchCoinMarketData("bitcoin", "BTC");
    const features = buildFeatureSet(marketData);
    res.json(features);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BTC",
      error: err.message || String(err)
    });
  }
});

app.get("/api/decision-btc", async (req, res) => {
  try {
    const marketData = await fetchCoinMarketData("bitcoin", "BTC");
    const features = buildFeatureSet(marketData);
    const decision = buildDecision(features);
    res.json(decision);
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BTC",
      error: err.message || String(err)
    });
  }
});

app.get("/api/ai-analysis-btc", async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({
        ok: false,
        symbol: "BTC",
        error: "Missing OPENROUTER_API_KEY"
      });
    }

    const marketData = await fetchCoinMarketData("bitcoin", "BTC");
    const features = buildFeatureSet(marketData);
    const prompt = buildAiAnalysisPrompt("BTC", features);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://titan-ai-hub.onrender.com",
        "X-Title": "Titan AI Hub"
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        symbol: "BTC",
        error: data
      });
    }

    const rawText = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!rawText) {
      return res.status(500).json({
        ok: false,
        symbol: "BTC",
        error: "OpenRouter returned empty output"
      });
    }

    const cleanedText = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let analysis;
    try {
      analysis = JSON.parse(cleanedText);
    } catch (parseErr) {
      return res.status(500).json({
        ok: false,
        symbol: "BTC",
        error: "Failed to parse OpenRouter JSON output",
        raw: rawText,
        cleaned: cleanedText
      });
    }

    res.json({
      ok: true,
      source: "openrouter",
      symbol: "BTC",
      marketData,
      features,
      analysis
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BTC",
      error: err.message || String(err)
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Titan AI Hub API running on port ${PORT}`);
});
