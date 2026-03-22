const https = require("https");
const { DEEPSEEK_MODEL } = require("../config/constants.js");
const { detectReplyLanguage, fmt } = require("../utils/helpers.js");

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

async function callDeepSeekChat({ question, overview, btc, eth, bnb, whales, coinFocus, alerts }) {
  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const language = detectReplyLanguage(question);
  const systemPrompt = buildSystemPrompt(language);

  const snapshotText = JSON.stringify(
    {
      overview,
      coins: { btc, eth, bnb },
      coinFocus: Array.isArray(coinFocus) ? coinFocus.slice(0, 8) : [],
      alerts: Array.isArray(alerts) ? alerts.slice(0, 8) : [],
      whales: Array.isArray(whales) ? whales.slice(0, 40) : []
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
    Authorization: `Bearer ${apiKey}`
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned empty content");
  }

  return String(content).trim();
}

module.exports = {
  buildFallbackReply,
  postJson,
  buildSystemPrompt,
  callDeepSeekChat
};
