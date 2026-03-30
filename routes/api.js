const express = require("express");
const crypto = require("crypto");

const {
  loadMockOverviewData,
  loadMockCoinData
} = require("../js/mock-data.js");

const {
  DEFAULT_COIN_LIMIT,
  COIN_UNIVERSE
} = require("../config/constants.js");

const { sanitizeInt, detectReplyLanguage } = require("../utils/helpers.js");
const { getStableOverview } = require("../services/overview-service.js");
const { getStableCoin } = require("../services/coin-service.js");
const { buildCoinFocusPackage } = require("../services/coinfocus-service.js");
const { buildAlertPackage } = require("../services/alert-service.js");
const { buildDeepAnalysisPackage } = require("../services/analysis-service.js");
const { buildBinanceCoverageReport } = require("../services/data/data-quality-service.js");
const { buildRealFlowPackage } = require("../services/real-flow-service.js");
const { getMultiCoinHistory } = require("../services/coingecko-history-service.js");
const { runSmcScan } = require("../services/smc-analysis-service.js");
const { buildMultiSourceAnalysis } = require("../services/multi-source-analysis-service.js");
const {
  callDeepSeekChat,
  buildFallbackReply,
  callDeepSeekTradeDecision,
  buildTradeDecisionFallback,
  mergeTradeDecisionWithAggressive,
  getDemoTradeEnvInfo
} = require("../services/ai-service.js");
const {
  placeDemoEntryOrder,
  getFuturesAccountSnapshot,
  getTestnetOrderMetrics
} = require("../services/binance-testnet-trade-service.js");
const { buildLiveSnapshot } = require("../services/live-snapshot-service.js");
const {
  startAutoTrading,
  stopAutoTrading,
  getAutoTradingStatus
} = require("../services/demo-auto-trading-service.js");
const {
  getGoldMt4Signal,
  saveMt4Execution,
  getMt4ExecutionLog,
  uploadGoldHistory,
  getGoldHistoryStatus,
  getGoldSyncState,
  getGoldHistoryRows,
  runPythonSmc
} = require("../services/mt4-gold-service.js");

const router = express.Router();

// In-memory token store (Render typically runs a single instance).
// For multi-instance deployments, switch to signed JWT or server-side session storage.
const authTokens = new Map(); // token -> { role, expiresAt }
const OWNER_USERNAME = process.env.OWNER_USERNAME || "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "";
const AUTH_TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);

function getBearerToken(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function verifyAuth(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const rec = authTokens.get(token);
  if (!rec) return null;

  if (Date.now() > rec.expiresAt) {
    authTokens.delete(token);
    return null;
  }

  // Sliding session: refresh TTL on each valid request.
  rec.expiresAt = Date.now() + AUTH_TOKEN_TTL_MS;
  authTokens.set(token, rec);

  return rec;
}

function verifyMt4Key(req) {
  const shared = String(process.env.MT4_SHARED_SECRET || "").trim();
  if (!shared) return false;
  const token = String(req.headers["x-mt4-key"] || req.query?.apiKey || "").trim();
  return token === shared;
}

/** Allow Gold Lab / History Data reads without owner login: Bearer owner, X-MT4-Key, or public when MT4_GOLD_PUBLIC_READ=true. */
function allowGoldDashboardRead(req) {
  const auth = verifyAuth(req);
  if (auth && auth.role === "owner") return true;
  if (verifyMt4Key(req)) return true;
  if (String(process.env.MT4_GOLD_PUBLIC_READ || "true").toLowerCase() === "true") return true;
  return false;
}

function issueToken(role) {
  const token = crypto.randomBytes(32).toString("hex");
  authTokens.set(token, {
    role,
    expiresAt: Date.now() + AUTH_TOKEN_TTL_MS
  });
  return token;
}

router.get("/overview", async (req, res) => {
  try {
    const data = await getStableOverview();
    return res.json(data);
  } catch (err) {
    console.error("overview route fallback:", err.message);
    return res.json(loadMockOverviewData());
  }
});

router.get("/coin/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").toLowerCase();

  try {
    if (COIN_UNIVERSE.some((c) => c.key === symbol)) {
      const data = await getStableCoin(symbol);
      return res.json(data);
    }

    return res.status(404).json({ error: "Coin not found" });
  } catch (err) {
    console.error(`coin route fallback ${symbol}:`, err.message);
    const mockCoins = loadMockCoinData();
    return res.json(mockCoins[symbol] || {});
  }
});

