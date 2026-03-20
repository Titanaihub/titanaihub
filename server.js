const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

function nowText() {
  return new Date().toLocaleString();
}

function buildOverview() {
  return {
    status: "LIVE",
    lastUpdated: nowText(),
    marketBias: "Sideway",
    totalMarketCap: 2960000000000,
    totalVolume24h: 102800000000,
    btcDominance: 56.5,
    fearGreed: 71
  };
}

function buildCoin(symbol) {
  const map = {
    btc: {
      price: 70909,
      signal: "WAIT",
      change5m: -0.08,
      change15m: 0.12,
      change1h: -0.21,
      change4h: 0.84,
      funding: 0.008,
      oi: 105367612816,
      bias: "Sideway",
      entry: 70650,
      sl: 69980,
      tp: 72150
    },
    eth: {
      price: 2158.14,
      signal: "WAIT",
      change5m: 0.05,
      change15m: -0.11,
      change1h: 0.34,
      change4h: 1.02,
      funding: 0.006,
      oi: 28760000000,
      bias: "Neutral",
      entry: 2142,
      sl: 2108,
      tp: 2205
    },
    bnb: {
      price: 645.44,
      signal: "WAIT",
      change5m: 0.02,
      change15m: 0.09,
      change1h: -0.14,
      change4h: 0.67,
      funding: 0.004,
      oi: 6800000000,
      bias: "Neutral",
      entry: 642,
      sl: 631,
      tp: 658
    }
  };

  return map[String(symbol || "").toLowerCase()] || {
    price: 0,
    signal: "WAIT",
    change5m: 0,
    change15m: 0,
    change1h: 0,
    change4h: 0,
    funding: 0,
    oi: 0,
    bias: "Neutral",
    entry: 0,
    sl: 0,
    tp: 0
  };
}

function buildWhales() {
  return [
    { address: "0xcab5...6e", symbol: "ETH", action: "Open Long", position: "$6.47M", price: "$2157.93", time: "18:14" },
    { address: "0xec32...82", symbol: "BTC", action: "Open Long", position: "$15.56M", price: "$70775.6", time: "18:11" },
    { address: "0xcb84...cd", symbol: "SOL", action: "Close Short", position: "$1.01M", price: "$89.56", time: "18:08" },
    { address: "0xe84f...64", symbol: "HYPE", action: "Close Long", position: "$1.19M", price: "$39.42", time: "18:07" },
    { address: "0x7cb0...20", symbol: "BTC", action: "Open Short", position: "$1.11M", price: "$70215.3", time: "18:05" }
  ];
}

app.get("/api/overview", (req, res) => {
  res.json(buildOverview());
});

app.get("/api/coin/:symbol", (req, res) => {
  const { symbol } = req.params;
  res.json(buildCoin(symbol));
});

app.get("/api/whales", (req, res) => {
  res.json(buildWhales());
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username === "admin" && password === "1234") {
    return res.json({
      ok: true,
      success: true,
      message: "Login successful"
    });
  }

  return res.status(401).json({
    ok: false,
    success: false,
    message: "Invalid username or password"
  });
});

app.post("/api/chat", (req, res) => {
  const { question, snapshot } = req.body || {};

  const q = String(question || "").toLowerCase();
  let reply =
    "Current market is mixed. Use caution, keep risk small, and wait for clearer confirmation before aggressive entries.";

  if (q.includes("btc")) {
    reply =
      "BTC currently looks neutral to sideways. Suggested zone is entry near 70650, stop loss near 69980, and take profit near 72150. Wait for stronger confirmation before increasing size.";
  } else if (q.includes("eth")) {
    reply =
      "ETH remains relatively stable. Suggested structure is entry near 2142, stop loss near 2108, and take profit near 2205. Better for controlled setups than aggressive chasing.";
  } else if (q.includes("bnb")) {
    reply =
      "BNB is calmer than BTC and ETH. Suggested structure is entry near 642, stop loss near 631, and take profit near 658.";
  } else if (q.includes("compare")) {
    reply =
      "BTC remains the strongest reference asset. ETH is stable but less decisive, while BNB is calmer and better used as a secondary watchlist asset.";
  } else if (q.includes("risk")) {
    reply =
      "Main risk right now is unclear trend direction. Avoid oversized positions, use tight risk control, and respect entry, stop loss, and take profit levels.";
  }

  res.json({
    ok: true,
    reply,
    snapshotReceived: !!snapshot
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Titan AI Hub server running on port ${PORT}`);
});
