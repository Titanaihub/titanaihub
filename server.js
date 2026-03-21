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
  const qRaw = String(question || "").trim();
  const q = qRaw.toLowerCase();

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

  const isThai =
    /[ก-๙]/.test(qRaw) ||
    q.includes("เทียบ") ||
    q.includes("เปรียบเทียบ") ||
    q.includes("ความเสี่ยง") ||
    q.includes("เสี่ยง") ||
    q.includes("จุดเข้า") ||
    q.includes("ตัดขาดทุน") ||
    q.includes("ทำกำไร") ||
    q.includes("วิเคราะห์");

  function fmt(v) {
    return v ?? "--";
  }

  function coinBriefEN(symbol, coin) {
    return `${symbol}: signal ${fmt(coin.signal)}, bias ${fmt(coin.bias)}, entry ${fmt(coin.entry)}, stop loss ${fmt(coin.sl)}, take profit ${fmt(coin.tp)}.`;
  }

  function coinBriefTH(symbol, coin) {
    return `${symbol}: สัญญาณ ${fmt(coin.signal)}, มุมมอง ${fmt(coin.bias)}, จุดเข้า ${fmt(coin.entry)}, stop loss ${fmt(coin.sl)}, take profit ${fmt(coin.tp)}.`;
  }

  function coinTradeViewEN(symbol, coin) {
    return `${symbol} looks ${String(coin.bias || "neutral").toLowerCase()}. Current signal is ${fmt(coin.signal)}. Suggested structure: entry near ${fmt(coin.entry)}, stop loss near ${fmt(coin.sl)}, and take profit near ${fmt(coin.tp)}. Funding is ${fmt(coin.funding)}% and open interest is ${fmt(coin.oi)}.`;
  }

  function coinTradeViewTH(symbol, coin) {
    return `${symbol} ตอนนี้มีมุมมองแบบ ${fmt(coin.bias)}. สัญญาณปัจจุบันคือ ${fmt(coin.signal)}. โครงสร้างเทรดที่แนะนำคือ เข้าใกล้ ${fmt(coin.entry)}, ตั้ง stop loss แถว ${fmt(coin.sl)}, และ take profit แถว ${fmt(coin.tp)}. Funding อยู่ที่ ${fmt(coin.funding)}% และ open interest อยู่ที่ ${fmt(coin.oi)}.`;
  }

  function compareReplyEN() {
    return (
      `Comparison now: ${coinBriefEN("BTC", btc)} ${coinBriefEN("ETH", eth)} ${coinBriefEN("BNB", bnb)} ` +
      `BTC remains the main reference asset, ETH is the secondary setup, and BNB is the calmer watchlist asset.`
    );
  }

  function compareReplyTH() {
    return (
      `สรุปเปรียบเทียบตอนนี้: ${coinBriefTH("BTC", btc)} ${coinBriefTH("ETH", eth)} ${coinBriefTH("BNB", bnb)} ` +
      `BTC ยังเป็นเหรียญอ้างอิงหลักของตลาด, ETH เป็นตัวเลือกอันดับสอง, และ BNB เป็นเหรียญที่นิ่งกว่าเหมาะกับการเฝ้าดูเพิ่ม.`
    );
  }

  function riskReplyEN() {
    return (
      `Current risk view: market bias is ${fmt(overview.marketBias)}. ` +
      `BTC dominance is ${fmt(overview.btcDominance)}% and fear & greed is ${fmt(overview.fearGreed)}. ` +
      `That means chasing is not ideal right now. Use smaller size, respect stop loss strictly, and avoid overtrading while the market stays ${String(overview.marketBias || "mixed").toLowerCase()}.`
    );
  }

  function riskReplyTH() {
    return (
      `มุมมองความเสี่ยงตอนนี้: ภาพรวมตลาดเป็น ${fmt(overview.marketBias)}. ` +
      `BTC Dominance อยู่ที่ ${fmt(overview.btcDominance)}% และ Fear & Greed อยู่ที่ ${fmt(overview.fearGreed)}. ` +
      `แปลว่าไม่ควรไล่ราคาแรงในตอนนี้ ควรลดขนาดไม้, ใช้ stop loss ให้ชัด, และหลีกเลี่ยงการเข้าเทรดถี่เกินไปในช่วงที่ตลาดยัง ${fmt(overview.marketBias)}.`
    );
  }

  function entryMapEN() {
    return (
      `Current trade map: ` +
      `BTC entry ${fmt(btc.entry)}, SL ${fmt(btc.sl)}, TP ${fmt(btc.tp)}; ` +
      `ETH entry ${fmt(eth.entry)}, SL ${fmt(eth.sl)}, TP ${fmt(eth.tp)}; ` +
      `BNB entry ${fmt(bnb.entry)}, SL ${fmt(bnb.sl)}, TP ${fmt(bnb.tp)}.`
    );
  }

  function entryMapTH() {
    return (
      `แผนจุดเข้า ณ ตอนนี้: ` +
      `BTC เข้า ${fmt(btc.entry)}, SL ${fmt(btc.sl)}, TP ${fmt(btc.tp)}; ` +
      `ETH เข้า ${fmt(eth.entry)}, SL ${fmt(eth.sl)}, TP ${fmt(eth.tp)}; ` +
      `BNB เข้า ${fmt(bnb.entry)}, SL ${fmt(bnb.sl)}, TP ${fmt(bnb.tp)}.`
    );
  }

  let reply = isThai
    ? `ภาพรวมตลาดตอนนี้เป็น ${fmt(overview.marketBias)}. BTC Dominance อยู่ที่ ${fmt(overview.btcDominance)}% และ Fear & Greed อยู่ที่ ${fmt(overview.fearGreed)}. ควรบริหารความเสี่ยงและรอจังหวะที่ชัดขึ้น.`
    : `Market is ${String(overview.marketBias || "mixed").toLowerCase()}. BTC dominance is ${fmt(overview.btcDominance)}% and fear & greed is ${fmt(overview.fearGreed)}. Best approach is controlled risk until cleaner confirmation appears.`;

  if (q.includes("compare") || q.includes("เทียบ") || q.includes("เปรียบเทียบ")) {
  reply = "COMPARE TEST OK";
  } else if (
    q.includes("risk") ||
    q.includes("ความเสี่ยง") ||
    q.includes("เสี่ยง")
  ) {
    reply = isThai ? riskReplyTH() : riskReplyEN();
  } else if (
    q.includes("entry") ||
    q.includes("sl") ||
    q.includes("tp") ||
    q.includes("stop") ||
    q.includes("take profit") ||
    q.includes("จุดเข้า") ||
    q.includes("ตัดขาดทุน") ||
    q.includes("ทำกำไร")
  ) {
    reply = isThai ? entryMapTH() : entryMapEN();
  } else if (q.includes("btc")) {
    reply = isThai ? coinTradeViewTH("BTC", btc) : coinTradeViewEN("BTC", btc);
  } else if (q.includes("eth")) {
    reply = isThai ? coinTradeViewTH("ETH", eth) : coinTradeViewEN("ETH", eth);
  } else if (q.includes("bnb")) {
    reply = isThai ? coinTradeViewTH("BNB", bnb) : coinTradeViewEN("BNB", bnb);
  }

  res.json({
    ok: true,
    reply
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Titan AI Hub server running on port ${PORT}`);
});
