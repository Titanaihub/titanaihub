const { postJson } = require("./ai-service.js");
const { DEEPSEEK_MODEL } = require("../config/constants.js");
const { spawn } = require("child_process");
const path = require("path");

const cache = {
  byKey: new Map(),
  executionLog: [],
  historyByKey: new Map(),
  bootstrapByAccountSymbol: new Map()
};

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function envStr(name, fallback = "") {
  const v = process.env[name];
  return v == null ? fallback : String(v);
}

function normalizeAction(action) {
  const a = String(action || "WAIT").toUpperCase();
  if (a === "OPEN_BUY" || a === "BUY") return "OPEN_BUY";
  if (a === "OPEN_SELL" || a === "SELL") return "OPEN_SELL";
  if (a === "CLOSE_ALL") return "CLOSE_ALL";
  return "WAIT";
}

function tfMs(tf) {
  const s = String(tf || "").toUpperCase();
  if (s === "M1") return 60 * 1000;
  if (s === "M5") return 5 * 60 * 1000;
  if (s === "M15") return 15 * 60 * 1000;
  if (s === "M30") return 30 * 60 * 1000;
  if (s === "H1") return 60 * 60 * 1000;
  if (s === "H4") return 4 * 60 * 60 * 1000;
  if (s === "D1") return 24 * 60 * 60 * 1000;
  return 5 * 60 * 1000;
}

function toTsMs(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const raw = String(v || "").trim();
  if (!raw) return null;
  let t = Date.parse(raw);
  if (Number.isFinite(t)) return t;
  // MT4 often sends "YYYY.MM.DD HH:mm" (or with seconds).
  const normalized = raw.replace(/\./g, "-").replace(" ", "T");
  t = Date.parse(normalized);
  if (Number.isFinite(t)) return t;
  // Fallback: remove timezone ambiguity.
  const noTz = normalized.replace("T", " ");
  t = Date.parse(noTz);
  return Number.isFinite(t) ? t : null;
}

function normalizeCandleRow(row) {
  const ts = toTsMs(row?.time ?? row?.ts ?? row?.timestamp);
  const open = Number(row?.open);
  const high = Number(row?.high);
  const low = Number(row?.low);
  const close = Number(row?.close);
  if (!Number.isFinite(ts) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return null;
  }
  if (high < low) return null;
  return {
    time: new Date(ts).toISOString(),
    ts,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(Number(row?.volume)) ? Number(row.volume) : 0
  };
}

function historyKey(accountId, symbol, timeframe) {
  return `${String(accountId || "default")}|${String(symbol || "XAUUSD").toUpperCase()}|${String(timeframe || "M5").toUpperCase()}`;
}

function accountSymbolKey(accountId, symbol) {
  return `${String(accountId || "default")}|${String(symbol || "XAUUSD").toUpperCase()}`;
}

function listHistoryRecords(accountId, symbol) {
  const aid = String(accountId || "default");
  const sym = String(symbol || "XAUUSD").toUpperCase();
  const out = [];
  for (const [k, v] of cache.historyByKey.entries()) {
    if (k.startsWith(`${aid}|${sym}|`)) out.push(v);
  }
  return out;
}

function calcHistoryBehaviorStats(d1Rows) {
  const rows = Array.isArray(d1Rows) ? d1Rows : [];
  if (rows.length < 30) return null;
  let sumOH = 0;
  let sumOL = 0;
  let sumLH = 0;
  let sumOC = 0;
  let n = 0;
  for (const r of rows) {
    const o = Number(r.open);
    const h = Number(r.high);
    const l = Number(r.low);
    const c = Number(r.close);
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c) || o <= 0 || l <= 0) continue;
    sumOH += ((h - o) / o) * 100;
    sumOL += ((o - l) / o) * 100;
    sumLH += ((h - l) / l) * 100;
    sumOC += ((c - o) / o) * 100;
    n++;
  }
  if (!n) return null;
  const last = rows[rows.length - 1];
  const o = Number(last.open || 0);
  const h = Number(last.high || 0);
  const l = Number(last.low || 0);
  const c = Number(last.close || 0);
  return {
    days: n,
    averages: {
      openToHighPct: sumOH / n,
      openToLowPct: sumOL / n,
      lowToHighPct: sumLH / n,
      openToClosePct: sumOC / n
    },
    today: o > 0 && l > 0 ? {
      openToHighPct: ((h - o) / o) * 100,
      openToLowPct: ((o - l) / o) * 100,
      lowToHighPct: ((h - l) / l) * 100,
      openToClosePct: ((c - o) / o) * 100
    } : null
  };
}

