const { buildLiveSnapshot } = require("./live-snapshot-service.js");
const {
  callDeepSeekTradeDecision,
  buildTradeDecisionFallback,
  mergeTradeDecisionWithAggressive,
  getDemoTradeEnvInfo
} = require("./ai-service.js");
const {
  placeDemoEntryOrder,
  getOpenTestnetPositions,
  closeTestnetPosition
} = require("./binance-testnet-trade-service.js");
const { getHistoryBehaviorStats } = require("./coingecko-history-service.js");
const { runSmcScan } = require("./smc-analysis-service.js");

const state = {
  running: false,
  startedAt: null,
  intervalMs: 300000,
  timer: null,
  lastTickAt: null,
  lastDecision: null,
  lastExecute: null,
  lastError: null,
  ticks: 0,
  decisionLog: [],
  peakPnlPctBySymbol: {}
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
  if (raw === undefined || raw === "") return 0.45;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.45;
}

function defaultIntervalMs() {
  const raw = process.env.DEMO_AUTO_TRADING_INTERVAL_MS;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 60000) return Math.min(n, 3600000);
  return 120000;
}

function topSymbolsFromSnapshot(snapshot, limit = 6) {
  const list = Array.isArray(snapshot?.coinFocus) ? snapshot.coinFocus : [];
  return list
    .slice(0, limit)
    .map((c) => String(c?.futuresSymbol || `${c?.symbol || ""}USDT`).toUpperCase())
    .filter((s) => /^[A-Z0-9]+USDT$/.test(s));
}

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function getAdaptiveExitConfig() {
  return {
    enabled: envBool("DEMO_ADAPTIVE_EXIT_ENABLED", true),
    hardStopLossPct: Math.max(0.2, Math.min(envNum("DEMO_ADAPTIVE_HARD_SL_PCT", 1.2), 15)),
    softStopLossPct: Math.max(0.1, Math.min(envNum("DEMO_ADAPTIVE_SOFT_SL_PCT", 0.6), 10)),
    lockProfitTriggerPct: Math.max(0.1, Math.min(envNum("DEMO_ADAPTIVE_LOCK_TRIGGER_PCT", 0.8), 20)),
    lockProfitRetracePct: Math.max(0.05, Math.min(envNum("DEMO_ADAPTIVE_LOCK_RETRACE_PCT", 0.55), 15))
  };
}

async function buildShortTermContext(snapshot) {
  const symbols = topSymbolsFromSnapshot(snapshot, 6);
  const historyDays = Math.max(60, Math.min(envNum("DEMO_HISTORY_PROFILE_DAYS", 365), 1825));
  const buyExhaustMult = Math.max(0.6, Math.min(envNum("DEMO_SHORT_TERM_BUY_EXHAUST_MULT", 1), 1.8));
  const sellExhaustMult = Math.max(0.6, Math.min(envNum("DEMO_SHORT_TERM_SELL_EXHAUST_MULT", 1), 1.8));
  const out = {};
  await Promise.all(
    symbols.map(async (futSym) => {
      const base = futSym.replace(/USDT$/i, "");
      try {
        const [hist, smc5, smc15] = await Promise.all([
          getHistoryBehaviorStats({ symbol: base, days: historyDays, source: "binance" }),
          runSmcScan({ symbol: futSym, interval: "5m", limit: 360 }).catch(() => null),
          runSmcScan({ symbol: futSym, interval: "15m", limit: 260 }).catch(() => null)
        ]);
        if (!hist?.ok) return;
        const buyExhausted = Number(hist.today?.openHighPct || 0) >= Number(hist.averages?.openHighPct || 0) * buyExhaustMult;
        const sellExhausted = Number(hist.today?.openLowPct || 0) >= Number(hist.averages?.openLowPct || 0) * sellExhaustMult;
        out[futSym] = {
          history: hist,
          shortSmc: {
            m5: smc5?.smc || null,
            m15: smc15?.smc || null,
            liquidityMap5m: smc5?.liquidityMap || null,
            liquidityMap15m: smc15?.liquidityMap || null
          },
          gates: {
            buyExhausted,
            sellExhausted,
            preferShortAfterExhaustedBuy:
              buyExhausted && Number(hist.today?.openClosePct || 0) < Number(hist.averages?.openClosePct || 0),
            preferLongAfterExhaustedSell:
              sellExhausted && Number(hist.today?.openClosePct || 0) > Number(hist.averages?.openClosePct || 0)
          }
        };
      } catch (_) {}
    })
  );
  return out;
}

