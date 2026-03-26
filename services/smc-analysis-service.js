const https = require("https");

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Titan-AI-Hub/1.0"
          }
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data || "[]");
              if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
                resolve(parsed);
                return;
              }
              reject(new Error(parsed?.msg || `Binance request failed: ${res.statusCode}`));
            } catch (err) {
              reject(new Error(`Invalid JSON from Binance: ${err.message}`));
            }
          });
        }
      )
      .on("error", reject);
  });
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

function computeAtr(candles, period = 14) {
  if (!candles.length) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    trs.push(tr);
  }
  const tail = trs.slice(-Math.max(1, period));
  return mean(tail);
}

function detectEqualLevels(candles, lookback = 30, toleranceRatio = 0.0006) {
  const tail = candles.slice(-lookback);
  if (tail.length < 6) {
    return { equalHighs: [], equalLows: [] };
  }
  const highs = tail.map((c) => c.high);
  const lows = tail.map((c) => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const highBand = maxHigh * toleranceRatio;
  const lowBand = Math.max(1e-12, Math.abs(minLow) * toleranceRatio);

  const equalHighs = tail.filter((c) => Math.abs(c.high - maxHigh) <= highBand).map((c) => c.high);
  const equalLows = tail.filter((c) => Math.abs(c.low - minLow) <= lowBand).map((c) => c.low);

  return {
    equalHighs: equalHighs.length >= 2 ? equalHighs : [],
    equalLows: equalLows.length >= 2 ? equalLows : []
  };
}

function analyzeSmc(candles) {
  const n = candles.length;
  if (n < 30) {
    return {
      summary: "Insufficient candles for SMC scan",
      scores: {},
      signals: {},
      notes: ["Need at least 30 candles"]
    };
  }

  const last = candles[n - 1];
  const prev = candles[n - 2];
  const last20 = candles.slice(-21, -1);
  const highs20 = last20.map((c) => c.high);
  const lows20 = last20.map((c) => c.low);
  const refHigh = highs20.length ? Math.max(...highs20) : prev.high;
  const refLow = lows20.length ? Math.min(...lows20) : prev.low;

  const sweepHigh = last.high > refHigh && last.close < refHigh;
  const sweepLow = last.low < refLow && last.close > refLow;

  const bosUp = last.close > refHigh;
  const bosDown = last.close < refLow;

  const closeDiffs = candles.slice(-40).map((c, i, arr) => (i === 0 ? 0 : c.close - arr[i - 1].close)).slice(1);
  const drift = mean(closeDiffs);
  const chochUp = drift < 0 && bosUp;
  const chochDown = drift > 0 && bosDown;

  const atr = computeAtr(candles, 14);
  const body = Math.abs(last.close - last.open);
  const displacementRatio = atr > 0 ? body / atr : 0;
  const displacement = displacementRatio >= 1.2;

  let fvgBull = false;
  let fvgBear = false;
  if (n >= 3) {
    const c1 = candles[n - 3];
    const c3 = candles[n - 1];
    fvgBull = c1.high < c3.low;
    fvgBear = c1.low > c3.high;
  }

  const eq = detectEqualLevels(candles, 40, 0.0008);
  const liquidityPoolScore = Math.min(
    100,
    (eq.equalHighs.length ? 22 : 0) +
      (eq.equalLows.length ? 22 : 0) +
      (sweepHigh || sweepLow ? 26 : 0) +
      (bosUp || bosDown ? 15 : 0) +
      (displacement ? 15 : 0)
  );
  const sweepScore = sweepHigh || sweepLow ? 80 : 20;

  const notes = [];
  if (eq.equalHighs.length) notes.push("Equal highs detected (possible buy-side liquidity pool)");
  if (eq.equalLows.length) notes.push("Equal lows detected (possible sell-side liquidity pool)");
  if (sweepHigh) notes.push("Latest candle swept previous highs then closed back below");
  if (sweepLow) notes.push("Latest candle swept previous lows then closed back above");
  if (chochUp) notes.push("CHoCH up: structure appears to flip bullish");
  if (chochDown) notes.push("CHoCH down: structure appears to flip bearish");
  if (displacement) notes.push(`Displacement candle detected (body/ATR=${displacementRatio.toFixed(2)})`);
  if (fvgBull) notes.push("Bullish FVG pattern seen in last 3 candles");
  if (fvgBear) notes.push("Bearish FVG pattern seen in last 3 candles");

  const label = sweepHigh
    ? "Sweep high risk then potential downside continuation/reversal"
    : sweepLow
      ? "Sweep low risk then potential upside continuation/reversal"
      : bosUp
        ? "Breakout structure up"
        : bosDown
          ? "Breakout structure down"
          : "No strong SMC event";

  return {
    summary: label,
    scores: {
      liquidityPoolScore: Math.round(liquidityPoolScore),
      sweepScore: Math.round(sweepScore),
      displacementScore: Math.round(Math.max(0, Math.min(100, displacementRatio * 55)))
    },
    signals: {
      sweepHigh,
      sweepLow,
      bosUp,
      bosDown,
      chochUp,
      chochDown,
      displacement,
      fvgBull,
      fvgBear
    },
    reference: {
      refHigh,
      refLow,
      atr
    },
    notes: notes.length ? notes : ["No major SMC trigger on latest candle"]
  };
}

async function runSmcScan({ symbol = "BTCUSDT", interval = "15m", limit = 220 } = {}) {
  const sym = String(symbol || "BTCUSDT").toUpperCase();
  const intv = String(interval || "15m");
  const safeLimit = Math.max(60, Math.min(Number(limit) || 220, 220000));
  const chunkLimit = 1500;
  const merged = [];
  let endTime = Date.now();

  while (merged.length < safeLimit) {
    const rest = safeLimit - merged.length;
    const qLimit = Math.max(1, Math.min(chunkLimit, rest));
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(
      sym
    )}&interval=${encodeURIComponent(intv)}&limit=${qLimit}&endTime=${endTime}`;
    const part = await getJson(url);
    if (!Array.isArray(part) || !part.length) break;
    merged.push(...part);
    const firstOpenTime = Number(part[0]?.[0] || 0);
    if (!firstOpenTime) break;
    endTime = firstOpenTime - 1;
    if (part.length < qLimit) break;
  }

  if (!merged.length) {
    throw new Error("No kline data from Binance");
  }

  const candles = merged
    .filter((row) => Array.isArray(row) && row.length >= 6)
    .map((row) => ({
      openTime: Number(row[0]),
      open: toNum(row[1]),
      high: toNum(row[2]),
      low: toNum(row[3]),
      close: toNum(row[4]),
      volume: toNum(row[5]),
      closeTime: Number(row[6] || 0)
    }))
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-safeLimit);

  const smc = analyzeSmc(candles.slice(-5000));

  const maxChartBars = 12000;
  let chartCandles = candles;
  let compressed = false;
  if (candles.length > maxChartBars) {
    compressed = true;
    const bucket = Math.ceil(candles.length / maxChartBars);
    const reduced = [];
    for (let i = 0; i < candles.length; i += bucket) {
      const grp = candles.slice(i, i + bucket);
      if (!grp.length) continue;
      const first = grp[0];
      const last = grp[grp.length - 1];
      const high = Math.max(...grp.map((x) => Number(x.high)));
      const low = Math.min(...grp.map((x) => Number(x.low)));
      const volume = grp.reduce((acc, x) => acc + Number(x.volume || 0), 0);
      reduced.push({
        openTime: first.openTime,
        open: first.open,
        high,
        low,
        close: last.close,
        volume,
        closeTime: last.closeTime
      });
    }
    chartCandles = reduced;
  }
  return {
    ok: true,
    source: "binance-futures",
    symbol: sym,
    interval: intv,
    candlesCount: chartCandles.length,
    rawCandlesCount: candles.length,
    compressed,
    smc,
    candles: chartCandles
  };
}

module.exports = {
  runSmcScan
};
