const { postJson } = require("./ai-service.js");
const { DEEPSEEK_MODEL } = require("../config/constants.js");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const pgStore = require("./mt4-gold-pg-store.js");

const cache = {
  byKey: new Map(),
  byPair: new Map(),
  executionLog: [],
  historyByKey: new Map(),
  bootstrapByAccountSymbol: new Map(),
  /** @type {Map<string, number>} last time we emitted OPEN_* (ms) — anti-scalp throttle */
  entryThrottleByAccount: new Map(),
  persistedAt: null
};

const DATA_DIR = path.resolve(__dirname, "..", ".data");
const STORE_FILE = path.join(DATA_DIR, "mt4-gold-store.json");
let persistTimer = null;

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function envStr(name, fallback = "") {
  const v = process.env[name];
  return v == null ? fallback : String(v);
}

function isGlobalHistoryMode() {
  return String(envStr("MT4_GLOBAL_HISTORY_MODE", "true")).toLowerCase() === "true";
}

function toPlainHistoryRecord(rec) {
  return {
    accountId: rec.accountId,
    symbol: rec.symbol,
    timeframe: rec.timeframe,
    rows: Array.isArray(rec.rows) ? rec.rows : [],
    updatedAt: rec.updatedAt || null
  };
}

function saveStoreSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const payload = {
        version: 1,
        persistedAt: new Date().toISOString(),
        executionLog: cache.executionLog,
        historyByKey: Array.from(cache.historyByKey.entries()).map(([k, v]) => [k, toPlainHistoryRecord(v)]),
        bootstrapByAccountSymbol: Array.from(cache.bootstrapByAccountSymbol.entries())
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(payload));
      cache.persistedAt = payload.persistedAt;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("mt4 store persist failed:", err.message);
    }
  }, 300);
}

function loadStoreFromDisk() {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    cache.executionLog = Array.isArray(parsed.executionLog) ? parsed.executionLog.slice(-500) : [];
    const hist = new Map();
    for (const pair of Array.isArray(parsed.historyByKey) ? parsed.historyByKey : []) {
      const key = pair?.[0];
      const rec = pair?.[1];
      if (!key || !rec || !Array.isArray(rec.rows)) continue;
      const rows = rec.rows.map(normalizeCandleRow).filter(Boolean);
      hist.set(String(key), {
        accountId: String(rec.accountId || "default"),
        symbol: String(rec.symbol || "XAUUSD").toUpperCase(),
        timeframe: String(rec.timeframe || "M5").toUpperCase(),
        rows,
        byTs: new Map(rows.map((r) => [r.ts, r])),
        updatedAt: rec.updatedAt || null
      });
    }
    cache.historyByKey = hist;
    cache.bootstrapByAccountSymbol = new Map(Array.isArray(parsed.bootstrapByAccountSymbol) ? parsed.bootstrapByAccountSymbol : []);
    cache.persistedAt = parsed.persistedAt || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("mt4 store load failed:", err.message);
  }
}

function normalizeAction(action) {
  const a = String(action || "WAIT").toUpperCase();
  if (a === "OPEN_BUY" || a === "BUY") return "OPEN_BUY";
  if (a === "OPEN_SELL" || a === "SELL") return "OPEN_SELL";
  if (a === "SCALE_IN_BUY" || a === "SCALE_BUY") return "SCALE_IN_BUY";
  if (a === "SCALE_IN_SELL" || a === "SCALE_SELL") return "SCALE_IN_SELL";
  if (a === "CLOSE_ALL") return "CLOSE_ALL";
  return "WAIT";
}

function isBuyEntryAction(a) {
  return a === "OPEN_BUY" || a === "SCALE_IN_BUY";
}

function isSellEntryAction(a) {
  return a === "OPEN_SELL" || a === "SCALE_IN_SELL";
}

function isEntryAction(a) {
  return isBuyEntryAction(a) || isSellEntryAction(a);
}

function isScaleInAction(a) {
  return a === "SCALE_IN_BUY" || a === "SCALE_IN_SELL";
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
  const aid = isGlobalHistoryMode() ? "global" : String(accountId || "default");
  return `${aid}|${String(symbol || "XAUUSD").toUpperCase()}|${String(timeframe || "M5").toUpperCase()}`;
}

function accountSymbolKey(accountId, symbol) {
  const aid = isGlobalHistoryMode() ? "global" : String(accountId || "default");
  return `${aid}|${String(symbol || "XAUUSD").toUpperCase()}`;
}

function listHistoryRecords(accountId, symbol) {
  const aid = isGlobalHistoryMode() ? "global" : String(accountId || "default");
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

function mean(arr) {
  const a = arr.filter((x) => Number.isFinite(x));
  if (!a.length) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function minMax(arr) {
  const a = arr.filter((x) => Number.isFinite(x));
  if (!a.length) return { min: null, max: null };
  return { min: Math.min(...a), max: Math.max(...a) };
}

function smaCloses(closes, n) {
  if (!Array.isArray(closes) || closes.length < n) return null;
  const slice = closes.slice(-n);
  const s = slice.reduce((acc, x) => acc + x, 0);
  return s / n;
}

/** Per-day OHLC-derived % metrics + day-over-day close change %. */
function buildD1DayMetrics(rows) {
  const out = [];
  const list = Array.isArray(rows) ? rows : [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const o = Number(r.open);
    const h = Number(r.high);
    const l = Number(r.low);
    const c = Number(r.close);
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c) || o <= 0 || l <= 0) continue;
    const prevC = i > 0 ? Number(list[i - 1].close) : null;
    const changeFromPrevClosePct =
      Number.isFinite(prevC) && prevC > 0 ? ((c - prevC) / prevC) * 100 : null;
    out.push({
      openToHighPct: ((h - o) / o) * 100,
      openToLowPct: ((o - l) / o) * 100,
      lowToHighPct: ((h - l) / l) * 100,
      openToClosePct: ((c - o) / o) * 100,
      changeFromPrevClosePct
    });
  }
  return out;
}