function applyShortTermGate(decision, shortTermContext) {
  const action = String(decision?.action || "WAIT").toUpperCase();
  const symbol = String(decision?.symbol || "").toUpperCase();
  if (!["OPEN_LONG", "OPEN_SHORT"].includes(action) || !symbol) return decision;
  const ctx = shortTermContext?.[symbol];
  if (!ctx?.gates) return decision;
  if (action === "OPEN_LONG" && ctx.gates.buyExhausted) {
    return {
      ...decision,
      action: "WAIT",
      confidence: Math.min(Number(decision.confidence || 0), 0.45),
      rationale: `${decision.rationale || ""} | blocked: daily open->high already reached historical average threshold`
    };
  }
  if (action === "OPEN_SHORT" && ctx.gates.sellExhausted) {
    return {
      ...decision,
      action: "WAIT",
      confidence: Math.min(Number(decision.confidence || 0), 0.45),
      rationale: `${decision.rationale || ""} | blocked: daily open->low already reached historical average threshold`
    };
  }
  return decision;
}

function pushDecisionLog(entry) {
  state.decisionLog.push(entry);
  if (state.decisionLog.length > 20) {
    state.decisionLog.shift();
  }
}

function summarizeExecute(ex) {
  if (!ex) return "none";
  if (ex.skipped) return `skipped:${ex.reason}`;
  if (ex.ok === true) return "order_sent";
  if (ex.ok === false) return `error:${ex.error}`;
  return "?";
}

function actionToDirection(action) {
  const a = String(action || "").toUpperCase();
  if (a === "OPEN_LONG") return "LONG";
  if (a === "OPEN_SHORT") return "SHORT";
  return "FLAT";
}

function positionDirection(p) {
  const amt = Number(p?.positionAmt || 0);
  if (!Number.isFinite(amt) || Math.abs(amt) < 1e-12) return "FLAT";
  return amt > 0 ? "LONG" : "SHORT";
}

function positionPnlPct(p) {
  const entry = Number(p?.entryPrice || 0);
  const mark = Number(p?.markPrice || 0);
  const amt = Number(p?.positionAmt || 0);
  if (!Number.isFinite(entry) || !Number.isFinite(mark) || !Number.isFinite(amt) || entry <= 0 || Math.abs(amt) < 1e-12) {
    return null;
  }
  if (amt > 0) return ((mark - entry) / entry) * 100;
  return ((entry - mark) / entry) * 100;
}

function marketHighRisk(snapshot, symbol) {
  const focus = Array.isArray(snapshot?.coinFocus) ? snapshot.coinFocus : [];
  const sym = String(symbol || "").toUpperCase();
  const row = focus.find((c) => String(c?.futuresSymbol || "").toUpperCase() === sym);
  const regime = String(snapshot?.overview?.marketBias || row?.marketRegime || "").toLowerCase();
  const flags = Array.isArray(row?.riskFlags) ? row.riskFlags.map((x) => String(x).toLowerCase()) : [];
  const note = `${regime} ${flags.join(" ")}`;
  return /panic|capitulation|extreme fear|liquidation|trap/.test(note);
}

async function applyAdaptiveExit(snapshot) {
  const cfg = getAdaptiveExitConfig();
  if (!cfg.enabled) return [];
  const open = await getOpenTestnetPositions();
  const closed = [];
  for (const p of open) {
    const symbol = String(p?.symbol || "").toUpperCase();
    if (!symbol) continue;
    const pnlPct = positionPnlPct(p);
    if (!Number.isFinite(pnlPct)) continue;
    const peak = Number(state.peakPnlPctBySymbol[symbol]);
    const nextPeak = Number.isFinite(peak) ? Math.max(peak, pnlPct) : pnlPct;
    state.peakPnlPctBySymbol[symbol] = nextPeak;

    let reason = "";
    if (pnlPct <= -cfg.hardStopLossPct) {
      reason = `adaptive_hard_sl_${cfg.hardStopLossPct}`;
    } else if (pnlPct <= -cfg.softStopLossPct && marketHighRisk(snapshot, symbol)) {
      reason = `adaptive_soft_sl_risk_${cfg.softStopLossPct}`;
    } else if (
      nextPeak >= cfg.lockProfitTriggerPct &&
      pnlPct > 0 &&
      pnlPct <= nextPeak - cfg.lockProfitRetracePct
    ) {
      reason = `adaptive_lock_profit_retrace_${cfg.lockProfitRetracePct}`;
    }

    if (!reason) continue;
    const res = await closeTestnetPosition(p, reason);
    closed.push({
      symbol: res.symbol,
      side: res.side,
      qty: res.quantity,
      pnlPct: Number(pnlPct.toFixed(4)),
      reason
    });
    delete state.peakPnlPctBySymbol[symbol];
  }
  return closed;
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
    tickInProgress,
    minConfidence: getMinConfidence(),
    decisionLog: state.decisionLog.slice(-15),
    tradeEnv: getDemoTradeEnvInfo()
  };
}

