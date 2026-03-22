const { COIN_UNIVERSE } = require("../../config/constants.js");
const { getBinanceFuturesSnapshot } = require("./binance-futures-service.js");

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isUsableMarketSnapshot(snapshot) {
  return Boolean(
    snapshot &&
      toNum(snapshot.price, 0) > 0 &&
      typeof snapshot.signal === "string" &&
      typeof snapshot.bias === "string" &&
      Number.isFinite(toNum(snapshot.entry, NaN)) &&
      Number.isFinite(toNum(snapshot.sl, NaN)) &&
      Number.isFinite(toNum(snapshot.tp, NaN))
  );
}

function buildQualityFlags(snapshot) {
  const price = toNum(snapshot?.price, 0);
  const funding = toNum(snapshot?.funding, NaN);
  const oi = toNum(snapshot?.oi, NaN);
  const c5 = toNum(snapshot?.change5m, NaN);
  const c15 = toNum(snapshot?.change15m, NaN);
  const c1 = toNum(snapshot?.change1h, NaN);
  const c4 = toNum(snapshot?.change4h, NaN);

  return {
    hasPrice: price > 0,
    hasFunding: Number.isFinite(funding),
    hasOi: Number.isFinite(oi) && oi > 0,
    hasChange5m: Number.isFinite(c5),
    hasChange15m: Number.isFinite(c15),
    hasChange1h: Number.isFinite(c1),
    hasChange4h: Number.isFinite(c4),
    hasSignal: typeof snapshot?.signal === "string" && snapshot.signal.length > 0,
    hasBias: typeof snapshot?.bias === "string" && snapshot.bias.length > 0,
    hasTradeLevels:
      Number.isFinite(toNum(snapshot?.entry, NaN)) &&
      Number.isFinite(toNum(snapshot?.sl, NaN)) &&
      Number.isFinite(toNum(snapshot?.tp, NaN))
  };
}

function buildQualityScore(flags) {
  let score = 0;

  if (flags.hasPrice) score += 25;
  if (flags.hasFunding) score += 10;
  if (flags.hasOi) score += 15;
  if (flags.hasChange5m) score += 8;
  if (flags.hasChange15m) score += 8;
  if (flags.hasChange1h) score += 8;
  if (flags.hasChange4h) score += 8;
  if (flags.hasSignal) score += 8;
  if (flags.hasBias) score += 5;
  if (flags.hasTradeLevels) score += 5;

  return Math.min(score, 100);
}

function classifyQuality(score) {
  if (score >= 90) return "Full";
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  if (score >= 20) return "Low";
  return "Insufficient";
}

function buildSnapshotQualityReport(meta, snapshot, errorMessage = "") {
  const flags = buildQualityFlags(snapshot);
  const score = buildQualityScore(flags);
  const quality = classifyQuality(score);

  return {
    symbol: meta?.symbol || "--",
    key: meta?.key || "",
    chain: meta?.chain || "",
    source: snapshot?.source || "unknown",
    futuresSymbol: snapshot?.futuresSymbol || "",
    usable: isUsableMarketSnapshot(snapshot),
    quality,
    qualityScore: score,
    flags,
    error: errorMessage || "",
    price: toNum(snapshot?.price, 0),
    funding: toNum(snapshot?.funding, 0),
    oi: toNum(snapshot?.oi, 0)
  };
}

async function checkSingleSymbolQuality(meta) {
  try {
    const snapshot = await getBinanceFuturesSnapshot(meta.symbol);
    return buildSnapshotQualityReport(meta, snapshot, "");
  } catch (err) {
    return buildSnapshotQualityReport(
      meta,
      {
        source: "binance-futures-error",
        price: 0,
        funding: 0,
        oi: 0,
        signal: "",
        bias: "",
        entry: NaN,
        sl: NaN,
        tp: NaN
      },
      err.message
    );
  }
}

async function buildBinanceCoverageReport() {
  const reports = [];

  for (const meta of COIN_UNIVERSE) {
    const report = await checkSingleSymbolQuality(meta);
    reports.push(report);
  }

  const summary = {
    total: reports.length,
    usable: reports.filter((r) => r.usable).length,
    full: reports.filter((r) => r.quality === "Full").length,
    high: reports.filter((r) => r.quality === "High").length,
    medium: reports.filter((r) => r.quality === "Medium").length,
    low: reports.filter((r) => r.quality === "Low").length,
    insufficient: reports.filter((r) => r.quality === "Insufficient").length
  };

  return {
    summary,
    items: reports
  };
}

module.exports = {
  toNum,
  isUsableMarketSnapshot,
  buildQualityFlags,
  buildQualityScore,
  classifyQuality,
  buildSnapshotQualityReport,
  checkSingleSymbolQuality,
  buildBinanceCoverageReport
};