function summarizeMetricWindow(metrics, label) {
  if (!metrics.length) return null;
  const oth = metrics.map((m) => m.openToHighPct);
  const otl = metrics.map((m) => m.openToLowPct);
  const lth = metrics.map((m) => m.lowToHighPct);
  const otc = metrics.map((m) => m.openToClosePct);
  const chg = metrics.map((m) => m.changeFromPrevClosePct).filter((x) => x != null);
  return {
    label,
    days: metrics.length,
    openToHighPct: { avg: mean(oth), ...minMax(oth) },
    openToLowPct: { avg: mean(otl), ...minMax(otl) },
    lowToHighPct: { avg: mean(lth), ...minMax(lth) },
    openToClosePct: { avg: mean(otc), ...minMax(otc) },
    changeFromPrevClosePct: chg.length ? { avg: mean(chg), ...minMax(chg) } : null
  };
}

/** Rich D1 stats: rolling 15/30/60 + all sample; complements legacy calcHistoryBehaviorStats. */
function buildRichHistoryProfile(d1Rows) {
  const rows = Array.isArray(d1Rows) ? d1Rows.slice().sort((a, b) => a.ts - b.ts) : [];
  if (rows.length < 10) return null;
  const metrics = buildD1DayMetrics(rows);
  if (!metrics.length) return null;
  const last15 = metrics.slice(-15);
  const last30 = metrics.slice(-30);
  const last60 = metrics.slice(-60);
  const windows = {
    last15: summarizeMetricWindow(last15, "last15"),
    last30: summarizeMetricWindow(last30, "last30"),
    last60: rows.length >= 60 ? summarizeMetricWindow(last60, "last60") : null,
    all: summarizeMetricWindow(metrics, "all")
  };
  const chgAll = metrics.map((m) => m.changeFromPrevClosePct).filter((x) => x != null);
  return {
    windows,
    extremes: {
      changeFromPrevClosePctAllTime: chgAll.length ? { ...minMax(chgAll), sampleDays: chgAll.length } : null
    },
    legacy: calcHistoryBehaviorStats(rows)
  };
}

/** D1 + H1 + M5 bias — H1 cuts M5 noise / over-scalping against the swing. */
function computeTrendContext(d1Rows, mergedRows, h1Rows) {
  const d1 = Array.isArray(d1Rows) ? d1Rows.slice().sort((a, b) => a.ts - b.ts) : [];
  const closesD1 = d1.map((r) => Number(r.close)).filter((x) => Number.isFinite(x) && x > 0);
  let d1Bias = "neutral";
  let d1Strength = 0;
  if (closesD1.length >= 20) {
    const sma20 = smaCloses(closesD1, 20);
    const last = closesD1[closesD1.length - 1];
    if (sma20 > 0) {
      const pct = (last - sma20) / sma20;
      if (pct > 0.002) {
        d1Bias = "bullish";
        d1Strength = Math.min(1, pct / 0.015);
      } else if (pct < -0.002) {
        d1Bias = "bearish";
        d1Strength = Math.min(1, -pct / 0.015);
      }
    }
  }
  const h1 = Array.isArray(h1Rows) ? h1Rows.slice().sort((a, b) => a.ts - b.ts) : [];
  const closesH1 = h1.map((r) => Number(r.close)).filter((x) => Number.isFinite(x) && x > 0);
  let h1Bias = "neutral";
  let h1Strength = 0;
  if (closesH1.length >= 20) {
    const sma20 = smaCloses(closesH1, 20);
    const last = closesH1[closesH1.length - 1];
    if (sma20 > 0) {
      const pct = (last - sma20) / sma20;
      if (pct > 0.0015) {
        h1Bias = "bullish";
        h1Strength = Math.min(1, pct / 0.012);
      } else if (pct < -0.0015) {
        h1Bias = "bearish";
        h1Strength = Math.min(1, -pct / 0.012);
      }
    }
  }
  const m5 = Array.isArray(mergedRows) ? mergedRows.slice(-200) : [];
  const closesM5 = m5.map((r) => Number(r.close)).filter((x) => Number.isFinite(x) && x > 0);
  let m5Bias = "neutral";
  let m5Strength = 0;
  if (closesM5.length >= 20) {
    const sma20 = smaCloses(closesM5, 20);
    const last = closesM5[closesM5.length - 1];
    if (sma20 > 0) {
      const pct = (last - sma20) / sma20;
      if (pct > 0.001) {
        m5Bias = "bullish";
        m5Strength = Math.min(1, pct / 0.008);
      } else if (pct < -0.001) {
        m5Bias = "bearish";
        m5Strength = Math.min(1, -pct / 0.008);
      }
    }
  }
  let alignment = "mixed";
  if (d1Bias === "neutral" || m5Bias === "neutral") alignment = "neutral_or_mixed";
  else if (d1Bias === m5Bias) alignment = "aligned";
  else alignment = "conflicting";
  let htfVsM5 = "ok";
  if (h1Bias !== "neutral" && m5Bias !== "neutral" && h1Bias !== m5Bias) htfVsM5 = "m5_fights_h1";
  return {
    d1: { bias: d1Bias, strength: Number(d1Strength.toFixed(3)), smaVsLast: closesD1.length >= 20 },
    h1: { bias: h1Bias, strength: Number(h1Strength.toFixed(3)), smaVsLast: closesH1.length >= 20 },
    m5: { bias: m5Bias, strength: Number(m5Strength.toFixed(3)), smaVsLast: closesM5.length >= 20 },
    alignment,
    htfVsM5,
    rule:
      "Use D1+H1 for swing direction; M5 is execution noise. Do not OPEN_SELL when D1 and H1 are both clearly bullish; do not OPEN_BUY when both clearly bearish. If htfVsM5 is m5_fights_h1, prefer WAIT for new entries. Prefer WAIT when D1 and M5 conflict unless managing exits."
  };
}