async function runTick() {
  if (tickInProgress) return;
  tickInProgress = true;
  state.lastError = null;

  let logThisTick = false;

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
    const adaptiveClosed = await applyAdaptiveExit(snapshot);
    const shortTermContext = await buildShortTermContext(snapshot);
    snapshot.shortTermContext = shortTermContext;
    let decision;
    let source = "deepseek";
    try {
      decision = await callDeepSeekTradeDecision(snapshot);
    } catch (e) {
      decision = buildTradeDecisionFallback(snapshot);
      source = "fallback";
    }

    const merged = mergeTradeDecisionWithAggressive(snapshot, decision, source);
    decision = merged.decision;
    source = merged.source;
    decision = applyShortTermGate(decision, shortTermContext);

    state.lastDecision = {
      ts: new Date().toISOString(),
      source,
      decision
    };
    logThisTick = true;

    const action = String(decision.action || "WAIT").toUpperCase();
    const confidence = Number(decision.confidence) || 0;
    const minConf = getMinConfidence();

    if (action === "WAIT") {
      state.lastExecute = {
        ts: new Date().toISOString(),
        skipped: true,
        reason: "WAIT",
        closedAdaptive: adaptiveClosed
      };
      return;
    }

    if (!["OPEN_LONG", "OPEN_SHORT"].includes(action)) {
      state.lastExecute = {
        ts: new Date().toISOString(),
        skipped: true,
        reason: `unsupported action ${action}`,
        closedAdaptive: adaptiveClosed
      };
      return;
    }

    if (confidence < minConf) {
      state.lastExecute = {
        ts: new Date().toISOString(),
        skipped: true,
        reason: `confidence ${confidence.toFixed(2)} < min ${minConf}`,
        decision: { action, symbol: decision.symbol, confidence },
        closedAdaptive: adaptiveClosed
      };
      return;
    }

    const symbol = String(decision.symbol || "BTCUSDT").toUpperCase();
    const usdtNotional = Number(decision.usdtNotional) > 0 ? Number(decision.usdtNotional) : 20;
    const desiredDir = actionToDirection(action);
    const openPos = await getOpenTestnetPositions(symbol);
    const sameDir = openPos.find((p) => positionDirection(p) === desiredDir);
    const opposite = openPos.filter((p) => {
      const dir = positionDirection(p);
      return dir !== "FLAT" && dir !== desiredDir;
    });

    if (sameDir && opposite.length === 0) {
      state.lastExecute = {
        ts: new Date().toISOString(),
        skipped: true,
        reason: `already has ${desiredDir} position on ${symbol}`,
        closedAdaptive: adaptiveClosed
      };
      return;
    }

    const closed = [];
    for (const p of opposite) {
      const res = await closeTestnetPosition(p, "signal_flip");
      closed.push({
        symbol: res.symbol,
        side: res.side,
        qty: res.quantity,
        positionSide: res.positionSide
      });
    }

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
      closedAdaptive: adaptiveClosed,
      closedOpposite: closed,
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
    if (logThisTick && state.lastDecision) {
      pushDecisionLog({
        ts: state.lastTickAt,
        source: state.lastDecision.source,
        action: state.lastDecision.decision?.action,
        symbol: state.lastDecision.decision?.symbol,
        confidence: state.lastDecision.decision?.confidence,
        rationale: String(state.lastDecision.decision?.rationale || "").slice(0, 160),
        result: summarizeExecute(state.lastExecute)
      });
    }
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
