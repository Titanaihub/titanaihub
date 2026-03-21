const express = require("express");
const cors = require("cors");
const path = require("path");
const https = require("https");

const {
  loadMockOverviewData,
  loadMockCoinData,
  loadMockWhaleData
} = require("./js/mock-data.js");

const {
  getRealOverview,
  getRealCoin
} = require("./js/real-data.js");

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

function hasThai(text) {
  return /[ก-๙]/.test(String(text || ""));
}

function detectReplyLanguage(text) {
  return hasThai(text) ? "th" : "en";
}

function fmt(v) {
  return v ?? "--";
}

function coinBriefEN(symbol, coin) {
  return `${symbol}: signal ${fmt(coin.signal)}, bias ${fmt(coin.bias)}, entry ${fmt(
    coin.entry
  )}, stop loss ${fmt(coin.sl)}, take profit ${fmt(coin.tp)}.`;
}

function coinBriefTH(symbol, coin) {
  return `${symbol}: สัญญาณ ${fmt(coin.signal)}, มุมมอง ${fmt(coin.bias)}, จุดเข้า ${fmt(
    coin.entry
  )}, stop loss ${fmt(coin.sl)}, take profit ${fmt(coin.tp)}.`;
}

function coinTradeViewEN(symbol, coin) {
  return `${symbol} looks ${String(coin.bias || "neutral").toLowerCase()}. Current signal is ${fmt(
    coin.signal
  )}. Suggested structure: entry near ${fmt(coin.entry)}, stop loss near ${fmt(
    coin.sl
  )}, and take profit near ${fmt(coin.tp)}. Funding is ${fmt(
    coin.funding
  )}% and open interest is ${fmt(coin.oi)}.`;
}

function coinTradeViewTH(symbol, coin) {
  return `${symbol} ตอนนี้มีมุมมองแบบ ${fmt(
    coin.bias
  )}. สัญญาณปัจจุบันคือ ${fmt(
    coin.signal
  )}. โครงสร้างเทรดที่แนะนำคือ เข้าใกล้ ${fmt(
    coin.entry
  )}, ตั้ง stop loss แถว ${fmt(coin.sl)}, และ take profit แถว ${fmt(
    coin.tp
  )}. Funding อยู่ที่ ${fmt(coin.funding)}% และ open interest อยู่ที่ ${fmt(coin.oi)}.`;
}
function compareReplyEN(btc, eth, bnb) {
  return (
    `Comparison now: ${coinBriefEN("BTC", btc)} ${coinBriefEN("ETH", eth)} ${coinBriefEN(
      "BNB",
      bnb
    )} ` +
    `BTC remains the main reference asset, ETH is the secondary setup, and BNB is the calmer watchlist asset.`
  );
}

function compareReplyTH(btc, eth, bnb) {
  return (
    `สรุปเปรียบเทียบตอนนี้: ${coinBriefTH("BTC", btc)} ${coinBriefTH("ETH", eth)} ${coinBriefTH(
      "BNB",
      bnb
    )} ` +
    `BTC ยังเป็นเหรียญอ้างอิงหลักของตลาด, ETH เป็นตัวเลือกอันดับสอง, และ BNB เป็นเหรียญที่นิ่งกว่าเหมาะกับการเฝ้าดูเพิ่ม.`
  );
}

function riskReplyEN(overview) {
  return (
    `Current risk view: market bias is ${fmt(overview.marketBias)}. ` +
    `BTC dominance is ${fmt(overview.btcDominance)}% and fear & greed is ${fmt(
      overview.fearGreed
    )}. ` +
    `That means chasing is not ideal right now. Use smaller size, respect stop loss strictly, and avoid overtrading while the market stays ${String(
      overview.marketBias || "mixed"
    ).toLowerCase()}.`
  );
}

function riskReplyTH(overview) {
  return (
    `มุมมองความเสี่ยงตอนนี้: ภาพรวมตลาดเป็น ${fmt(overview.marketBias)}. ` +
    `BTC Dominance อยู่ที่ ${fmt(overview.btcDominance)}% และ Fear & Greed อยู่ที่ ${fmt(
      overview.fearGreed
    )}. ` +
    `แปลว่าไม่ควรไล่ราคาแรงในตอนนี้ ควรลดขนาดไม้ ใช้ stop loss ให้ชัด และหลีกเลี่ยงการเข้าเทรดถี่เกินไปในช่วงที่ตลาดยัง ${fmt(
      overview.marketBias
    )}.`
  );
}