router.get("/coin-focus", async (req, res) => {
  try {
    const limit = sanitizeInt(req.query.limit, DEFAULT_COIN_LIMIT);
    const list = await buildCoinFocusPackage();
    return res.json(list.slice(0, Math.min(limit, COIN_UNIVERSE.length)));
  } catch (err) {
    console.error("coin-focus route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/alerts", async (req, res) => {
  try {
    const alerts = await buildAlertPackage();
    return res.json(alerts);
  } catch (err) {
    console.error("alerts route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/analysis/deep", async (req, res) => {
  try {
    const { buildDeepAnalysisPackage } = require("../services/analysis-service.js");
    const payload = await buildDeepAnalysisPackage();
    return res.json(payload);
  } catch (error) {
    console.error("GET /api/analysis/deep failed:", error);

    return res.status(500).json({
      error: true,
      message: error.message || "analysis/deep failed"
    });
  }
});

router.get("/data-quality/binance", async (req, res) => {
  try {
    const report = await buildBinanceCoverageReport();
    return res.json(report);
  } catch (err) {
    console.error("data-quality/binance route fallback:", err.message);
    return res.json({
      summary: {
        total: 0,
        usable: 0,
        full: 0,
        high: 0,
        medium: 0,
        low: 0,
        insufficient: 0
      },
      items: []
    });
  }
});

router.get("/flow-feed", async (req, res) => {
  try {
    const pkg = await buildRealFlowPackage();
    const limit = sanitizeInt(req.query.limit, 20);
    return res.json(pkg.flowFeed.slice(0, limit));
  } catch (err) {
    console.error("flow-feed route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/positioning-summary", async (req, res) => {
  try {
    const pkg = await buildRealFlowPackage();
    return res.json(pkg.positioningSummary);
  } catch (err) {
    console.error("positioning-summary route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/liquidity-summary", async (req, res) => {
  try {
    const pkg = await buildRealFlowPackage();
    return res.json(pkg.liquiditySummary);
  } catch (err) {
    console.error("liquidity-summary route fallback:", err.message);
    return res.json({
      source: "binance-market-internals",
      totalSymbols: 0,
      buyPressureCount: 0,
      sellPressureCount: 0,
      balancedCount: 0,
      longCrowdedCount: 0,
      shortCrowdedCount: 0,
      richPremiumCount: 0,
      discountCount: 0,
      summaryState: "Unavailable"
    });
  }
});

/*
  backward-compatible routes:
  เดิมหน้าเว็บใช้ whales-mixed / whales-summary / stablecoin-flows
  ตอนนี้ map ให้กลายเป็น real flow ทั้งหมด
*/
router.get("/whales-mixed", async (req, res) => {
  try {
    const pkg = await buildRealFlowPackage();
    const limit = sanitizeInt(req.query.limit, 20);
    return res.json(pkg.flowFeed.slice(0, limit));
  } catch (err) {
    console.error("whales-mixed compatibility route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/whales-summary", async (req, res) => {
  try {
    const pkg = await buildRealFlowPackage();
    return res.json(pkg.positioningSummary);
  } catch (err) {
    console.error("whales-summary compatibility route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/stablecoin-flows", async (req, res) => {
  try {
    const pkg = await buildRealFlowPackage();
    return res.json(pkg.liquiditySummary);
  } catch (err) {
    console.error("stablecoin-flows compatibility route fallback:", err.message);
    return res.json({
      source: "binance-market-internals",
      totalSymbols: 0,
      buyPressureCount: 0,
      sellPressureCount: 0,
      balancedCount: 0,
      longCrowdedCount: 0,
      shortCrowdedCount: 0,
      richPremiumCount: 0,
      discountCount: 0,
      summaryState: "Unavailable"
    });
  }
});

router.get("/debug-version", (req, res) => {
  res.json({
    version: "TITAN-PRO-REALFLOW-V1",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    deepseekEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
    coinUniverse: COIN_UNIVERSE.length
  });
});

router.get("/market-history", async (req, res) => {
  try {
    const source = String(req.query.source || "coingecko").toLowerCase();
    const symbolsRaw = String(req.query.symbols || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const days = sanitizeInt(req.query.days, 30);
    const perCoin = sanitizeInt(req.query.perCoin, 30);

    const data = await getMultiCoinHistory({
      source,
      symbols: symbolsRaw,
      days: Math.max(1, Math.min(days, 1825)),
      limitPerCoin: Math.max(1, Math.min(perCoin, 2500))
    });
    return res.json(data);
  } catch (err) {
    console.error("market-history route fallback:", err.message);
    return res.json({
      ok: false,
      source: "coingecko",
      symbols: [],
      days: 30,
      rows: [],
      errors: [{ symbol: "*", message: err.message || "Failed to load market history" }]
    });
  }
});

router.get("/smc/scan", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
    const interval = String(req.query.interval || "15m");
    const limit = sanitizeInt(req.query.limit, 220);

    const data = await runSmcScan({
      symbol,
      interval,
      limit: Math.max(60, Math.min(limit, 220000))
    });
    return res.json(data);
  } catch (err) {
    console.error("smc scan failed:", err.message);
    return res.status(500).json({
      ok: false,
      message: err.message || "SMC scan failed",
      source: "binance-futures"
    });
  }
});

router.get("/multi-source/analysis", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
    const interval = String(req.query.interval || "15m");
    const limit = sanitizeInt(req.query.limit, 500);
    const data = await buildMultiSourceAnalysis({
      symbol,
      interval,
      limit: Math.max(120, Math.min(limit, 1000))
    });
    return res.json(data);
  } catch (err) {
    console.error("multi-source analysis failed:", err.message);
    return res.status(500).json({
      ok: false,
      message: err.message || "multi-source analysis failed"
    });
  }
});

router.get("/multi-source/order-metrics", async (req, res) => {
  const auth = verifyAuth(req);
  if (!auth || auth.role !== "owner") {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: owner login required"
    });
  }
  try {
    const symbol = String(req.query.symbol || "").toUpperCase() || undefined;
    const data = await getTestnetOrderMetrics(symbol);
    return res.json(data);
  } catch (err) {
    console.error("multi-source order-metrics failed:", err.message);
    return res.status(500).json({
      ok: false,
      message: err.message || "order metrics failed"
    });
  }
});

router.get("/auth/session", (req, res) => {
  const auth = verifyAuth(req);
  if (!auth) {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized"
    });
  }
  return res.json({
    ok: true,
    role: auth.role
  });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  const u = String(username || "");
  const p = String(password || "");

  if (!OWNER_USERNAME || !OWNER_PASSWORD) {
    return res.status(500).json({
      ok: false,
      success: false,
      message: "Owner credentials not configured on server"
    });
  }

  if (u === OWNER_USERNAME && p === OWNER_PASSWORD) {
    const token = issueToken("owner");

    return res.json({
      ok: true,
      success: true,
      role: "owner",
      token,
      message: "Login successful"
    });
  }

  return res.status(401).json({
    ok: false,
    success: false,
    message: "Invalid username or password"
  });
});

router.post("/chat", async (req, res) => {
  const { question, snapshot } = req.body || {};
  const qRaw = String(question || "").trim();

  const auth = verifyAuth(req);
  if (!auth || auth.role !== "owner") {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: owner login required"
    });
  }

  let parsed = null;
  try {
    parsed = snapshot ? JSON.parse(snapshot) : null;
  } catch (_) {
    parsed = null;
  }

  let overview = parsed?.overview || null;
  let coins = parsed?.coins || {};
  let flows = parsed?.whales || [];
  let coinFocus = parsed?.coinFocus || [];
  let alerts = parsed?.alerts || [];

  if (!overview) {
    overview = await getStableOverview();
  }

  let btc = coins.btc || null;
  let eth = coins.eth || null;
  let bnb = coins.bnb || null;

  if (!btc) btc = await getStableCoin("btc");
  if (!eth) eth = await getStableCoin("eth");
  if (!bnb) bnb = await getStableCoin("bnb");

  if (!Array.isArray(flows) || flows.length === 0) {
    const pkg = await buildRealFlowPackage();
    flows = pkg.flowFeed.slice(0, 20);
  }

  if (!Array.isArray(coinFocus) || coinFocus.length === 0) {
    coinFocus = await buildCoinFocusPackage();
  }

  if (!Array.isArray(alerts) || alerts.length === 0) {
    alerts = await buildAlertPackage();
  }

  try {
    const reply = await callDeepSeekChat({
      question: qRaw,
      overview,
      btc,
      eth,
      bnb,
      whales: flows,
      coinFocus,
      alerts
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

router.post("/demo/decision", async (req, res) => {
  const auth = verifyAuth(req);
  if (!auth || auth.role !== "owner") {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: owner login required"
    });
  }

  try {
    const snapshot = await buildLiveSnapshot();
    try {
      let decision = await callDeepSeekTradeDecision(snapshot);
      let source = "deepseek";
      const merged = mergeTradeDecisionWithAggressive(snapshot, decision, source);
      decision = merged.decision;
      source = merged.source;
      return res.json({
        ok: true,
        source,
        mode: "demo",
        snapshotTs: new Date().toISOString(),
        decision,
        tradeEnv: getDemoTradeEnvInfo()
      });
    } catch (err) {
      console.error("demo decision deepseek fallback:", err.message);
      let decision = buildTradeDecisionFallback(snapshot);
      let source = "fallback";
      const merged = mergeTradeDecisionWithAggressive(snapshot, decision, source);
      decision = merged.decision;
      source = merged.source;
      return res.json({
        ok: true,
        source,
        mode: "demo",
        snapshotTs: new Date().toISOString(),
        decision,
        tradeEnv: getDemoTradeEnvInfo()
      });
    }
  } catch (err) {
    console.error("POST /api/demo/decision failed:", err.message);
    return res.status(500).json({
      ok: false,
      error: true,
      message: err.message || "Failed to build demo decision"
    });
  }
});

router.post("/demo/execute-testnet", async (req, res) => {
  const auth = verifyAuth(req);
  if (!auth || auth.role !== "owner") {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: owner login required"
    });
  }

  const enabled = String(process.env.BINANCE_TESTNET_TRADING_ENABLED || "false").toLowerCase() === "true";
  if (!enabled) {
    return res.status(400).json({
      ok: false,
      error: true,
      message: "Testnet trading is disabled. Set BINANCE_TESTNET_TRADING_ENABLED=true"
    });
  }

  const decision = req.body?.decision || {};
  const action = String(decision.action || "WAIT").toUpperCase();
  const symbol = String(decision.symbol || "BTCUSDT").toUpperCase();
  const usdtNotional = Number(
    req.body?.usdtNotional || decision.usdtNotional || process.env.DEMO_DEFAULT_USDT_NOTIONAL || 20
  );

  if (action === "WAIT") {
    return res.json({
      ok: true,
      mode: "demo",
      skipped: true,
      message: "Decision is WAIT, no order sent"
    });
  }

  if (!["OPEN_LONG", "OPEN_SHORT"].includes(action)) {
    return res.status(400).json({
      ok: false,
      error: true,
      message: "Invalid action. Must be WAIT, OPEN_LONG, or OPEN_SHORT"
    });
  }

  if (!Number.isFinite(usdtNotional) || usdtNotional <= 0) {
    return res.status(400).json({
      ok: false,
      error: true,
      message: "Invalid usdtNotional"
    });
  }

  try {
    const result = await placeDemoEntryOrder({
      symbol,
      action,
      usdtNotional
    });

    return res.json({
      ok: true,
      mode: "demo",
      exchange: "binance-futures-testnet",
      result
    });
  } catch (err) {
    console.error("POST /api/demo/execute-testnet failed:", err.message);
    return res.status(500).json({
      ok: false,
      error: true,
      message: err.message || "Failed to execute testnet order"
    });
  }
});

router.get("/demo/account", async (req, res) => {
  const auth = verifyAuth(req);
  if (!auth || auth.role !== "owner") {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: owner login required"
    });
  }

  const hasKeys = Boolean(process.env.BINANCE_TESTNET_API_KEY && process.env.BINANCE_TESTNET_API_SECRET);
  if (!hasKeys) {
    return res.json({
      ok: false,
      needsKeys: true,
      tradingEnabled: false,
      message: "Configure BINANCE_TESTNET_API_KEY and BINANCE_TESTNET_API_SECRET on the server."
    });
  }

  const tradingEnabled =
    String(process.env.BINANCE_TESTNET_TRADING_ENABLED || "false").toLowerCase() === "true";

  try {
    const snapshot = await getFuturesAccountSnapshot();
    return res.json({
      ok: Boolean(snapshot.ok),
      tradingEnabled,
      snapshot,
      message: snapshot.ok ? undefined : snapshot.message
    });
  } catch (err) {
    console.error("GET /api/demo/account failed:", err.message);
    return res.status(500).json({
      ok: false,
      tradingEnabled,
      message: err.message || "Failed to load testnet account"
    });
  }
});

router.get("/demo/auto-trading/status", (req, res) => {
  const auth = verifyAuth(req);
  if (!auth || auth.role !== "owner") {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: owner login required"
    });
  }

  const tradingEnabled =
    String(process.env.BINANCE_TESTNET_TRADING_ENABLED || "false").toLowerCase() === "true";
  const autoFeatureEnabled =
    String(process.env.DEMO_AUTO_TRADING_ENABLED || "true").toLowerCase() === "true";

  return res.json({
    ok: true,
    tradingEnabled,
    autoFeatureEnabled,
    ...getAutoTradingStatus()
  });
});

router.post("/demo/auto-trading/start", (req, res) => {
  const auth = verifyAuth(req);
  if (!auth || auth.role !== "owner") {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: owner login required"
    });
  }

  const intervalMs = req.body?.intervalMs;
  const r = startAutoTrading(intervalMs);
  if (!r.ok) {
    return res.status(400).json({
      ok: false,
      message: r.message,
      status: r.status || null
    });
  }
  return res.json({
    ok: true,
    ...r.status
  });
});

router.post("/demo/auto-trading/stop", (req, res) => {
  const auth = verifyAuth(req);
  if (!auth || auth.role !== "owner") {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: owner login required"
    });
  }

  const r = stopAutoTrading();
  if (!r.ok) {
    return res.status(400).json({
      ok: false,
      message: r.message,
      status: r.status || null
    });
  }
  return res.json({
    ok: true,
    ...r.status
  });
});

/** Flatten decision.* to top level so MT4 EA (simple string parse) always reads action/sl/tp. */
function flattenMt4GoldSignalResponse(out) {
  if (!out || out.ok === false) return out;
  const d = out.decision;
  if (!d || typeof d !== "object") return out;
  return {
    ...out,
    action: d.action != null ? d.action : "WAIT",
    sl: d.sl,
    tp: d.tp,
    reason: d.reason != null ? String(d.reason) : "",
    confidence: d.confidence,
    riskPercent: d.riskPercent
  };
}

router.post("/mt4/gold/signal", async (req, res) => {
  const shared = String(process.env.MT4_SHARED_SECRET || "").trim();
  if (shared) {
    const token = String(req.headers["x-mt4-key"] || req.body?.apiKey || "");
    if (token !== shared) {
      return res.status(401).json({ ok: false, message: "Unauthorized MT4 key" });
    }
  }
  try {
    const out = await getGoldMt4Signal(req.body || {});
    if (!out.ok) {
      return res.status(out.code || 400).json(out);
    }
    return res.json(flattenMt4GoldSignalResponse(out));
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "mt4 signal failed" });
  }
});

