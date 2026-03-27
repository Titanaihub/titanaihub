const { Pool } = require("pg");

let pool = null;
let schemaReady = false;

function enabled() {
  const hasUrl = Boolean(String(process.env.DATABASE_URL || "").trim());
  const flag = String(process.env.MT4_POSTGRES_ENABLED || "true").toLowerCase() === "true";
  return hasUrl && flag;
}

function getPool() {
  if (!enabled()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: String(process.env.PG_SSL_REQUIRE || "true").toLowerCase() === "true" ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

async function ensureSchema() {
  const p = getPool();
  if (!p || schemaReady) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS mt4_gold_candles (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      ts BIGINT NOT NULL,
      time_iso TEXT NOT NULL,
      open NUMERIC NOT NULL,
      high NUMERIC NOT NULL,
      low NUMERIC NOT NULL,
      close NUMERIC NOT NULL,
      volume NUMERIC NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(symbol, timeframe, ts)
    );
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS mt4_gold_bootstrap_state (
      symbol TEXT PRIMARY KEY,
      target_rows INTEGER NOT NULL DEFAULT 3650,
      completed BOOLEAN NOT NULL DEFAULT false,
      mode TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  schemaReady = true;
}

async function upsertCandles(symbol, timeframe, rows) {
  const p = getPool();
  if (!p || !Array.isArray(rows) || !rows.length) return { ok: false, disabled: true };
  await ensureSchema();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(
        `INSERT INTO mt4_gold_candles(symbol, timeframe, ts, time_iso, open, high, low, close, volume)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT(symbol, timeframe, ts)
         DO UPDATE SET
          time_iso=EXCLUDED.time_iso,
          open=EXCLUDED.open,
          high=EXCLUDED.high,
          low=EXCLUDED.low,
          close=EXCLUDED.close,
          volume=EXCLUDED.volume,
          updated_at=NOW()`,
        [symbol, timeframe, r.ts, r.time, r.open, r.high, r.low, r.close, r.volume || 0]
      );
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    return { ok: false, error: err.message };
  } finally {
    client.release();
  }
}

async function getRecentCandles(symbol, timeframe, limit = 2000) {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const n = Math.max(20, Math.min(Number(limit) || 2000, 10000));
  const r = await p.query(
    `SELECT ts, time_iso, open, high, low, close, volume
     FROM mt4_gold_candles
     WHERE symbol=$1 AND timeframe=$2
     ORDER BY ts DESC
     LIMIT $3`,
    [symbol, timeframe, n]
  );
  return r.rows
    .map((x) => ({
      ts: Number(x.ts),
      time: String(x.time_iso || ""),
      open: Number(x.open),
      high: Number(x.high),
      low: Number(x.low),
      close: Number(x.close),
      volume: Number(x.volume || 0)
    }))
    .reverse();
}

async function getHistoryStatus(symbol) {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const r = await p.query(
    `SELECT timeframe, COUNT(*)::int AS total_rows, MIN(time_iso) AS from_time, MAX(time_iso) AS to_time, MAX(updated_at) AS updated_at
     FROM mt4_gold_candles
     WHERE symbol=$1
     GROUP BY timeframe`,
    [symbol]
  );
  return r.rows.map((x) => ({
    timeframe: String(x.timeframe || ""),
    totalRows: Number(x.total_rows || 0),
    from: x.from_time ? String(x.from_time) : null,
    to: x.to_time ? String(x.to_time) : null,
    updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : null
  }));
}

async function getSyncState(symbol, timeframe) {
  const p = getPool();
  if (!p) return { lastTsMs: null };
  await ensureSchema();
  const r = await p.query(
    `SELECT MAX(ts) AS max_ts, COUNT(*)::int AS total_rows
     FROM mt4_gold_candles
     WHERE symbol=$1 AND timeframe=$2`,
    [symbol, timeframe]
  );
  return {
    lastTsMs: r.rows?.[0]?.max_ts != null ? Number(r.rows[0].max_ts) : null,
    totalRows: r.rows?.[0]?.total_rows != null ? Number(r.rows[0].total_rows) : 0
  };
}

async function saveBootstrapState(symbol, targetRows, completed, mode) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(
    `INSERT INTO mt4_gold_bootstrap_state(symbol, target_rows, completed, mode, updated_at)
     VALUES($1,$2,$3,$4,NOW())
     ON CONFLICT(symbol)
     DO UPDATE SET target_rows=EXCLUDED.target_rows, completed=EXCLUDED.completed, mode=EXCLUDED.mode, updated_at=NOW()`,
    [symbol, targetRows, Boolean(completed), String(mode || "")]
  );
}

async function getBootstrapState(symbol) {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const r = await p.query(
    `SELECT target_rows, completed, mode, updated_at FROM mt4_gold_bootstrap_state WHERE symbol=$1`,
    [symbol]
  );
  if (!r.rows?.length) return null;
  const x = r.rows[0];
  return {
    targetRows: Number(x.target_rows || 3650),
    completed: Boolean(x.completed),
    mode: String(x.mode || ""),
    updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : null
  };
}

module.exports = {
  enabled,
  upsertCandles,
  getRecentCandles,
  getHistoryStatus,
  getSyncState,
  saveBootstrapState,
  getBootstrapState
};