function entryMapEN(btc, eth, bnb) {
  return (
    `Current trade map: ` +
    `BTC entry ${fmt(btc.entry)}, SL ${fmt(btc.sl)}, TP ${fmt(btc.tp)}; ` +
    `ETH entry ${fmt(eth.entry)}, SL ${fmt(eth.sl)}, TP ${fmt(eth.tp)}; ` +
    `BNB entry ${fmt(bnb.entry)}, SL ${fmt(bnb.sl)}, TP ${fmt(bnb.tp)}.`
  );
}

function entryMapTH(btc, eth, bnb) {
  return (
    `แผนจุดเข้า ณ ตอนนี้: ` +
    `BTC เข้า ${fmt(btc.entry)}, SL ${fmt(btc.sl)}, TP ${fmt(btc.tp)}; ` +
    `ETH เข้า ${fmt(eth.entry)}, SL ${fmt(eth.sl)}, TP ${fmt(eth.tp)}; ` +
    `BNB เข้า ${fmt(bnb.entry)}, SL ${fmt(bnb.sl)}, TP ${fmt(bnb.tp)}.`
  );
}

function buildFallbackReply(question, overview, btc, eth, bnb) {
  const qRaw = String(question || "").trim();
  const q = qRaw.toLowerCase();
  const lang = detectReplyLanguage(qRaw);
  const isThai = lang === "th";

  let reply = isThai
    ? `ภาพรวมตลาดตอนนี้เป็น ${fmt(overview.marketBias)}. BTC Dominance อยู่ที่ ${fmt(
        overview.btcDominance
      )}% และ Fear & Greed อยู่ที่ ${fmt(
        overview.fearGreed
      )}. ควรบริหารความเสี่ยงและรอจังหวะที่ชัดขึ้น.`
    : `Market is ${String(overview.marketBias || "mixed").toLowerCase()}. BTC dominance is ${fmt(
        overview.btcDominance
      )}% and fear & greed is ${fmt(
        overview.fearGreed
      )}. Best approach is controlled risk until cleaner confirmation appears.`;

  if (q.includes("compare") || q.includes("เทียบ") || q.includes("เปรียบเทียบ")) {
    reply = isThai ? compareReplyTH(btc, eth, bnb) : compareReplyEN(btc, eth, bnb);
  } else if (q.includes("risk") || q.includes("ความเสี่ยง") || q.includes("เสี่ยง")) {
    reply = isThai ? riskReplyTH(overview) : riskReplyEN(overview);
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
    reply = isThai ? entryMapTH(btc, eth, bnb) : entryMapEN(btc, eth, bnb);
  } else if (q.includes("btc")) {
    reply = isThai ? coinTradeViewTH("BTC", btc) : coinTradeViewEN("BTC", btc);
  } else if (q.includes("eth")) {
    reply = isThai ? coinTradeViewTH("ETH", eth) : coinTradeViewEN("ETH", eth);
  } else if (q.includes("bnb")) {
    reply = isThai ? coinTradeViewTH("BNB", bnb) : coinTradeViewEN("BNB", bnb);
  }

  return reply;
}
function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        }
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          const status = res.statusCode || 500;

          try {
            const json = JSON.parse(data || "{}");
            if (status >= 200 && status < 300) {
              resolve(json);
            } else {
              reject(new Error(json?.error?.message || `DeepSeek HTTP ${status}`));
            }
          } catch (err) {
            reject(new Error(`Invalid JSON response from DeepSeek: ${err.message}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function buildSystemPrompt(language) {
  if (language === "th") {
    return [
      "คุณคือผู้ช่วยวิเคราะห์ตลาดคริปโตของ Titan AI Hub",
      "ตอบเป็นภาษาไทยเท่านั้น",
      "ห้ามตอบภาษาอังกฤษ ยกเว้นชื่อเหรียญ คำว่า LONG, SHORT, entry, stop loss, take profit",
      "ถ้าผู้ใช้ถามเป็นภาษาไทย ต้องตอบไทยทั้งหมด",
      "ตอบสั้น กระชับ อ่านง่าย",
      "ใช้ข้อมูล snapshot ที่ให้มาเท่านั้น",
      "ห้ามแต่งตัวเลขเพิ่ม",
      "ถ้าผู้ใช้ถามเรื่องเทรด ให้สรุปเป็น:",
      "1) มุมมอง",
      "2) ความเสี่ยง",
      "3) จุดเข้า/SL/TP ถ้ามี",
      "ถ้าข้อมูลไม่พอให้พูดตรง ๆ"
    ].join("\n");
  }

  return [
    "You are Titan AI Hub crypto market assistant.",
    "Reply in English only.",
    "If the user asks in English, do not answer in Thai.",
    "Be concise and easy to read.",
    "Use only the snapshot data provided.",
    "Do not invent numbers.",
    "If the user asks for trading analysis, summarize:",
    "1) bias",
    "2) risk",
    "3) entry/SL/TP if available",
    "If data is insufficient, say so clearly."
  ].join("\n");
}

async function callDeepSeekChat({ question, overview, btc, eth, bnb, whales }) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const language = detectReplyLanguage(question);
  const systemPrompt = buildSystemPrompt(language);

  const snapshotText = JSON.stringify(
    {
      overview,
      coins: { btc, eth, bnb },
      whales
    },
    null,
    2
  );

  const userPrompt =
    language === "th"
      ? `คำถามผู้ใช้:
${question}

ข้อมูลตลาด:
${snapshotText}

กรุณาตอบเป็นภาษาไทยเท่านั้น`
      : `User question:
${question}

Market snapshot:
${snapshotText}

Reply in English only.`;

  const payload = {
    model: DEEPSEEK_MODEL,
    stream: false,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  const json = await postJson("https://api.deepseek.com/chat/completions", payload, {
    Authorization: `Bearer ${DEEPSEEK_API_KEY}`
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned empty content");
  }

  return String(content).trim();
}

function getWhaleUniverse() {
  return [
    {
      symbol: "BTC",
      address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      position: "$12.80M",
      chain: "btc"
    },
    {
      symbol: "ETH",
      address: "0x8ba1f109551bd432803012645ac136ddd64dba72",
      position: "$8.40M",
      chain: "eth"
    },
    {
      symbol: "BNB",
      address: "bnb1grpf0955h0yk6l2v3arh9p7hk0j2v8w5x9k3m4",
      position: "$4.20M",
      chain: "bsc"
    },
    {
      symbol: "SOL",
      address: "7dHbWXad2mZ4n6F7s7Q7iLwQ4n8r6nR7h5y3nJ8x2pAf",
      position: "$3.90M",
      chain: "sol"
    },
    {
      symbol: "XRP",
      address: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh",
      position: "$2.75M",
      chain: "xrp"
    },
    {
      symbol: "DOGE",
      address: "D8BqR7M6b5YkV3n2QmZxL9fT6sR4uW1pNx",
      position: "$1.95M",
      chain: "doge"
    },
    {
      symbol: "PEPE",
      address: "0x6a3f4c9b1d62f1d1e7a61e3cf4d7a8e5f91b4d32",
      position: "$1.32M",
      chain: "eth"
    },
    {
      symbol: "WIF",
      address: "9xQeWvG816bUx9EP8jHmaT23yvVMuFez7R8v2DqQYQwV",
      position: "$1.18M",
      chain: "sol"
    },
    {
      symbol: "BONK",
      address: "5PjDJaGfSPtWJ8p2w9jRr5n3eWg2Yq7mT9z4L6s8VkQx",
      position: "$0.96M",
      chain: "sol"
    },
    {
      symbol: "FLOKI",
      address: "0x2a3f9e7d1b6a3c8f4e1d7a2b9c5d8e6f7a1b2c3d",
      position: "$0.88M",
      chain: "eth"
    },
    {
      symbol: "SHIB",
      address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce",
      position: "$1.44M",
      chain: "eth"
    }
  ];
}
function getExplorerUrl(chain, address) {
  const safe = encodeURIComponent(address || "");
  switch (chain) {
    case "btc":
      return `https://www.blockchain.com/explorer/addresses/btc/${safe}`;
    case "eth":
      return `https://etherscan.io/address/${safe}`;
    case "bsc":
      return `https://bscscan.com/address/${safe}`;
    case "sol":
      return `https://solscan.io/account/${safe}`;
    case "xrp":
      return `https://xrpscan.com/account/${safe}`;
    case "doge":
      return `https://blockchair.com/dogecoin/address/${safe}`;
    default:
      return `https://etherscan.io/address/${safe}`;
  }
}

function overviewTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

async function buildEnhancedWhales() {
  const universe = getWhaleUniverse();

  const rows = await Promise.all(
    universe.map(async (item, index) => {
      try {
        const coin = await getRealCoin(item.symbol.toLowerCase());
        const action =
          coin.signal === "SHORT"
            ? index % 3 === 0
              ? "Close Short"
              : "Open Short"
            : index % 3 === 0
            ? "Close Long"
            : "Open Long";

        return {
          address: item.address,
          symbol: item.symbol,
          action,
          position: item.position,
          price: `$${Number(coin.price || 0).toFixed(2)}`,
          time: overviewTime(),
          chain: item.chain,
          explorerUrl: getExplorerUrl(item.chain, item.address)
        };
      } catch (_) {
        return {
          address: item.address,
          symbol: item.symbol,
          action: index % 2 === 0 ? "Open Long" : "Open Short",
          position: item.position,
          price: "--",
          time: overviewTime(),
          chain: item.chain,
          explorerUrl: getExplorerUrl(item.chain, item.address)
        };
      }
    })
  );

  return rows;
}

app.get("/api/overview", async (req, res) => {
  try {
    const data = await getRealOverview();
    res.json(data);
  } catch (err) {
    console.error("overview fallback:", err.message);
    res.json(loadMockOverviewData());
  }
});

app.get("/api/coin/:symbol", async (req, res) => {
  const coins = loadMockCoinData();
  const symbol = String(req.params.symbol || "").toLowerCase();

  try {
    const data = await getRealCoin(symbol);
    res.json(data);
  } catch (err) {
    console.error(`coin fallback ${symbol}:`, err.message);
    res.json(coins[symbol] || {});
  }
});

app.get("/api/whales", async (req, res) => {
  try {
    const data = await buildEnhancedWhales();
    res.json(data);
  } catch (err) {
    console.error("whales fallback:", err.message);
    res.json(loadMockWhaleData());
  }
});

app.get("/api/debug-version", (req, res) => {
  res.json({
    version: "WEB-PHASE-1-V1",
    model: DEEPSEEK_MODEL || "--",
    deepseekEnabled: Boolean(DEEPSEEK_API_KEY)
  });
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

app.post("/api/chat", async (req, res) => {
  const { question, snapshot } = req.body || {};
  const qRaw = String(question || "").trim();

  let parsed = null;
  try {
    parsed = snapshot ? JSON.parse(snapshot) : null;
  } catch (_) {
    parsed = null;
  }

  let overview = parsed?.overview || null;
  let coins = parsed?.coins || {};
  let whales = parsed?.whales || [];

  if (!overview) {
    try {
      overview = await getRealOverview();
    } catch (_) {
      overview = loadMockOverviewData();
    }
  }

  const mockCoins = loadMockCoinData();

  let btc = coins.btc || null;
  let eth = coins.eth || null;
  let bnb = coins.bnb || null;

  if (!btc) {
    try {
      btc = await getRealCoin("btc");
    } catch (_) {
      btc = mockCoins.btc || {};
    }
  }

  if (!eth) {
    try {
      eth = await getRealCoin("eth");
    } catch (_) {
      eth = mockCoins.eth || {};
    }
  }

  if (!bnb) {
    try {
      bnb = await getRealCoin("bnb");
    } catch (_) {
      bnb = mockCoins.bnb || {};
    }
  }

  if (!Array.isArray(whales) || whales.length === 0) {
    try {
      whales = await buildEnhancedWhales();
    } catch (_) {
      whales = loadMockWhaleData();
    }
  }

  try {
    const reply = await callDeepSeekChat({
      question: qRaw,
      overview,
      btc,
      eth,
      bnb,
      whales
    });

    return res.json({
      ok: true,
      source: "deepseek",
      language: detectReplyLanguage(qRaw),
      reply
    });
  } catch (err) {
    console.error("deepseek fallback:", err.message);

    const reply = buildFallbackReply(qRaw, overview, btc, eth, bnb);

    return res.json({
      ok: true,
      source: "fallback",
      language: detectReplyLanguage(qRaw),
      reply
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Titan AI Hub server running on port ${PORT}`);
});