router.post("/mt4/gold/history-upload", async (req, res) => {
  const shared = String(process.env.MT4_SHARED_SECRET || "").trim();
  if (shared) {
    const token = String(req.headers["x-mt4-key"] || req.body?.apiKey || "");
    if (token !== shared) {
      return res.status(401).json({ ok: false, message: "Unauthorized MT4 key" });
    }
  }
  try {
    const out = await uploadGoldHistory(req.body || {});
    if (!out.ok) return res.status(out.code || 400).json(out);
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "mt4 history upload failed" });
  }
});

router.post("/mt4/gold/execution", (req, res) => {
  const shared = String(process.env.MT4_SHARED_SECRET || "").trim();
  if (shared) {
    const token = String(req.headers["x-mt4-key"] || req.body?.apiKey || "");
    if (token !== shared) {
      return res.status(401).json({ ok: false, message: "Unauthorized MT4 key" });
    }
  }
  try {
    const r = saveMt4Execution(req.body || {});
    return res.json(r);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "mt4 execution save failed" });
  }
});

router.get("/mt4/gold/execution-log", (req, res) => {
  if (!allowGoldDashboardRead(req)) {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: set MT4_GOLD_PUBLIC_READ=true, use X-MT4-Key, or owner login"
    });
  }
  const limit = sanitizeInt(req.query.limit, 30);
  return res.json({
    ok: true,
    rows: getMt4ExecutionLog(limit)
  });
});