function buildSmcContext(rows) {
  const candles = Array.isArray(rows) ? rows : [];
  if (candles.length < 40) return null;
  const tail = candles.slice(-240);
  const close = Number(tail[tail.length - 1]?.close || 0);
  const highRef = Math.max(...tail.slice(-80).map((r) => Number(r.high || 0)));
  const lowRef = Math.min(...tail.slice(-80).map((r) => Number(r.low || close || 0)));
  const band = Math.max(close * 0.003, 0.05);
  const highs = tail.map((r) => Number(r.high || 0));
  const lows = tail.map((r) => Number(r.low || 0));
  const nearRes = highs.filter((x) => Number.isFinite(x) && x >= close && Math.abs(x - close) <= close * 0.03);
  const nearSup = lows.filter((x) => Number.isFinite(x) && x <= close && Math.abs(x - close) <= close * 0.03);
  const nearestResistance = nearRes.length ? Math.min(...nearRes) : highRef;
  const nearestSupport = nearSup.length ? Math.max(...nearSup) : lowRef;
  return {
    refHigh: highRef,
    refLow: lowRef,
    nearestResistance,
    nearestSupport,
    nearBand: band
  };
}

function computeBootstrapStatus(accountId, symbol) {
  const key = accountSymbolKey(accountId, symbol);
  const rec = cache.bootstrapByAccountSymbol.get(key);
  const targetRows = Math.max(1, Number(rec?.targetRows) || 3650);
  const d1Key = historyKey(accountId, symbol, "D1");
  const d1Rows = cache.historyByKey.get(d1Key)?.rows?.length || 0;
  const progressPct = Math.max(0, Math.min(100, (d1Rows / targetRows) * 100));
  const completed = Boolean(rec?.completed) || d1Rows >= targetRows;
  return {
    targetRows,
    currentRows: d1Rows,
    progressPct,
    completed,
    updatedAt: rec?.updatedAt || null
  };
}

function parseResponseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(raw.slice(s, e + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

function runPythonSmc(candles = []) {
  return new Promise((resolve) => {
    const enabled = String(envStr("MT4_PYTHON_SMC_ENABLED", "true")).toLowerCase() === "true";
    if (!enabled) {
      resolve({ ok: false, message: "python_smc_disabled" });
      return;
    }
    const pyBin = envStr("MT4_PYTHON_BIN", "python");
    const timeoutMs = Math.max(800, envNum("MT4_PYTHON_SMC_TIMEOUT_MS", 4500));
    const cwd = path.resolve(__dirname, "..");
    const child = spawn(pyBin, ["-m", "smc_engine.bridge_cli"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (out) => {
      if (done) return;
      done = true;
      resolve(out);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (_) {}
      finish({ ok: false, message: `python_smc_timeout_${timeoutMs}ms`, stderr: stderr.slice(0, 200) });
    }, timeoutMs);

    child.stdout.on("data", (buf) => {
      stdout += String(buf || "");
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf || "");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      finish({ ok: false, message: `python_spawn_error:${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish({ ok: false, message: `python_exit_${code}`, stderr: stderr.slice(0, 240) });
        return;
      }
      try {
        const parsed = JSON.parse(String(stdout || "{}"));
        finish(parsed && typeof parsed === "object" ? parsed : { ok: false, message: "python_invalid_json" });
      } catch (_) {
        finish({ ok: false, message: "python_parse_failed", raw: String(stdout || "").slice(0, 240) });
      }
    });

    const payload = JSON.stringify({ candles: Array.isArray(candles) ? candles.slice(-800) : [] });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

function quickFallbackDecision(payload) {
  const rows = Array.isArray(payload?.candles) ? payload.candles : [];
  if (rows.length < 8) {
    return {
      action: "WAIT",
      confidence: 0.2,
      reason: "Not enough candles for quick fallback",
      sl: null,
      tp: null,
      riskPercent: 0.25
    };
  }
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const close = Number(last.close || 0);
  const prevClose = Number(prev.close || 0);
  const high = Number(last.high || close);
  const low = Number(last.low || close);
  const range = Math.max(1e-9, high - low);
  const body = close - Number(last.open || close);
  const impulse = (close - prevClose) / Math.max(Math.abs(prevClose), 1e-9);
  if (Math.abs(impulse) < 0.0004) {
    return {
      action: "WAIT",
      confidence: 0.3,
      reason: "Momentum weak; waiting",
      sl: null,
      tp: null,
      riskPercent: 0.25
    };
  }
  if (impulse > 0 && body > 0.2 * range) {
    return {
      action: "OPEN_BUY",
      confidence: 0.52,
      reason: "Short-term upward impulse",
      sl: close - 1.2 * range,
      tp: close + 1.8 * range,
      riskPercent: 0.35
    };
  }
  if (impulse < 0 && body < -0.2 * range) {
    return {
      action: "OPEN_SELL",
      confidence: 0.52,
      reason: "Short-term downward impulse",
      sl: close + 1.2 * range,
      tp: close - 1.8 * range,
      riskPercent: 0.35
    };
  }
  return {
    action: "WAIT",
    confidence: 0.35,
    reason: "No clear edge in quick fallback",
    sl: null,
    tp: null,
    riskPercent: 0.25
  };
}

async function callDeepSeekGoldDecision(payload) {
  const apiKey = envStr("DEEPSEEK_API_KEY");
  if (!apiKey) {
    return { decision: quickFallbackDecision(payload), source: "fallback_no_key" };
  }
  const rows = Array.isArray(payload?.candles) ? payload.candles : [];
  const tail = rows.slice(-120);
  const system = [
    "You are an intraday XAUUSD (MT4) assistant.",
    "Return JSON only.",
    "Actions allowed: WAIT, OPEN_BUY, OPEN_SELL, CLOSE_ALL.",
    "Avoid overtrading and avoid entries when spread is high or edge unclear.",
    "Prefer WAIT when uncertain."
  ].join("\n");
  const user = [
    "Decide one action for this cycle.",
    "Schema:",
    '{ "action":"WAIT|OPEN_BUY|OPEN_SELL|CLOSE_ALL", "confidence":0.0, "reason":"...", "sl":0, "tp":0, "riskPercent":0.3 }',
    "",
    `Payload: ${JSON.stringify({
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      bid: payload.bid,
      ask: payload.ask,
      spreadPoints: payload.spreadPoints,
      equity: payload.equity,
      freeMargin: payload.freeMargin,
      openPositions: Array.isArray(payload.openPositions) ? payload.openPositions.slice(0, 20) : [],
      candles: tail,
      historyProfile: payload.historyProfile || null,
      smcContext: payload.smcContext || null,
      pythonSmc: payload.pythonSmc || null
    })}`
  ].join("\n");

  const body = {
    model: DEEPSEEK_MODEL,
    stream: false,
    temperature: 0.35,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };
  const json = await postJson("https://api.deepseek.com/chat/completions", body, {
    Authorization: `Bearer ${apiKey}`
  });
  const content = json?.choices?.[0]?.message?.content || "";
  const parsed = parseResponseJson(content);
  if (!parsed) {
    return { decision: quickFallbackDecision(payload), source: "fallback_invalid_json" };
  }
  return {
    source: "deepseek_mt4",
    decision: {
      action: normalizeAction(parsed.action),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reason: String(parsed.reason || "").slice(0, 220),
      sl: Number(parsed.sl) || null,
      tp: Number(parsed.tp) || null,
      riskPercent: Number(parsed.riskPercent) > 0 ? Number(parsed.riskPercent) : 0.3
    }
  };
}

async function getGoldMt4Signal(payload = {}) {
  const symbol = String(payload.symbol || "").toUpperCase();
  if (symbol !== "XAUUSD") {
    return { ok: false, code: 400, message: "Only XAUUSD is enabled in MT4 MVP" };
  }
  const timeframe = String(payload.timeframe || "M5").toUpperCase();
  const bid = Number(payload.bid || 0);
  const ask = Number(payload.ask || 0);
  const spreadPoints = Number(payload.spreadPoints || 0);
  const candles = Array.isArray(payload.candles) ? payload.candles : [];
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || candles.length < 20) {
    return { ok: false, code: 400, message: "Invalid market payload" };
  }

  const maxSpread = envNum("MT4_XAUUSD_MAX_SPREAD_POINTS", 45);
  if (Number.isFinite(spreadPoints) && spreadPoints > maxSpread) {
    return {
      ok: true,
      source: "spread_guard",
      cached: false,
      decision: {
        action: "WAIT",
        confidence: 0.2,
        reason: `Spread too high (${spreadPoints} > ${maxSpread})`,
        sl: null,
        tp: null,
        riskPercent: 0.2
      }
    };
  }

  const accountId = String(payload.accountId || "default");
  const requireBootstrap = String(envStr("MT4_REQUIRE_BOOTSTRAP", "true")).toLowerCase() === "true";
  const boot = computeBootstrapStatus(accountId, symbol);
  if (requireBootstrap && !boot.completed) {
    return {
      ok: true,
      source: "bootstrap_guard",
      cached: false,
      bootstrap: boot,
      decision: {
        action: "WAIT",
        confidence: 0.1,
        reason: `Bootstrap history not completed (${boot.progressPct.toFixed(1)}%)`,
        sl: null,
        tp: null,
        riskPercent: 0.2
      }
    };
  }
  const latestBarTime = String(candles[candles.length - 1]?.time || payload.brokerTime || "");
  const key = `${accountId}|${symbol}|${timeframe}|${latestBarTime}`;
  const now = Date.now();
  const minIntervalMs = Math.max(3000, envNum("MT4_MIN_CALL_INTERVAL_MS", 30000));

  const prev = cache.byKey.get(key);
  if (prev && now - prev.ts < minIntervalMs) {
    return { ok: true, source: prev.source, cached: true, decision: prev.decision };
  }

  const records = listHistoryRecords(accountId, symbol);
  const d1Rec = records.find((r) => r.timeframe === "D1");
  const tfRec = records.find((r) => r.timeframe === timeframe);
  const mergedRows = tfRec?.rows?.length
    ? [...tfRec.rows.slice(-2000), ...candles.map(normalizeCandleRow).filter(Boolean)].sort((a, b) => a.ts - b.ts)
    : candles.map(normalizeCandleRow).filter(Boolean);
  const historyProfile = d1Rec?.rows?.length ? calcHistoryBehaviorStats(d1Rec.rows.slice(-4000)) : null;
  const smcContext = buildSmcContext(mergedRows);
  const pythonSmc = await runPythonSmc(mergedRows);
  const pyPriority = String(envStr("MT4_PYTHON_SMC_PRIORITY", "true")).toLowerCase() === "true";
  if (pyPriority && pythonSmc?.ok && pythonSmc?.decision) {
    const pyAction = normalizeAction(pythonSmc.decision.action);
    const pyConf = Math.max(0, Math.min(1, Number(pythonSmc.decision.confidence) || 0));
    if (pyAction !== "WAIT" && pyConf >= 0.7) {
      const decision = {
        action: pyAction,
        confidence: pyConf,
        reason: String(pythonSmc.decision.reason || "python_smc_priority").slice(0, 220),
        sl: Number(pythonSmc.decision.sl) || null,
        tp: Number(pythonSmc.decision.tp) || null,
        riskPercent: Number(pythonSmc.decision.riskPercent) > 0 ? Number(pythonSmc.decision.riskPercent) : 0.3
      };
      cache.byKey.set(key, { ts: now, source: "python_smc_priority", decision });
      return {
        ok: true,
        source: "python_smc_priority",
        cached: false,
        bootstrap: boot,
        decision,
        pythonSmcMeta: {
          source: pythonSmc.source || null,
          fallbackReason: pythonSmc.fallback_reason || null
        }
      };
    }
  }
  const ai = await callDeepSeekGoldDecision({
    ...payload,
    candles: mergedRows,
    historyProfile,
    smcContext,
    pythonSmc
  });
  const decision = ai.decision || quickFallbackDecision(payload);
  cache.byKey.set(key, { ts: now, source: ai.source || "fallback", decision });

  return {
    ok: true,
    source: ai.source || "fallback",
    cached: false,
    bootstrap: boot,
    decision
  };
}

function uploadGoldHistory(payload = {}) {
  const symbol = String(payload.symbol || "").toUpperCase();
  if (symbol !== "XAUUSD") {
    return { ok: false, code: 400, message: "Only XAUUSD is enabled in MT4 MVP" };
  }
  const timeframe = String(payload.timeframe || "D1").toUpperCase();
  const accountId = String(payload.accountId || "default");
  const rowsIn = Array.isArray(payload.candles) ? payload.candles : [];
  const normalized = rowsIn.map(normalizeCandleRow).filter(Boolean);
  if (!normalized.length) {
    return { ok: false, code: 400, message: "Invalid or empty candles payload" };
  }
  const key = historyKey(accountId, symbol, timeframe);
  const rec = cache.historyByKey.get(key) || {
    accountId,
    symbol,
    timeframe,
    rows: [],
    byTs: new Map(),
    updatedAt: null
  };
  for (const row of rec.rows) rec.byTs.set(row.ts, row);
  for (const row of normalized) rec.byTs.set(row.ts, row);
  const all = Array.from(rec.byTs.values()).sort((a, b) => a.ts - b.ts);
  const maxRows = Math.max(4000, envNum("MT4_GOLD_HISTORY_MAX_ROWS", 250000));
  const trimmed = all.slice(-maxRows);
  rec.rows = trimmed;
  rec.byTs = new Map(trimmed.map((r) => [r.ts, r]));
  rec.updatedAt = new Date().toISOString();
  cache.historyByKey.set(key, rec);
  const asKey = accountSymbolKey(accountId, symbol);
  const prevBoot = cache.bootstrapByAccountSymbol.get(asKey) || {};
  const targetRows = Math.max(365, Number(payload.targetRows) || Number(prevBoot.targetRows) || 3650);
  const mode = String(payload.mode || "append");
  const doneFlag = Boolean(payload.done);
  const computed = computeBootstrapStatus(accountId, symbol);
  const completed = Boolean(prevBoot.completed) || (timeframe === "D1" && (doneFlag || computed.currentRows >= targetRows));
  cache.bootstrapByAccountSymbol.set(asKey, {
    targetRows,
    completed,
    mode,
    updatedAt: new Date().toISOString()
  });
  const bootstrap = computeBootstrapStatus(accountId, symbol);

  return {
    ok: true,
    accountId,
    symbol,
    timeframe,
    mode: String(payload.mode || "append"),
    chunkSize: normalized.length,
    totalRows: rec.rows.length,
    from: rec.rows[0]?.time || null,
    to: rec.rows[rec.rows.length - 1]?.time || null,
    updatedAt: rec.updatedAt,
    bootstrap
  };
}

function getGoldHistoryStatus(accountId = "default", symbol = "XAUUSD") {
  const records = listHistoryRecords(accountId, symbol);
  const rows = records
    .sort((a, b) => tfMs(a.timeframe) - tfMs(b.timeframe))
    .map((r) => ({
      accountId: r.accountId,
      symbol: r.symbol,
      timeframe: r.timeframe,
      totalRows: r.rows.length,
      from: r.rows[0]?.time || null,
      to: r.rows[r.rows.length - 1]?.time || null,
      updatedAt: r.updatedAt || null
    }));
  return {
    rows,
    bootstrap: computeBootstrapStatus(accountId, symbol)
  };
}

function saveMt4Execution(payload = {}) {
  const rec = {
    ts: new Date().toISOString(),
    accountId: String(payload.accountId || "default"),
    symbol: String(payload.symbol || "").toUpperCase(),
    orderType: String(payload.orderType || ""),
    lots: Number(payload.lots || 0),
    price: Number(payload.price || 0),
    pnl: Number(payload.pnl || 0),
    ticket: String(payload.ticket || ""),
    comment: String(payload.comment || "").slice(0, 180)
  };
  cache.executionLog.push(rec);
  if (cache.executionLog.length > 200) cache.executionLog.shift();
  return { ok: true, saved: rec };
}

function getMt4ExecutionLog(limit = 30) {
  const n = Math.max(1, Math.min(Number(limit) || 30, 200));
  return cache.executionLog.slice(-n).reverse();
}

module.exports = {
  getGoldMt4Signal,
  saveMt4Execution,
  getMt4ExecutionLog,
  uploadGoldHistory,
  getGoldHistoryStatus,
  runPythonSmc
};

