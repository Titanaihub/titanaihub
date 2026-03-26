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
      "คุณคือผู้ช่วยของ Titan AI Hub — ตอบเป็นภาษาไทยเป็นหลัก (ชื่อเหรียญ / LONG / SHORT / SL / TP ใช้ได้)",
      "กฎสำคัญ: อ่านคำถามให้ตรงก่อน แล้วตอบให้ตรงประเด็นนั้น — ห้ามตอบแบบเทมเพลตซ้ำ ๆ หรือสรุปภาพตลาดเต็มชุดทุกครั้ง",
      "ถ้าผู้ใช้ถามเชิงสนทนา เช่น คุณเทรดยังไง ตั้งกำไรขาดทุนยังไง ทำไมมีแต่ขาดทุน ระบบทำงานยังไง — ให้อธิบายกลไก ข้อจำกัด และคำแนะนำอย่างเป็นธรรมชาติ ไม่ต้องรายงานดัชนีตลาดทั้งหมด",
      "บริบทผลิตภัณฑ์ (พูดได้เมื่อเกี่ยวข้อง): แดชบอร์ดนี้แสดงระดับ entry/SL/TP จากการวิเคราะห์เป็นค่าแนะนำ; โหมดเทรดทดลองบน Binance Testnet มักส่งคำสั่งมาร์เก็ตตามสัญญาณ AI — ไม่ได้แปลว่าระบบจะวาง SL/TP เป็นคำสั่งอัตโนมัติในทุกเคสเหมือน EA บางตัว",
      "ถ้าผู้ใช้ขอ 'วิเคราะห์ตลาด' 'ดู BTC' 'สรุปเหรียญ' ค่อยใช้ snapshot ช่วยสรุปมุมมอง ความเสี่ยง และระดับอ้างอิงอย่างเป็นระบบ",
      "ใช้เฉพาะตัวเลขและข้อเท็จจริงจาก snapshot ที่ให้มา ห้ามแต่งตัวเลขใหม่",
      "ถ้าข้อมูลไม่พอ ให้บอกตรง ๆ",
      "โทน: สนทนา ชัดเจน ยืดหยุ่น — ไม่บังคับหัวข้อ 1) 2) 3) ทุกครั้ง"
    ].join("\n");
  }

  return [
    "You are Titan AI Hub assistant. Reply in English when the user writes in English.",
    "Read the user's question literally first. Answer that question directly — do not default to the same market-report template every time.",
    "If they ask how you trade, how SL/TP work, why they see losses, or how the system behaves — explain mechanics, limits, and practical guidance in plain language. Do not dump a full market overview unless they asked for market analysis.",
    "Product context (when relevant): dashboard levels are analysis suggestions; Testnet demo trading often uses market entries from the AI signal — this is not the same as an EA that always auto-places full SL/TP chains on the exchange.",
    "When the user asks for market analysis or a specific coin, use the snapshot and structure bias / risk / reference levels as appropriate.",
    "Use only numbers from the provided snapshot. Do not invent figures.",
    "Tone: conversational and clear; numbered sections are optional, not mandatory."
  ].join("\n");
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;

  try {
    return JSON.parse(candidate);
  } catch (_) {
    // Attempt to parse first object-like block.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

function pickBestCoinFocusItem(coinFocus) {
  const list = Array.isArray(coinFocus) ? [...coinFocus] : [];
  if (!list.length) return null;
  list.sort((a, b) => Number(b.confidenceScore || 0) - Number(a.confidenceScore || 0));
  for (const c of list) {
    const sig = String(c.signal || "").toUpperCase();
    if (
      sig.includes("LONG") ||
      sig.includes("SHORT") ||
      sig.includes("BUY") ||
      sig.includes("SELL")
    ) {
      return c;
    }
  }
  return list[0];
}

function buildTradeDecisionFallback(snapshot = {}) {
  if (!tradeEnvBool("DEMO_RULE_FALLBACK_ON_DEEPSEEK_ERROR", false)) {
    return {
      action: "WAIT",
      symbol: "BTCUSDT",
      confidence: 0,
      rationale:
        "DeepSeek call failed or API key missing — standing aside (no EA-style rule fallback). Set DEMO_RULE_FALLBACK_ON_DEEPSEEK_ERROR=true only if you want legacy score/signal rules.",
      entry: null,
      sl: null,
      tp: null,
      usdtNotional: 20
    };
  }

  const coinFocus = Array.isArray(snapshot.coinFocus) ? snapshot.coinFocus : [];
  const best = pickBestCoinFocusItem(coinFocus);
  if (!best) {
    return {
      action: "WAIT",
      symbol: "BTCUSDT",
      confidence: 0.3,
      rationale: "No coinFocus data available",
      entry: null,
      sl: null,
      tp: null,
      usdtNotional: 20
    };
  }

  const signal = String(best.signal || "").toUpperCase();
  let action = "WAIT";
  if (signal.includes("LONG") || signal.includes("BUY")) action = "OPEN_LONG";
  if (signal.includes("SHORT") || signal.includes("SELL")) action = "OPEN_SHORT";

  return {
    action,
    symbol: String(best.futuresSymbol || `${best.symbol || "BTC"}USDT`).toUpperCase(),
    confidence: Number.isFinite(Number(best.decisionScore))
      ? Math.max(0, Math.min(1, Number(best.decisionScore) / 100))
      : 0.5,
    rationale: `Legacy rule fallback: coinFocus signal=${best.signal || "--"} bias=${best.bias || "--"}`,
    entry: best.entry ?? null,
    sl: best.sl ?? null,
    tp: best.tp ?? null,
    usdtNotional: 20
  };
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
      ? `คำถามผู้ใช้ (ตอบให้ตรงประเด็นนี้ก่อน):
${question}

ข้อมูลตลาด (ใช้เมื่อคำถามเกี่ยวกับภาพตลาดหรือเหรียญ — ไม่ต้องยกมาทั้งหมดถ้าคำถามเป็นเรื่องกลไก/วิธีใช้):
${snapshotText}

ตอบเป็นภาษาไทย แบบสนทนา`
      : `User question (answer this directly first):
${question}

Market snapshot (use when the question is about markets or specific assets — omit heavy detail if the question is about how the product works):
${snapshotText}

Reply in English, conversational tone.`;

  const chatTempRaw = Number(process.env.CHAT_TEMPERATURE);
  const temperature =
    Number.isFinite(chatTempRaw) && chatTempRaw >= 0 && chatTempRaw <= 1.2 ? chatTempRaw : 0.62;

  const payload = {
    model: DEEPSEEK_MODEL,
    stream: false,
    temperature,
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

async function callDeepSeekTradeDecision(snapshot = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const relaxed = tradeEnvBool("DEMO_RELAXED_AI_PROMPT", false);
  const tempRaw = Number(process.env.DEMO_TRADE_AI_TEMPERATURE);
  const temperature =
    Number.isFinite(tempRaw) && tempRaw >= 0 && tempRaw <= 1.2 ? tempRaw : 0.42;

  const systemPrompt = [
    "You are a discretionary crypto futures assistant for Binance USDT-M TESTNET only (not real money).",
    "Primary mode is short-term trading (scalp/intraday). Prefer setups that complete within short windows and avoid late chasing after a daily directional move is already extended.",
    "You must reason like a trader: weigh conflicting signals, regime, and risk — do NOT mimic a fixed rule engine (e.g. do not open a trade only because finalSetupScore is highest).",
    "Respond with JSON only (no markdown, no code fences).",
    "Use only fields present in the snapshot. Do not invent prices, news, or facts.",
    "Allowed actions: WAIT, OPEN_LONG, OPEN_SHORT.",
    "Scan the full coinFocus list; compare symbols holistically. Choose at most one symbol to trade, or WAIT.",
    "Symbols must be valid USDT-M perpetual form (e.g. BTCUSDT).",
    "Prefer WAIT when: setups disagree, evidence is weak, volatility/whale/alerts suggest elevated risk, or edge is unclear.",
    "Use OPEN_LONG or OPEN_SHORT only when your rationale explicitly states why expected edge outweighs risk for that symbol.",
    "Use shortTermContext when available: daily average move profiles (open->high/open->low etc.), M5/M15 SMC, and liquidity maps (BSL/SSL sweep zones). If buyExhausted is true, avoid OPEN_LONG unless very strong contrary evidence. If sellExhausted is true, avoid OPEN_SHORT unless very strong contrary evidence.",
    "In liquidity maps, consider likelySweep: highs_first/lows_first. Avoid entering directly into an opposite nearby sweep zone unless your rationale explains why the sweep risk is acceptable.",
    "confidence is your subjective probability the chosen action is appropriate given the snapshot (0–1).",
    relaxed
      ? "Optional testnet bias: if one coin clearly leads by score AND bias/signal align without strong contradictions, you may lean toward a directional action — still explain why in rationale."
      : ""
  ]
    .filter(Boolean)
    .join("\n");

  const payloadSnapshot = {
    overview: snapshot.overview || null,
    coinFocus: Array.isArray(snapshot.coinFocus) ? snapshot.coinFocus.slice(0, 20) : [],
    whales: Array.isArray(snapshot.whales) ? snapshot.whales.slice(0, 25) : [],
    alerts: Array.isArray(snapshot.alerts) ? snapshot.alerts.slice(0, 12) : [],
    shortTermContext: snapshot.shortTermContext || null
  };

  const userPrompt = [
    "Decide whether to trade one contract or WAIT.",
    "In rationale, give 2–4 sentences: key evidence, main risk, why WAIT vs directional.",
    "Return this JSON schema exactly:",
    "{",
    '  "action": "WAIT | OPEN_LONG | OPEN_SHORT",',
    '  "symbol": "e.g. BTCUSDT",',
    '  "confidence": 0.0,',
    '  "rationale": "your reasoning",',
    '  "entry": 0,',
    '  "sl": 0,',
    '  "tp": 0,',
    '  "usdtNotional": 20',
    "}",
    "",
    `Snapshot: ${JSON.stringify(payloadSnapshot)}`
  ].join("\n");

  const payload = {
    model: DEEPSEEK_MODEL,
    stream: false,
    temperature,
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
    throw new Error("DeepSeek returned empty trade decision");
  }

  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("DeepSeek trade decision is not valid JSON");
  }

  const action = String(parsed.action || "WAIT").toUpperCase();
  const symbol = String(parsed.symbol || "BTCUSDT").toUpperCase();
  const confidenceNum = Number(parsed.confidence);

  return {
    action: ["WAIT", "OPEN_LONG", "OPEN_SHORT"].includes(action) ? action : "WAIT",
    symbol,
    confidence: Number.isFinite(confidenceNum) ? Math.max(0, Math.min(1, confidenceNum)) : 0,
    rationale: String(parsed.rationale || "").slice(0, 900),
    entry: Number(parsed.entry) || null,
    sl: Number(parsed.sl) || null,
    tp: Number(parsed.tp) || null,
    usdtNotional: Number(parsed.usdtNotional) > 0 ? Number(parsed.usdtNotional) : 20,
    raw: String(content).slice(0, 2000)
  };
}

function tradeEnvBool(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  return String(v).toLowerCase() === "true";
}

function tradeEnvNum(name, defaultValue) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : defaultValue;
}

/**
 * Optional EA-style overlay: when AI returns WAIT, derive OPEN_LONG/SHORT from scores/signals.
 * Off by default — set DEMO_AGGRESSIVE_ON_WAIT=true to enable (testnet only).
 */
function buildAggressiveTestnetDecision(snapshot = {}) {
  if (!tradeEnvBool("DEMO_AGGRESSIVE_ON_WAIT", false)) return null;

  const minScore = tradeEnvNum("DEMO_AGGRESSIVE_MIN_SETUP_SCORE", 48);
  const coinFocus = Array.isArray(snapshot.coinFocus) ? [...snapshot.coinFocus] : [];
  if (!coinFocus.length) return null;

  coinFocus.sort((a, b) => Number(b.finalSetupScore || 0) - Number(a.finalSetupScore || 0));

  for (const c of coinFocus) {
    const fs = Number(c.finalSetupScore || 0);
    if (fs < minScore) continue;

    const sig = String(c.signal || "").toUpperCase();
    let action = "WAIT";
    if (sig.includes("LONG") || sig.includes("BUY")) action = "OPEN_LONG";
    else if (sig.includes("SHORT") || sig.includes("SELL")) action = "OPEN_SHORT";

    if (action === "WAIT") {
      const bias = String(c.bias || "").toUpperCase();
      const dir = String(c.setupDirection || "").toUpperCase();
      if (bias.includes("BULL") || bias.includes("LONG") || dir.includes("LONG")) action = "OPEN_LONG";
      else if (bias.includes("BEAR") || bias.includes("SHORT") || dir.includes("SHORT")) {
        action = "OPEN_SHORT";
      }
    }

    if (action === "WAIT") continue;

    const symbol = String(c.futuresSymbol || `${c.symbol || "BTC"}USDT`).toUpperCase();
    const conf = Math.max(0.56, Math.min(0.82, fs / 100));

    return {
      action,
      symbol,
      confidence: conf,
      rationale: `Aggressive testnet rule: ${c.symbol} finalSetupScore=${Math.round(fs)} signal=${c.signal} bias=${c.bias} (used because AI chose WAIT)`,
      entry: c.entry ?? null,
      sl: c.sl ?? null,
      tp: c.tp ?? null,
      usdtNotional: 20
    };
  }

  return null;
}

function mergeTradeDecisionWithAggressive(snapshot, decision, source) {
  const a = String(decision.action || "").toUpperCase();
  if (a !== "WAIT") {
    return { decision, source };
  }
  const agg = buildAggressiveTestnetDecision(snapshot);
  if (!agg || String(agg.action || "").toUpperCase() === "WAIT") {
    return { decision, source };
  }
  return {
    decision: agg,
    source: `${source}+aggressive_rules`
  };
}

function getDemoTradeEnvInfo() {
  return {
    aggressiveOnWait: tradeEnvBool("DEMO_AGGRESSIVE_ON_WAIT", false),
    aggressiveMinSetupScore: tradeEnvNum("DEMO_AGGRESSIVE_MIN_SETUP_SCORE", 48),
    relaxedAiPrompt: tradeEnvBool("DEMO_RELAXED_AI_PROMPT", false),
    ruleFallbackOnDeepSeekError: tradeEnvBool("DEMO_RULE_FALLBACK_ON_DEEPSEEK_ERROR", false),
    tradeAiTemperature:
      Number.isFinite(Number(process.env.DEMO_TRADE_AI_TEMPERATURE)) &&
      Number(process.env.DEMO_TRADE_AI_TEMPERATURE) >= 0
        ? Number(process.env.DEMO_TRADE_AI_TEMPERATURE)
        : 0.42,
    historyProfileDays: Number.isFinite(Number(process.env.DEMO_HISTORY_PROFILE_DAYS))
      ? Number(process.env.DEMO_HISTORY_PROFILE_DAYS)
      : 365,
    shortTermBuyExhaustMult: Number.isFinite(Number(process.env.DEMO_SHORT_TERM_BUY_EXHAUST_MULT))
      ? Number(process.env.DEMO_SHORT_TERM_BUY_EXHAUST_MULT)
      : 1,
    shortTermSellExhaustMult: Number.isFinite(Number(process.env.DEMO_SHORT_TERM_SELL_EXHAUST_MULT))
      ? Number(process.env.DEMO_SHORT_TERM_SELL_EXHAUST_MULT)
      : 1,
    adaptiveExitEnabled: tradeEnvBool("DEMO_ADAPTIVE_EXIT_ENABLED", true),
    adaptiveHardSlPct: Number.isFinite(Number(process.env.DEMO_ADAPTIVE_HARD_SL_PCT))
      ? Number(process.env.DEMO_ADAPTIVE_HARD_SL_PCT)
      : 1.2,
    adaptiveSoftSlPct: Number.isFinite(Number(process.env.DEMO_ADAPTIVE_SOFT_SL_PCT))
      ? Number(process.env.DEMO_ADAPTIVE_SOFT_SL_PCT)
      : 0.6,
    adaptiveLockTriggerPct: Number.isFinite(Number(process.env.DEMO_ADAPTIVE_LOCK_TRIGGER_PCT))
      ? Number(process.env.DEMO_ADAPTIVE_LOCK_TRIGGER_PCT)
      : 0.8,
    adaptiveLockRetracePct: Number.isFinite(Number(process.env.DEMO_ADAPTIVE_LOCK_RETRACE_PCT))
      ? Number(process.env.DEMO_ADAPTIVE_LOCK_RETRACE_PCT)
      : 0.55
  };
}

module.exports = {
  buildFallbackReply,
  buildTradeDecisionFallback,
  buildAggressiveTestnetDecision,
  mergeTradeDecisionWithAggressive,
  getDemoTradeEnvInfo,
  postJson,
  buildSystemPrompt,
  callDeepSeekChat,
  callDeepSeekTradeDecision
};