/** Avg M5 bar range (price) — used for minimum stop distance vs tight scalping SL. */
function computeMinStopDistancePrice(rows) {
  const tail = Array.isArray(rows) ? rows.slice(-48) : [];
  if (tail.length < 10) return 0;
  let sum = 0;
  let n = 0;
  for (const r of tail) {
    const h = Number(r.high);
    const l = Number(r.low);
    if (Number.isFinite(h) && Number.isFinite(l) && h > l) {
      sum += h - l;
      n++;
    }
  }
  if (n < 5) return 0;
  const avg = sum / n;
  const mult = Math.max(0.9, envNum("MT4_MIN_SL_RANGE_MULT", 1.45));
  const floor = Math.max(0.5, envNum("MT4_MIN_SL_PRICE_FLOOR", 2.8));
  return Math.max(floor, avg * mult);
}

function normalizeStopsForDecision(decision, payload, mergedRows) {
  if (!decision) return decision;
  const a = normalizeAction(decision.action);
  if (!isEntryAction(a)) return decision;
  const bid = Number(payload?.bid);
  const ask = Number(payload?.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask < bid) return decision;
  const minDist = computeMinStopDistancePrice(mergedRows);
  if (minDist <= 0) return decision;
  const rr = Math.max(1.15, envNum("MT4_DEFAULT_TP_RR", 1.55));
  let sl = decision.sl != null ? Number(decision.sl) : NaN;
  let tp = decision.tp != null ? Number(decision.tp) : NaN;

  if (isBuyEntryAction(a)) {
    const entry = ask;
    const maxSl = entry - minDist;
    if (!Number.isFinite(sl) || sl <= 0 || sl > maxSl) sl = maxSl;
    if (!Number.isFinite(tp) || tp <= 0) tp = entry + minDist * rr;
  } else {
    const entry = bid;
    const minSl = entry + minDist;
    if (!Number.isFinite(sl) || sl <= 0 || sl < minSl) sl = minSl;
    if (!Number.isFinite(tp) || tp <= 0) tp = entry - minDist * rr;
  }
  return {
    ...decision,
    sl,
    tp,
    reason: String(decision.reason || "").slice(0, 200)
  };
}

function applyMinConfidenceGuard(decision) {
  if (!decision) return decision;
  const a = normalizeAction(decision.action);
  if (!isEntryAction(a)) return decision;
  const minC = Math.max(0, Math.min(1, envNum("MT4_MIN_ENTRY_CONFIDENCE", 0.44)));
  const c = Number(decision.confidence) || 0;
  if (c < minC) {
    return {
      ...decision,
      action: "WAIT",
      confidence: c,
      reason: `low_confidence_guard:${c.toFixed(2)}<${minC} ${String(decision.reason || "").slice(0, 100)}`
    };
  }
  return decision;
}

function applyAlignmentConflictGuard(decision, trendContext, hasOpenPositions) {
  if (!decision) return decision;
  const a = normalizeAction(decision.action);
  const isScale = isScaleInAction(a);
  if (hasOpenPositions && !isScale) return decision;
  const soft = String(envStr("MT4_CONFLICT_ALIGNMENT_SOFT_BLOCK", "true")).toLowerCase() === "true";
  if (!soft || !trendContext) return decision;
  if (trendContext.alignment !== "conflicting") return decision;
  if (!isEntryAction(a)) return decision;
  const thr = Math.max(0.12, Math.min(0.85, envNum("MT4_CONFLICT_ALIGNMENT_STRENGTH", 0.28)));
  const d1s = Number(trendContext.d1?.strength) || 0;
  const m5s = Number(trendContext.m5?.strength) || 0;
  if (d1s >= thr && m5s >= thr) {
    return {
      ...decision,
      action: "WAIT",
      confidence: Math.min(Number(decision.confidence) || 0, 0.38),
      reason: `alignment_conflict_guard ${String(decision.reason || "").slice(0, 120)}`
    };
  }
  return decision;
}

function applyEntryCooldown(decision, accountId, symbol, hasOpenPositions) {
  if (!decision) return decision;
  const a = normalizeAction(decision.action);
  if (!isEntryAction(a)) return decision;
  const isScale = isScaleInAction(a);
  if (hasOpenPositions && !isScale) return decision;
  const minMs = Math.max(0, envNum("MT4_MIN_MS_BETWEEN_NEW_ENTRIES", 600000));
  if (minMs <= 0) return decision;
  const key = `${String(accountId || "default")}|${String(symbol || "XAUUSD").toUpperCase()}`;
  const last = cache.entryThrottleByAccount.get(key) || 0;
  const now = Date.now();
  if (now - last < minMs) {
    const left = Math.ceil((minMs - (now - last)) / 1000);
    return {
      ...decision,
      action: "WAIT",
      confidence: Math.min(Number(decision.confidence) || 0, 0.35),
      reason: `entry_cooldown:${left}s ${String(decision.reason || "").slice(0, 100)}`
    };
  }
  return decision;
}