router.get("/mt4/gold/history-status", async (req, res) => {
  if (!allowGoldDashboardRead(req)) {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: set MT4_GOLD_PUBLIC_READ=true, use X-MT4-Key, or owner login"
    });
  }
  const accountId = String(req.query.accountId || "default");
  const symbol = String(req.query.symbol || "XAUUSD").toUpperCase();
  const out = await getGoldHistoryStatus(accountId, symbol);
  return res.json({
    ok: true,
    rows: out.rows || [],
    bootstrap: out.bootstrap || null,
    globalHistoryMode: Boolean(out.globalHistoryMode),
    sync: out.sync || null
  });
});

router.get("/mt4/gold/sync-state", async (req, res) => {
  const shared = String(process.env.MT4_SHARED_SECRET || "").trim();
  if (shared) {
    const token = String(req.headers["x-mt4-key"] || req.query?.apiKey || "");
    if (token !== shared) {
      return res.status(401).json({ ok: false, message: "Unauthorized MT4 key" });
    }
  }
  const symbol = String(req.query.symbol || "XAUUSD").toUpperCase();
  const timeframe = String(req.query.timeframe || "D1").toUpperCase();
  const accountId = String(req.query.accountId || "default");
  const out = await getGoldSyncState(symbol, timeframe, accountId);
  return res.json({
    ok: true,
    symbol,
    timeframe,
    ...out
  });
});

router.get("/mt4/gold/history-rows", async (req, res) => {
  if (!allowGoldDashboardRead(req)) {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: set MT4_GOLD_PUBLIC_READ=true, use X-MT4-Key, or owner login"
    });
  }
  const accountId = String(req.query.accountId || "default");
  const symbol = String(req.query.symbol || "XAUUSD").toUpperCase();
  const timeframe = String(req.query.timeframe || "M5").toUpperCase();
  const limit = Math.max(20, Math.min(sanitizeInt(req.query.limit, 2000), 10000));
  const out = await getGoldHistoryRows(accountId, symbol, timeframe, limit);
  return res.json({
    ok: true,
    ...out
  });
});

router.post("/mt4/gold/python-smc-test", async (req, res) => {
  if (!allowGoldDashboardRead(req)) {
    return res.status(401).json({
      ok: false,
      error: true,
      message: "Unauthorized: set MT4_GOLD_PUBLIC_READ=true, use X-MT4-Key, or owner login"
    });
  }
  try {
    const candles = Array.isArray(req.body?.candles) ? req.body.candles : [];
    const out = await runPythonSmc(candles);
    return res.json({
      ok: true,
      pythonSmc: out
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "python smc test failed"
    });
  }
});

module.exports = router;
