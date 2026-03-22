const express = require("express");

const {
  loadMockOverviewData,
  loadMockCoinData,
  loadMockWhaleData
} = require("../js/mock-data.js");

const {
  DEFAULT_COIN_LIMIT,
  DEFAULT_WHALE_PAGE_SIZE,
  COIN_UNIVERSE
} = require("../config/constants.js");

const { sanitizeInt, detectReplyLanguage } = require("../utils/helpers.js");
const { getStableOverview } = require("../services/overview-service.js");
const { getStableCoin } = require("../services/coin-service.js");
const {
  buildWhalePackage,
  applyWhaleFilters,
  paginateRows,
  getLegacyWhaleRows
} = require("../services/whale-service.js");
const { buildCoinFocusPackage } = require("../services/coinfocus-service.js");
const { buildAlertPackage } = require("../services/alert-service.js");
const { buildDeepAnalysisPackage } = require("../services/analysis-service.js");
const { buildBinanceCoverageReport } = require("../services/data/data-quality-service.js");
const { callDeepSeekChat, buildFallbackReply } = require("../services/ai-service.js");

const router = express.Router();

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

router.get("/whales", async (req, res) => {
  try {
    const pkg = await buildWhalePackage();

    const wantsPaged =
      req.query.meta === "1" ||
      req.query.paged === "1" ||
      req.query.page ||
      req.query.limit ||
      req.query.symbol ||
      req.query.side ||
      req.query.status ||
      req.query.chain;

    const filteredRows = applyWhaleFilters(pkg.allRows, req.query);

    if (!wantsPaged) {
      return res.json(getLegacyWhaleRows(filteredRows));
    }

    const page = sanitizeInt(req.query.page, 1);
    const limit = sanitizeInt(req.query.limit, DEFAULT_WHALE_PAGE_SIZE);
    const paged = paginateRows(filteredRows, page, limit);

    return res.json({
      items: getLegacyWhaleRows(paged.items),
      pagination: {
        page: paged.page,
        limit: paged.limit,
        total: paged.total,
        totalPages: paged.totalPages,
        hasNextPage: paged.hasNextPage,
        hasPrevPage: paged.hasPrevPage
      },
      filters: {
        symbol: req.query.symbol || "",
        side: req.query.side || "",
        status: req.query.status || "",
        chain: req.query.chain || ""
      }
    });
  } catch (err) {
    console.error("whales route fallback:", err.message);
    return res.json(loadMockWhaleData());
  }
});

router.get("/whales-mixed", async (req, res) => {
  try {
    const pkg = await buildWhalePackage();
    const limit = sanitizeInt(req.query.limit, 20);
    return res.json(getLegacyWhaleRows(pkg.mixedFeed.slice(0, limit)));
  } catch (err) {
    console.error("whales-mixed route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/whales-summary", async (req, res) => {
  try {
    const pkg = await buildWhalePackage();
    return res.json(pkg.summary);
  } catch (err) {
    console.error("whales-summary route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/stablecoin-flows", async (req, res) => {
  try {
    const pkg = await buildWhalePackage();
    return res.json(pkg.stablecoinFlows);
  } catch (err) {
    console.error("stablecoin-flows route fallback:", err.message);
    return res.json([]);
  }
});

router.get("/analysis/deep", async (req, res) => {
  try {
    const data = await buildDeepAnalysisPackage();
    return res.json(data);
  } catch (err) {
    console.error("analysis/deep route fallback:", err.message);
    return res.json({
      overview: null,
      marketState: null,
      stablecoinAnalysis: null,
      whales: {
        summary: [],
        mixedFeed: [],
        stablecoinFlows: []
      },
      coins: []
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

router.get("/debug-version", (req, res) => {
  res.json({
    version: "TITAN-PRO-MODULAR-V3-REALDATA",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    deepseekEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
    coinUniverse: COIN_UNIVERSE.length
  });
});

router.post("/login", (req, res) => {
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

router.post("/chat", async (req, res) => {
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

  if (!Array.isArray(whales) || whales.length === 0) {
    const pkg = await buildWhalePackage();
    whales = pkg.mixedFeed.slice(0, 30);
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
      whales,
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

module.exports = router;