/** Block shorts when D1+H1 both bullish (and mirror) — reduces sell arrows in a rally. */
function applyHtfDualBlockGuard(decision, trendContext, hasOpenPositions) {
  if (!decision) return decision;
  const a = normalizeAction(decision.action);
  const isScale = isScaleInAction(a);
  if (hasOpenPositions && !isScale) return decision;
  const soft = String(envStr("MT4_HTF_DUAL_BLOCK", "true")).toLowerCase() === "true";
  if (!soft || !trendContext) return decision;
  if (!isEntryAction(a)) return decision;
  const thr = Math.max(0.1, Math.min(0.85, envNum("MT4_HTF_DUAL_BLOCK_STRENGTH", 0.32)));
  const d1b = trendContext.d1?.bias;
  const h1b = trendContext.h1?.bias;
  const d1s = Number(trendContext.d1?.strength) || 0;
  const h1s = Number(trendContext.h1?.strength) || 0;
  const bothBull = d1b === "bullish" && h1b === "bullish" && d1s >= thr && h1s >= thr * 0.85;
  const bothBear = d1b === "bearish" && h1b === "bearish" && d1s >= thr && h1s >= thr * 0.85;
  if (isSellEntryAction(a) && bothBull) {
    return {
      ...decision,
      action: "WAIT",
      confidence: Math.min(Number(decision.confidence) || 0, 0.35),
      reason: `htf_dual_block:no_short_when_d1_h1_bull ${String(decision.reason || "").slice(0, 100)}`
    };
  }
  if (isBuyEntryAction(a) && bothBear) {
    return {
      ...decision,
      action: "WAIT",
      confidence: Math.min(Number(decision.confidence) || 0, 0.35),
      reason: `htf_dual_block:no_long_when_d1_h1_bear ${String(decision.reason || "").slice(0, 100)}`
    };
  }
  return decision;
}

/** When M5 disagrees with H1 strongly, stand aside (anti-chop). */
function applyM5VsH1Guard(decision, trendContext, hasOpenPositions) {
  if (!decision) return decision;
  const a = normalizeAction(decision.action);
  const isScale = isScaleInAction(a);
  if (hasOpenPositions && !isScale) return decision;
  const soft = String(envStr("MT4_M5_VS_H1_SOFT_BLOCK", "true")).toLowerCase() === "true";
  if (!soft || !trendContext || trendContext.htfVsM5 !== "m5_fights_h1") return decision;
  if (!isEntryAction(a)) return decision;
  const h1s = Number(trendContext.h1?.strength) || 0;
  const m5s = Number(trendContext.m5?.strength) || 0;
  const need = Math.max(0.12, Math.min(0.9, envNum("MT4_M5_VS_H1_MIN_STRENGTH", 0.4)));
  if (h1s < need || m5s < need) return decision;
  return {
    ...decision,
    action: "WAIT",
    confidence: Math.min(Number(decision.confidence) || 0, 0.35),
    reason: `m5_vs_h1_chop ${String(decision.reason || "").slice(0, 100)}`
  };
}

function recordEntryThrottle(accountId, symbol, decision) {
  const a = normalizeAction(decision?.action);
  if (!isEntryAction(a)) return;
  const key = `${String(accountId || "default")}|${String(symbol || "XAUUSD").toUpperCase()}`;
  cache.entryThrottleByAccount.set(key, Date.now());
}

function applyEntryDecisionGuards(decision, payload, mergedRows, trendContext, accountId, symbol, hasOpenPositions) {
  let d = decision;
  d = normalizeStopsForDecision(d, payload, mergedRows);
  d = applyMinConfidenceGuard(d);
  d = applyAlignmentConflictGuard(d, trendContext, hasOpenPositions);
  d = applyHtfDualBlockGuard(d, trendContext, hasOpenPositions);
  d = applyM5VsH1Guard(d, trendContext, hasOpenPositions);
  d = applyContraTrendGuard(d, trendContext, hasOpenPositions);
  d = applyEntryCooldown(d, accountId, symbol, hasOpenPositions);
  return d;
}

