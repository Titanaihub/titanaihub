const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

app.get("/api/overview", (req, res) => {
  res.json(global.loadMockOverviewData());
});

app.get("/api/coin/:symbol", (req, res) => {
  const coins = global.loadMockCoinData();
  const symbol = String(req.params.symbol || "").toLowerCase();
  res.json(coins[symbol] || {});
});

app.get("/api/whales", (req, res) => {
  res.json(global.loadMockWhaleData());
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === "admin" && password === "1234") {
    return res.json({ ok: true, success: true, message: "Login successful" });
  }
  return res.status(401).json({ ok: false, success: false, message: "Invalid username or password" });
});

app.post("/api/chat", (req, res) => {
  const q = String(req.body?.question || "").toLowerCase();
  let reply = "Current market is mixed. Use small risk and wait for clearer confirmation.";
  if (q.includes("btc")) reply = "BTC is neutral. Entry near 70650, stop near 69980, take profit near 72150.";
  if (q.includes("eth")) reply = "ETH is relatively stable. Entry near 2142, stop near 2108, take profit near 2205.";
  if (q.includes("bnb")) reply = "BNB is calmer. Entry near 642, stop near 631, take profit near 658.";
  if (q.includes("risk")) reply = "Main risk is unclear direction. Keep size small and respect stop loss.";
  res.json({ ok: true, reply });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

require("./js/mock-data.js");

app.listen(PORT, () => {
  console.log(`Titan AI Hub server running on port ${PORT}`);
});
