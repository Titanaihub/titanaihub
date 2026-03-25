const { buildLiveSnapshot } = require("./live-snapshot-service.js");
const {
  callDeepSeekTradeDecision,
  buildTradeDecisionFallback
} = require("./ai-service.js");
const { placeDemoEntryOrder } = require("./binance-testnet-trade-service.js");

const state = {
  running: false,
  startedAt: null,
  intervalMs: 300000,
  timer: null,
  lastTickAt: null,
  lastDecision: null,
  lastExecute: null,
  lastError: null,
  ticks: 0
};

let tickInProgress = false;

function envBool(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  return String(v).toLowerCase() === "true";
}

function tradingEnabled() {
  return envBool("BINANCE_TESTNET_TRADING_ENABLED", false);
}

function autoFeatureEnabled() {
  return envBool("DEMO_AUTO_TRADING_ENABLED", true);
}

function getMinConfidence() {
  const raw = process.env.DEMO_AUTO_MIN_CONFIDENCE;
  if (raw === undefined || raw === "") return 0.55;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.55;
}

function defaultIntervalMs() {
  const raw = process.env.DEMO_AUTO_TRADING_INTERVAL_MS;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 60000) return Math.min(n, 3600000);
  return 300000;
}

function getAutoTradingStatus() {
  return {
    running: state.running,
    startedAt: state.startedAt,
    intervalMs: state.intervalMs,
    lastTickAt: state.lastTickAt,
    lastDecision: state.lastDecision,
    lastExecute: state.lastExecute,
    lastError: state.lastError,
    ticks: state.ticks,
    minConfidence: getMinConfidence()
  };
}

async function runTick() {
  if (tickInProgress) return;
  tickInProgress = true;
  state.lastError = null;

  try {
    if (!tradingEnabled()) {
      state.lastError = "BINANCE_TESTNET_TRADING_ENABLED is false";
      state.lastExecute = {
        ts: new Date().toISOString(),
        skipped: true,
        reason: state.lastError
      };
      return;
    }

    const snapshot = await buildLiveSnapshot();
    let decision;
    let source = "deepseek";
    try {
      decision = await callDeepSeekTradeDecision(snapshot);
    } catch (e) {
      decision = buildTradeDecisionFallback(snapshot);
      source = "fallback";
    }

    state.lastDecision = {
      ts: new Date().toISOString(),
      source,
      decision
    };

    const action = String(decision.action || "WAIT").toUpperCase();
    const confidence = Number(decision.confidence) || 0;
    const minConf = getMinConfidence();

    if (action === "WAIT") {
      state.lastExecute = {
        ts: new Date().toISOString(),
        skipped: true,
        reason: "WAIT"
      };
      return;
    }

    if (!["OPEN_LONG", "OPEN_SHORT"].includes(action)) {
      state.lastExecute = {
        ts: new Date().toISOString(),
        skipped: true,
        reason: `unsupported action ${action}`
      };
      return;
    }

    if (confidence < minConf) {
      state.lastExecute = {
        ts: new Date().toISOString(),
        skipped: true,
        reason: `confidence ${confidence.toFixed(2)} < min ${minConf}`,
        decision: { action, symbol: decision.symbol, confidence }
      };
      return;
    }

    const symbol = String(decision.symbol || "BTCUSDT").toUpperCase();
    const usdtNotional = Number(decision.usdtNotional) > 0 ? Number(decision.usdtNotional) : 20;

    const result = await placeDemoEntryOrder({
      symbol,
      action,
      usdtNotional
    });

    state.lastExecute = {
      ts: new Date().toISOString(),
      ok: true,
      symbol,
      action,
      result
    };
  } catch (err) {
    const msg = err?.message || String(err);
    state.lastError = msg;
    state.lastExecute = {
      ts: new Date().toISOString(),
      ok: false,
      error: msg
    };
  } finally {
    state.lastTickAt = new Date().toISOString();
    state.ticks += 1;
    tickInProgress = false;
  }
}

function startAutoTrading(requestedIntervalMs) {
  if (state.running) {
    return { ok: false, message: "Auto trading is already running", status: getAutoTradingStatus() };
  }
  if (!autoFeatureEnabled()) {
    return {
      ok: false,
      message: "Server has DEMO_AUTO_TRADING_ENABLED=false (enable to allow auto mode)"
    };
  }
  if (!tradingEnabled()) {
    return {
      ok: false,
      message: "Set BINANCE_TESTNET_TRADING_ENABLED=true to run auto execution"
    };
  }

  const reqMs = Number(requestedIntervalMs);
  const base = Number.isFinite(reqMs) && reqMs >= 60000 ? reqMs : defaultIntervalMs();
  const interval = Math.max(60000, Math.min(base, 3600000));

  state.running = true;
  state.startedAt = new Date().toISOString();
  state.intervalMs = interval;
  state.lastError = null;

  state.timer = setInterval(() => {
    runTick().catch((e) => console.error("demo auto tick:", e));
  }, interval);

  runTick().catch((e) => console.error("demo auto first tick:", e));

  return { ok: true, status: getAutoTradingStatus() };
}

function stopAutoTrading() {
  if (!state.running) {
    return { ok: false, message: "Auto trading is not running", status: getAutoTradingStatus() };
  }
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.running = false;
  return { ok: true, status: getAutoTradingStatus() };
}

module.exports = {
  startAutoTrading,
  stopAutoTrading,
  getAutoTradingStatus
};