function applyContraTrendGuard(decision, trendContext, hasOpenPositions) {
  if (!decision) return decision;
  const a = normalizeAction(decision.action);
  const isScale = isScaleInAction(a);
  if (hasOpenPositions && !isScale) return decision;
  const soft = String(envStr("MT4_CONTRA_TREND_SOFT_BLOCK", "true")).toLowerCase() === "true";
  if (!soft || !trendContext) return decision;
  const thr = Math.max(0.15, Math.min(0.85, envNum("MT4_CONTRA_TREND_STRENGTH", 0.35)));
  const d1b = trendContext.d1?.bias;
  const m5b = trendContext.m5?.bias;
  const d1s = Number(trendContext.d1?.strength) || 0;
  const m5s = Number(trendContext.m5?.strength) || 0;
  const strongBear = d1b === "bearish" && d1s >= thr && m5b === "bearish" && m5s >= thr * 0.7;
  const strongBull = d1b === "bullish" && d1s >= thr && m5b === "bullish" && m5s >= thr * 0.7;
  if (isBuyEntryAction(a) && strongBear) {
    return {
      ...decision,
      action: "WAIT",
      confidence: Math.min(Number(decision.confidence) || 0, 0.35),
      reason: `contra_trend_guard:avoid_buy_in_strong_bearish_htf ${String(decision.reason || "").slice(0, 120)}`
    };
  }
  if (isSellEntryAction(a) && strongBull) {
    return {
      ...decision,
      action: "WAIT",
      confidence: Math.min(Number(decision.confidence) || 0, 0.35),
      reason: `contra_trend_guard:avoid_sell_in_strong_bullish_htf ${String(decision.reason || "").slice(0, 120)}`
    };
  }
  return decision;
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

async function computeBootstrapStatus(accountId, symbol) {
  const key = accountSymbolKey(accountId, symbol);
  const rec = cache.bootstrapByAccountSymbol.get(key);
  const targetRows = Math.max(1, Number(rec?.targetRows) || 3650);
  const d1Key = historyKey(accountId, symbol, "D1");
  const d1Rows = cache.historyByKey.get(d1Key)?.rows?.length || 0;
  const pgState = await pgStore.getBootstrapState(String(symbol || "XAUUSD").toUpperCase());
  const pgD1 = await pgStore.getSyncState(String(symbol || "XAUUSD").toUpperCase(), "D1");
  const target = Math.max(targetRows, Number(pgState?.targetRows) || 0);
  const d1Count = Math.max(d1Rows, Number(pgD1?.totalRows) || 0);
  const progressPct = Math.max(0, Math.min(100, (d1Rows / targetRows) * 100));
  const completed = Boolean(rec?.completed) || Boolean(pgState?.completed) || d1Count >= target;
  return {
    targetRows: target,
    currentRows: d1Count,
    progressPct: Math.max(0, Math.min(100, (d1Count / Math.max(1, target)) * 100)),
    completed,
    updatedAt: rec?.updatedAt || pgState?.updatedAt || null
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

function shouldSkipDeepSeek(payload) {
  const rows = Array.isArray(payload?.candles) ? payload.candles : [];
  const openPositions = Array.isArray(payload?.openPositions) ? payload.openPositions : [];
  if (openPositions.length > 0) return { skip: false, reason: "" };
  if (rows.length < 30) return { skip: true, reason: "token_saver_not_enough_rows" };
  const tail = rows.slice(-18);
  const closes = tail.map((r) => Number(r.close || 0)).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 8) return { skip: true, reason: "token_saver_invalid_rows" };
  const last = closes[closes.length - 1];
  const first = closes[0];
  const impulseAbs = Math.abs((last - first) / Math.max(first, 1e-9));
  let sumAbsRet = 0;
  for (let i = 1; i < closes.length; i++) {
    sumAbsRet += Math.abs((closes[i] - closes[i - 1]) / Math.max(closes[i - 1], 1e-9));
  }
  const avgAbsRet = sumAbsRet / Math.max(1, closes.length - 1);
  const spreadPoints = Number(payload?.spreadPoints || 0);
  const spreadGuard = Math.max(20, envNum("MT4_TOKEN_SAVER_MAX_SPREAD_POINTS", 35));
  if (spreadPoints > spreadGuard) return { skip: true, reason: "token_saver_spread_high" };
  const quietImpulse = impulseAbs < envNum("MT4_TOKEN_SAVER_IMPULSE_MIN", 0.00028);
  const quietVol = avgAbsRet < envNum("MT4_TOKEN_SAVER_AVGRET_MIN", 0.00016);
  if (quietImpulse && quietVol) return { skip: true, reason: "token_saver_quiet_market" };
  return { skip: false, reason: "" };
}

async function callDeepSeekGoldDecision(payload) {
  const apiKey = envStr("DEEPSEEK_API_KEY");
  if (!apiKey) {
    return { decision: quickFallbackDecision(payload), source: "fallback_no_key" };
  }
  const rows = Array.isArray(payload?.candles) ? payload.candles : [];
  const maxCandles = Math.max(30, Math.min(220, envNum("MT4_DEEPSEEK_CANDLES_MAX", 60)));
  const tail = rows.slice(-maxCandles);
  const system = [
    "You are an intraday XAUUSD (MT4) assistant.",
    "Return JSON only.",
    "Actions allowed: WAIT, OPEN_BUY, OPEN_SELL, SCALE_IN_BUY, SCALE_IN_SELL, CLOSE_ALL.",
    "You are responsible for both entries and exits. Manage open positions actively.",
    "When risk or momentum turns against an open position, you may use CLOSE_ALL.",
    "Trend discipline: use trendContext.d1, .h1, and .m5. H1 is the swing; M5 is noise. If trendContext.htfVsM5 is m5_fights_h1, prefer WAIT for new entries. Do not OPEN_SELL when D1 and H1 are both clearly bullish; do not OPEN_BUY when both are clearly bearish (server may also block these).",
    "When trendContext.alignment is conflicting, prefer WAIT for new entries unless you are managing an exit.",
    "historyProfile.windows contains rolling stats (last15/last30/last60/all): avg/min/max for openToHigh, openToLow, lowToHigh, openToClose, and changeFromPrevClose. Use these to judge if today's move is already stretched vs typical days.",
    "SMC + SR discipline: use smcContext.nearestSupport and smcContext.nearestResistance (plus refHigh/refLow) to define where price can run before invalidation.",
    "Stop-loss hunting zones: use slCluster (clustered SL prices from open positions) and openPositionsRisk (distance to SL) to estimate whether current price is close enough to trigger SLs (stop-run risk). If stop-run risk is high, choose CLOSE_ALL.",
    "Scale-in: when openPositions exist and SMC+trend+history expected zones suggest continuation, choose SCALE_IN_BUY/SCALE_IN_SELL only if SL-cluster trigger risk is NOT high.",
    "smcContext is short-term structure from recent bars; historyProfile is longer daily behaviour. Combine them; do not chase entries when price is extended beyond typical daily ranges without clear continuation.",
    "When pythonSmc (if present) aligns with trendContext and historyProfile suggests a normal (not stretched) day, prefer a decisive OPEN_BUY or OPEN_SELL with confidence>=0.5 over repeated WAIT — endless WAIT is wrong if SMC + HTF agree.",
    "Avoid overtrading and avoid entries when spread is high or edge unclear.",
    "Prefer WAIT when uncertain.",
    "Stop/target: for OPEN_BUY/OPEN_SELL/SCALE_IN_BUY/SCALE_IN_SELL, place SL at least ~1.4× the typical M5 bar range away from the intended add-entry price (not a few ticks). Prefer RR ~1.5:1 or better when you set tp; do not use tp=0 unless you intend to manage exit with CLOSE_ALL only."
  ].join("\n");
  const user = [
    "Decide one action for this cycle.",
    "Schema:",
    '{ "action":"WAIT|OPEN_BUY|OPEN_SELL|SCALE_IN_BUY|SCALE_IN_SELL|CLOSE_ALL", "confidence":0.0, "reason":"...", "sl":0, "tp":0, "riskPercent":0.3 }',
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
      trendContext: payload.trendContext || null,
      smcContext: payload.smcContext || null,
      slCluster: payload.slCluster || null,
      openPositionsRisk: payload.openPositionsRisk || null,
      d1ExpectedZones: payload.d1ExpectedZones || null,
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
  const openPositions = Array.isArray(payload.openPositions) ? payload.openPositions : [];
  const hasOpenPositions = openPositions.length > 0;
  const aiFullControl = String(envStr("MT4_AI_FULL_CONTROL", "true")).toLowerCase() === "true";
  const requireBootstrap = String(envStr("MT4_REQUIRE_BOOTSTRAP", "true")).toLowerCase() === "true";
  const boot = await computeBootstrapStatus(accountId, symbol);
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
  const pairKey = `${accountId}|${symbol}|${timeframe}`;
  const key = `${pairKey}|${latestBarTime}`;
  const now = Date.now();
  const minIntervalBaseMs = Math.max(3000, envNum("MT4_MIN_CALL_INTERVAL_MS", 90000));
  const minIntervalOpenMs = Math.max(3000, envNum("MT4_MIN_CALL_INTERVAL_OPEN_MS", 10000));
  const minIntervalMs = hasOpenPositions ? minIntervalOpenMs : minIntervalBaseMs;
  const sameBarReuse = String(envStr("MT4_REUSE_DECISION_SAME_BAR", "true")).toLowerCase() === "true";

  const prevPair = cache.byPair.get(pairKey);
  if (sameBarReuse && !hasOpenPositions && prevPair && prevPair.latestBarTime === latestBarTime) {
    return { ok: true, source: prevPair.source, cached: true, bootstrap: boot, decision: prevPair.decision };
  }

  const prev = cache.byKey.get(key);
  if (prev && now - prev.ts < minIntervalMs) {
    return { ok: true, source: prev.source, cached: true, decision: prev.decision };
  }

  const records = listHistoryRecords(accountId, symbol);
  const d1Rec = records.find((r) => r.timeframe === "D1");
  const h1Rec = records.find((r) => r.timeframe === "H1");
  const tfRec = records.find((r) => r.timeframe === timeframe);
  const pgRows = await pgStore.getRecentCandles(symbol, timeframe, 2200);
  const pgD1Rows = await pgStore.getRecentCandles(symbol, "D1", 4200);
  const pgH1Rows = await pgStore.getRecentCandles(symbol, "H1", 1500);
  const mergedRows = tfRec?.rows?.length
    ? [...tfRec.rows.slice(-2000), ...candles.map(normalizeCandleRow).filter(Boolean)].sort((a, b) => a.ts - b.ts)
    : pgRows.length
      ? [...pgRows, ...candles.map(normalizeCandleRow).filter(Boolean)].sort((a, b) => a.ts - b.ts)
      : candles.map(normalizeCandleRow).filter(Boolean);
  const d1ForProfile = pgD1Rows.length
    ? pgD1Rows.slice(-4000)
    : d1Rec?.rows?.length
      ? d1Rec.rows.slice(-4000)
      : [];
  let historyProfile =
    d1ForProfile.length >= 5
      ? buildRichHistoryProfile(d1ForProfile)
      : null;
  if (!historyProfile && d1ForProfile.length >= 30) {
    historyProfile = { legacy: calcHistoryBehaviorStats(d1ForProfile), windows: null, trendContext: null };
  }
  const h1ForTrend =
    pgH1Rows.length >= 20 ? pgH1Rows : h1Rec?.rows?.length ? h1Rec.rows.slice(-800) : [];
  const trendContext = computeTrendContext(d1ForProfile, mergedRows, h1ForTrend);
  if (historyProfile && typeof historyProfile === "object") {
    historyProfile.trendContext = trendContext;
  }
  const smcContext = buildSmcContext(mergedRows);

  // Extra context for DeepSeek: expected D1 stretch zones + clustered SL levels.
  const d1ExpectedZones = (() => {
    if (!historyProfile || !historyProfile.windows) return null;
    if (!Array.isArray(d1ForProfile) || !d1ForProfile.length) return null;
    const d1Sorted = d1ForProfile.slice().sort((a, b) => a.ts - b.ts);
    const lastD1 = d1Sorted[d1Sorted.length - 1];
    const todayOpen = Number(lastD1?.open);
    if (!Number.isFinite(todayOpen) || todayOpen <= 0) return null;
    const w =
      historyProfile.windows.last30 ||
      historyProfile.windows.last15 ||
      historyProfile.windows.last60 ||
      historyProfile.windows.all ||
      null;
    if (!w?.openToHighPct || !w?.openToLowPct) return null;
    const hiAvgPct = Number(w.openToHighPct?.avg);
    const hiMinPct = Number(w.openToHighPct?.min);
    const hiMaxPct = Number(w.openToHighPct?.max);
    const loAvgPct = Number(w.openToLowPct?.avg);
    const loMinPct = Number(w.openToLowPct?.min);
    const loMaxPct = Number(w.openToLowPct?.max);
    if (![hiAvgPct, hiMinPct, hiMaxPct, loAvgPct, loMinPct, loMaxPct].every((x) => Number.isFinite(x))) return null;
    return {
      window: w.label || null,
      todayOpen,
      expectedHigh: {
        avg: todayOpen * (1 + hiAvgPct / 100),
        min: todayOpen * (1 + hiMinPct / 100),
        max: todayOpen * (1 + hiMaxPct / 100)
      },
      expectedLow: {
        avg: todayOpen * (1 - loAvgPct / 100),
        min: todayOpen * (1 - loMaxPct / 100),
        max: todayOpen * (1 - loMinPct / 100)
      }
    };
  })();

  const openPositionsRisk = (() => {
    const list = Array.isArray(openPositions) ? openPositions.slice(0, 20) : [];
    const bid = Number(payload?.bid);
    const ask = Number(payload?.ask);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
    const out = [];
    for (const p of list) {
      const side = String(p?.side || "").toUpperCase();
      const sl = Number(p?.sl || 0);
      const entry = Number(p?.entry || 0);
      const tp = Number(p?.tp || 0);
      const profit = Number(p?.profit || 0);
      if (!Number.isFinite(sl) || sl <= 0) continue;
      let distToSL = null;
      if (side === "BUY") distToSL = bid - sl;
      if (side === "SELL") distToSL = sl - ask;
      if (!Number.isFinite(distToSL) || distToSL < 0) continue;
      const distToSLPct = distToSL / Math.max(ask, bid, 1e-9);
      out.push({
        side,
        entry,
        sl,
        tp: Number.isFinite(tp) && tp > 0 ? tp : null,
        profit: Number.isFinite(profit) ? profit : null,
        distToSL,
        distToSLPct
      });
    }
    return out.length ? out : null;
  })();

  const slCluster = (() => {
    const bid = Number(payload?.bid);
    const ask = Number(payload?.ask);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
    const slPrices = (Array.isArray(openPositions) ? openPositions : [])
      .map((p) => Number(p?.sl || 0))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (slPrices.length < 2) return null;
    const minDistPrice = computeMinStopDistancePrice(mergedRows);
    const tol = Math.max(envNum("MT4_SL_CLUSTER_TOL_PRICE", 0.5), (minDistPrice || 1) * envNum("MT4_SL_CLUSTER_TOL_MULT", 0.25));
    const sorted = slPrices.slice().sort((a, b) => a - b);
    const clusters = [];
    for (const sl of sorted) {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(sl - last.center) > tol) {
        clusters.push({ center: sl, count: 1 });
      } else {
        last.center = (last.center * last.count + sl) / (last.count + 1);
        last.count += 1;
      }
    }
    const centers = clusters.map((c) => ({
      price: c.center,
      count: c.count,
      distFromBidPct: Math.abs(bid - c.center) / Math.max(bid, 1e-9)
    }));
    return { tol, clusters: centers.sort((a, b) => b.count - a.count) };
  })();

  const pythonSmc = await runPythonSmc(mergedRows);
  const pyPriority = String(envStr("MT4_PYTHON_SMC_PRIORITY", "true")).toLowerCase() === "true";
  const pyMinConf = Math.max(0.5, Math.min(0.99, envNum("MT4_PYTHON_SMC_PRIORITY_MIN_CONF", 0.68)));
  if (pyPriority && (!aiFullControl || !hasOpenPositions) && pythonSmc?.ok && pythonSmc?.decision) {
    const pyAction = normalizeAction(pythonSmc.decision.action);
    const pyConf = Math.max(0, Math.min(1, Number(pythonSmc.decision.confidence) || 0));
    if (pyAction !== "WAIT" && pyConf >= pyMinConf) {
      let decision = {
        action: pyAction,
        confidence: pyConf,
        reason: String(pythonSmc.decision.reason || "python_smc_priority").slice(0, 220),
        sl: Number(pythonSmc.decision.sl) || null,
        tp: Number(pythonSmc.decision.tp) || null,
        riskPercent: Number(pythonSmc.decision.riskPercent) > 0 ? Number(pythonSmc.decision.riskPercent) : 0.3
      };
      decision = applyEntryDecisionGuards(decision, payload, mergedRows, trendContext, accountId, symbol, hasOpenPositions);
      recordEntryThrottle(accountId, symbol, decision);
      cache.byKey.set(key, { ts: now, source: "python_smc_priority", decision });
      cache.byPair.set(pairKey, { ts: now, source: "python_smc_priority", decision, latestBarTime });
      return {
        ok: true,
        source: "python_smc_priority",
        cached: false,
        bootstrap: boot,
        trendContext,
        contratrendAdjusted: decision.action !== pyAction,
        decision,
        pythonSmcMeta: {
          source: pythonSmc.source || null,
          fallbackReason: pythonSmc.fallback_reason || null
        }
      };
    }
  }
  const tokenSaver = String(envStr("MT4_TOKEN_SAVER_MODE", "true")).toLowerCase() === "true";
  const tokenSaverActive = tokenSaver && (!aiFullControl || !hasOpenPositions);
  if (tokenSaverActive) {
    const skip = shouldSkipDeepSeek({ ...payload, candles: mergedRows });
    if (skip.skip) {
      const decision = {
        action: "WAIT",
        confidence: 0.25,
        reason: skip.reason,
        sl: null,
        tp: null,
        riskPercent: 0.2
      };
      cache.byKey.set(key, { ts: now, source: "token_saver_guard", decision });
      cache.byPair.set(pairKey, { ts: now, source: "token_saver_guard", decision, latestBarTime });
      return {
        ok: true,
        source: "token_saver_guard",
        cached: false,
        bootstrap: boot,
        decision
      };
    }
  }
  const ai = await callDeepSeekGoldDecision({
    ...payload,
    candles: mergedRows,
    historyProfile,
    trendContext,
    smcContext,
    slCluster,
    openPositionsRisk,
    d1ExpectedZones,
    pythonSmc
  });
  let decision = ai.decision || quickFallbackDecision(payload);
  const actionBeforeGuard = normalizeAction(decision.action);
  decision = applyEntryDecisionGuards(decision, payload, mergedRows, trendContext, accountId, symbol, hasOpenPositions);
  recordEntryThrottle(accountId, symbol, decision);
  cache.byKey.set(key, { ts: now, source: ai.source || "fallback", decision });
  cache.byPair.set(pairKey, { ts: now, source: ai.source || "fallback", decision, latestBarTime });

  return {
    ok: true,
    source: ai.source || "fallback",
    cached: false,
    bootstrap: boot,
    trendContext,
    contratrendAdjusted: decision.action !== actionBeforeGuard,
    decision
  };
}

async function uploadGoldHistory(payload = {}) {
  const symbol = String(payload.symbol || "").toUpperCase();
  if (symbol !== "XAUUSD") {
    return { ok: false, code: 400, message: "Only XAUUSD is enabled in MT4 MVP" };
  }
  const timeframe = String(payload.timeframe || "D1").toUpperCase();
  const accountId = isGlobalHistoryMode() ? "global" : String(payload.accountId || "default");
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
  const maxRows = Math.max(4000, envNum("MT4_GOLD_HISTORY_MAX_ROWS", 1500000));
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
  const computed = await computeBootstrapStatus(accountId, symbol);
  const completed = Boolean(prevBoot.completed) || (timeframe === "D1" && (doneFlag || computed.currentRows >= targetRows));
  cache.bootstrapByAccountSymbol.set(asKey, {
    targetRows,
    completed,
    mode,
    updatedAt: new Date().toISOString()
  });
  saveStoreSoon();
  await pgStore.upsertCandles(symbol, timeframe, rec.rows.slice(-Math.min(5000, normalized.length + 200)));
  await pgStore.saveBootstrapState(symbol, targetRows, completed, mode);
  const bootstrap = await computeBootstrapStatus(accountId, symbol);

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
    globalHistoryMode: isGlobalHistoryMode(),
    bootstrap
  };
}

async function getGoldHistoryStatus(accountId = "default", symbol = "XAUUSD") {
  const effectiveAccountId = isGlobalHistoryMode() ? "global" : accountId;
  const records = listHistoryRecords(effectiveAccountId, symbol);
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
  const pgRows = await pgStore.getHistoryStatus(String(symbol || "XAUUSD").toUpperCase());
  const combinedRows = (Array.isArray(pgRows) && pgRows.length) ? pgRows : rows;
  return {
    rows: combinedRows,
    bootstrap: await computeBootstrapStatus(effectiveAccountId, symbol),
    globalHistoryMode: isGlobalHistoryMode(),
    sync: {
      persistence: pgStore.enabled() ? "postgres+disk_file" : "disk_file",
      persistedAt: cache.persistedAt || null,
      storeFile: STORE_FILE
    }
  };
}

async function getGoldSyncState(symbol = "XAUUSD", timeframe = "D1", accountId = "default") {
  const s = String(symbol || "XAUUSD").toUpperCase();
  const tf = String(timeframe || "D1").toUpperCase();
  const pg = await pgStore.getSyncState(s, tf);
  if (pg.lastTsMs) return { ...pg, source: "postgres" };
  const key = historyKey(accountId, s, tf);
  const rows = cache.historyByKey.get(key)?.rows || [];
  const lastTsMs = rows.length ? Number(rows[rows.length - 1].ts || 0) : null;
  return {
    lastTsMs,
    totalRows: rows.length,
    source: "memory"
  };
}

async function getGoldHistoryRows(accountId = "default", symbol = "XAUUSD", timeframe = "M5", limit = 2000) {
  const effectiveAccountId = isGlobalHistoryMode() ? "global" : String(accountId || "default");
  const s = String(symbol || "XAUUSD").toUpperCase();
  const tf = String(timeframe || "M5").toUpperCase();
  const n = Math.max(20, Math.min(Number(limit) || 2000, 10000));
  const pgStatusAll = await pgStore.getHistoryStatus(s);
  const tfMeta = Array.isArray(pgStatusAll) ? pgStatusAll.find((x) => String(x.timeframe).toUpperCase() === tf) : null;
  const pgRows = await pgStore.getRecentCandles(s, tf, n);
  if (Array.isArray(pgRows) && pgRows.length) {
    return {
      symbol: s,
      timeframe: tf,
      rows: pgRows,
      source: "postgres",
      meta: {
        requestedLimit: n,
        returnedRows: pgRows.length,
        totalRowsInDb: tfMeta ? Number(tfMeta.totalRows) || 0 : pgRows.length,
        rangeFrom: tfMeta?.from || pgRows[0]?.time || null,
        rangeTo: tfMeta?.to || pgRows[pgRows.length - 1]?.time || null
      }
    };
  }
  const key = historyKey(effectiveAccountId, s, tf);
  const rows = cache.historyByKey.get(key)?.rows || [];
  const sliced = rows.slice(-n);
  return {
    symbol: s,
    timeframe: tf,
    rows: sliced,
    source: "memory",
    meta: {
      requestedLimit: n,
      returnedRows: sliced.length,
      totalRowsInDb: rows.length,
      rangeFrom: rows[0]?.time || null,
      rangeTo: rows[rows.length - 1]?.time || null
    }
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
  saveStoreSoon();
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
  getGoldSyncState,
  getGoldHistoryRows,
  runPythonSmc
};

loadStoreFromDisk();

