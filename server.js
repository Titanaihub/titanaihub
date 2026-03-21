const express = require("express");
const cors = require("cors");
const path = require("path");

require("./js/mock-data.js");

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
  const { question, snapshot } = req.body || {};
  const q = String(question || "").toLowerCase();

  let parsed = null;
  try {
    parsed = snapshot ? JSON.parse(snapshot) : null;
  } catch (_) {
    parsed = null;
  }

  const coins = parsed?.coins || {};
  const overview = parsed?.overview || {};
  const mockCoins = global.loadMockCoinData ? global.loadMockCoinData() : {};

  const btc = coins.btc || mockCoins.btc || {};
  const eth = coins.eth || mockCoins.eth || {};
  const bnb = coins.bnb || mockCoins.bnb || {};

  function coinBrief(symbol, coin) {
    return `${symbol}: signal ${coin.signal || "--"}, bias ${coin.bias || "--"}, entry ${coin.entry || "--"}, stop loss ${coin.sl || "--"}, take profit ${coin.tp || "--"}.`;
  }

  function coinTradeView(symbol, coin) {
    return `${symbol} looks ${String(coin.bias || "neutral").toLowerCase()}. Current signal is ${coin.signal || "WAIT"}. Suggested structure: entry near ${coin.entry || "--"}, stop loss near ${coin.sl || "--"}, and take profit near ${coin.tp || "--"}. Funding is ${coin.funding ?? "--"}% and open interest is ${coin.oi || "--"}.`;
  }

  let reply = `Market is ${String(overview.marketBias || "mixed").toLowerCase()}. BTC dominance is ${overview.btcDominance ?? "--"}% and fear & greed is ${overview.fearGreed ?? "--"}. Best approach is controlled risk until cleaner confirmation appears.`;

  if (q.includes("btc")) {
    reply = coinTradeView("BTC", btc);
  } else if (q.includes("eth")) {
    reply = coinTradeView("ETH", eth);
  } else if (q.includes("bnb")) {
    reply = coinTradeView("BNB", bnb);
  } else if (q.includes("compare") || q.includes("เทียบ")) {
    reply =
      `Comparison now: ${coinBrief("BTC", btc)} ${coinBrief("ETH", eth)} ${coinBrief("BNB", bnb)} ` +
      `BTC is the main reference asset, ETH is the secondary setup, and BNB is the calmer watchlist asset.`;
  } else if (q.includes("risk") || q.includes("ความเสี่ยง") || q.includes("เสี่ยง")) {
    reply =
      `Current risk view: market bias is ${overview.marketBias || "--"}. ` +
      `BTC fear & greed is ${overview.fearGreed ?? "--"}, so chasing is not ideal. ` +
      `Use small position size, respect stop loss strictly, and avoid overtrading while the market stays ${String(overview.marketBias || "mixed").toLowerCase()}.`;
  } else if (q.includes("entry") || q.includes("sl") || q.includes("tp") || q.includes("stop") || q.includes("take profit")) {
    reply =
      `Current trade map: ` +
      `BTC entry ${btc.entry || "--"}, SL ${btc.sl || "--"}, TP ${btc.tp || "--"}; ` +
      `ETH entry ${eth.entry || "--"}, SL ${eth.sl || "--"}, TP ${eth.tp || "--"}; ` +
      `BNB entry ${bnb.entry || "--"}, SL ${bnb.sl || "--"}, TP ${bnb.tp || "--"}.`;
  }

  res.json({ ok: true, reply });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Titan AI Hub server running on port ${PORT}`);
});
