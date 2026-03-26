(() => {
  const elements = {
    smcSymbolSelect: document.getElementById("smcSymbolSelect"),
    smcCustomSymbolInput: document.getElementById("smcCustomSymbolInput"),
    smcApplyCustomBtn: document.getElementById("smcApplyCustomBtn"),
    smcIntervalSelect: document.getElementById("smcIntervalSelect"),
    smcRunBtn: document.getElementById("smcRunBtn"),
    smcLiveToggleBtn: document.getElementById("smcLiveToggleBtn"),
    smcStatus: document.getElementById("smcStatus"),
    smcSummaryCards: document.getElementById("smcSummaryCards"),
    smcPriceLevelsCards: document.getElementById("smcPriceLevelsCards"),
    smcConsensusCards: document.getElementById("smcConsensusCards"),
    smcOrderMetricsCards: document.getElementById("smcOrderMetricsCards"),
    smcNotesBody: document.getElementById("smcNotesBody"),
    smcSrBody: document.getElementById("smcSrBody"),
    smcTfSummaryBody: document.getElementById("smcTfSummaryBody")
  };

  const state = {
    chart: null,
    candleSeries: null,
    lineRefHigh: null,
    lineRefLow: null,
    srSeries: [],
    liveEnabled: true,
    ws: null,
    liveSymbol: null,
    liveInterval: null,
    runInFlight: false,
    tfSummaryRows: [],
    tfSummaryKey: "",
    tfSummaryAt: 0
  };

  function fmt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPrice(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    const ax = Math.abs(x);
    let maxDigits = 2;
    if (ax < 100) maxDigits = 4;
    if (ax < 1) maxDigits = 6;
    if (ax < 0.01) maxDigits = 8;
    return x.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDigits
    });
  }

  function getAuthHeader() {
    try {
      const raw = localStorage.getItem("titan_hub_auth_v1");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const token = parsed?.token;
      if (!token) return {};
      return { Authorization: `Bearer ${token}` };
    } catch (_) {
      return {};
    }
  }

  function normalizePairInput(raw) {
    const s = String(raw || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!s) return "";
    return s.endsWith("USDT") ? s : `${s}USDT`;
  }

  function intervalTargetBars(interval) {
    const i = String(interval || "").toLowerCase();
    if (i === "1m") return 90 * 24 * 60; // 90 days
    if (i === "5m") return 2 * 365 * 24 * 12; // 2 years
    if (i === "1h") return 4 * 365 * 24; // 4 years
    if (i === "4h") return 5 * 365 * 6; // 5 years
    if (i === "1d") return 8 * 365; // 8 years
    return 2000;
  }

  function sanitizeSrLevels(levels, lastClose) {
    if (!Array.isArray(levels) || !levels.length || !Number.isFinite(Number(lastClose)) || Number(lastClose) <= 0) return [];
    const px = Number(lastClose);
    const nearBand = px * 0.22; // Keep only nearby regime levels for clearer/professional charting
    return levels
      .filter((lv) => Number.isFinite(Number(lv?.price)))
      .map((lv) => ({
        price: Number(lv.price),
        count: Number(lv.count) || 0,
        side: String(lv.side || "").toLowerCase() === "support" ? "support" : "resistance"
      }))
      .filter((lv) => Math.abs(lv.price - px) <= nearBand)
      .filter((lv) => (lv.side === "support" ? lv.price <= px * 1.02 : lv.price >= px * 0.98))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }

  function renderSummary(payload) {
    if (!elements.smcSummaryCards) return;
    const smc = payload?.smc || {};
    const scores = smc.scores || {};
    const summary = String(smc.summary || "--");
    elements.smcSummaryCards.innerHTML = `
      <div class="stat-card"><span>Signal</span><strong>${summary}</strong></div>
      <div class="stat-card"><span>Liquidity Pool Score</span><strong>${fmt(scores.liquidityPoolScore)}</strong></div>
      <div class="stat-card"><span>Sweep Score</span><strong>${fmt(scores.sweepScore)}</strong></div>
      <div class="stat-card"><span>Displacement Score</span><strong>${fmt(scores.displacementScore)}</strong></div>
    `;
  }

  function renderConsensus(payload) {
    if (!elements.smcConsensusCards) return;
    const c = payload?.consensus || {};
    const bs = payload?.buySell || {};
    const biasCls =
      String(c.bias || "").toLowerCase() === "bullish"
        ? "pos"
        : String(c.bias || "").toLowerCase() === "bearish"
          ? "neg"
          : "flat";
    const scoreCls = Number(c.score) >= 0 ? "pos" : "neg";
    const buyRatioPct = Number.isFinite(Number(bs.buyRatio)) ? `${(Number(bs.buyRatio) * 100).toFixed(2)}%` : "--";
    const buyVolText = Number.isFinite(Number(bs.buyVolume)) ? fmt(bs.buyVolume) : "--";
    const sellVolText = Number.isFinite(Number(bs.sellVolume)) ? fmt(bs.sellVolume) : "--";
    elements.smcConsensusCards.innerHTML = `
      <div class="stat-card"><span>Bias</span><strong class="${biasCls}">${String(c.bias || "--")}</strong></div>
      <div class="stat-card"><span>Score</span><strong class="${scoreCls}">${fmt(c.score)}</strong></div>
      <div class="stat-card"><span>Confidence</span><strong>${fmt(c.confidence)}%</strong></div>
      <div class="stat-card"><span>Buy Ratio</span><strong>${buyRatioPct}</strong></div>
      <div class="stat-card"><span>Buy Volume</span><strong class="pos">${buyVolText}</strong></div>
      <div class="stat-card"><span>Sell Volume</span><strong class="neg">${sellVolText}</strong></div>
    `;
  }

  function renderOrderMetrics(payload) {
    if (!elements.smcOrderMetricsCards) return;
    const a = payload?.averages || {};
    const fmtPx = (v) => (Number.isFinite(Number(v)) ? fmtPrice(v) : "--");
    elements.smcOrderMetricsCards.innerHTML = `
      <div class="stat-card"><span>TP Buy avg</span><strong class="pos">${fmtPx(a.tpBuy)}</strong></div>
      <div class="stat-card"><span>SL Buy avg</span><strong class="neg">${fmtPx(a.slBuy)}</strong></div>
      <div class="stat-card"><span>TP Sell avg</span><strong class="pos">${fmtPx(a.tpSell)}</strong></div>
      <div class="stat-card"><span>SL Sell avg</span><strong class="neg">${fmtPx(a.slSell)}</strong></div>
    `;
  }

  function renderNotes(payload) {
    const body = elements.smcNotesBody;
    if (!body) return;
    const notes = Array.isArray(payload?.smc?.notes) ? payload.smc.notes : [];
    if (!notes.length) {
      body.innerHTML = `<tr><td>No notes</td></tr>`;
      return;
    }
    body.innerHTML = notes.map((n) => `<tr><td>${String(n)}</td></tr>`).join("");
  }

  function renderCandles(_payload) {}

  function renderPriceLevels(payload) {
    if (!elements.smcPriceLevelsCards) return;
    const rows = Array.isArray(payload?.candles) ? payload.candles : [];
    const lastClose = Number(rows[rows.length - 1]?.close);
    const refHigh = Number(payload?.smc?.reference?.refHigh);
    const refLow = Number(payload?.smc?.reference?.refLow);
    const atr = Number(payload?.smc?.reference?.atr);
    const levels = sanitizeSrLevels(payload?.srLevels || [], lastClose);
    const nearestResistance = levels
      .filter((lv) => lv.side === "resistance" && lv.price >= lastClose)
      .sort((a, b) => a.price - b.price)[0];
    const nearestSupport = levels
      .filter((lv) => lv.side === "support" && lv.price <= lastClose)
      .sort((a, b) => b.price - a.price)[0];
    const sweepHigh = Number.isFinite(refHigh) ? refHigh * 1.001 : NaN;
    const sweepLow = Number.isFinite(refLow) ? refLow * 0.999 : NaN;

    elements.smcPriceLevelsCards.innerHTML = `
      <div class="stat-card"><span>Last Price</span><strong>${fmtPrice(lastClose)}</strong></div>
      <div class="stat-card"><span>Ref High</span><strong class="neg">${fmtPrice(refHigh)}</strong></div>
      <div class="stat-card"><span>Ref Low</span><strong class="pos">${fmtPrice(refLow)}</strong></div>
      <div class="stat-card"><span>ATR</span><strong>${fmtPrice(atr)}</strong></div>
      <div class="stat-card"><span>Nearest Resistance</span><strong class="neg">${fmtPrice(nearestResistance?.price)}</strong></div>
      <div class="stat-card"><span>Nearest Support</span><strong class="pos">${fmtPrice(nearestSupport?.price)}</strong></div>
      <div class="stat-card"><span>Sweep High Zone (SL hunt)</span><strong class="neg">${fmtPrice(sweepHigh)}</strong></div>
      <div class="stat-card"><span>Sweep Low Zone (SL hunt)</span><strong class="pos">${fmtPrice(sweepLow)}</strong></div>
    `;
  }

  function clearSrLines() {
    if (!state.chart) return;
    state.srSeries.forEach((s) => {
      try {
        state.chart.removeSeries(s);
      } catch (_) {}
    });
    state.srSeries = [];
  }

  function computeHistoricalSrLevels(candles) {
    if (!Array.isArray(candles) || candles.length < 40) return [];
    const highs = [];
    const lows = [];
    const wing = 2;
    for (let i = wing; i < candles.length - wing; i += 1) {
      const cur = candles[i];
      const prev = candles.slice(i - wing, i);
      const next = candles.slice(i + 1, i + wing + 1);
      const highIsPivot =
        prev.every((x) => Number(cur.high) > Number(x.high)) &&
        next.every((x) => Number(cur.high) >= Number(x.high));
      const lowIsPivot =
        prev.every((x) => Number(cur.low) < Number(x.low)) &&
        next.every((x) => Number(cur.low) <= Number(x.low));
      if (highIsPivot) highs.push(Number(cur.high));
      if (lowIsPivot) lows.push(Number(cur.low));
    }

    const lastClose = Number(candles[candles.length - 1]?.close || 0);
    const mergeTolerance = Math.max(lastClose * 0.0012, 1e-9); // ~0.12%
    function cluster(values, side) {
      const sorted = [...values].sort((a, b) => a - b);
      const clusters = [];
      for (const v of sorted) {
        const c = clusters.find((x) => Math.abs(x.price - v) <= mergeTolerance);
        if (c) {
          c.count += 1;
          c.price = (c.price * (c.count - 1) + v) / c.count;
        } else {
          clusters.push({ price: v, count: 1, side });
        }
      }
      return clusters.filter((c) => c.count >= 2);
    }

    const merged = [...cluster(highs, "resistance"), ...cluster(lows, "support")]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return merged;
  }

  function renderSrTable(levels) {
    const body = elements.smcSrBody;
    if (!body) return;
    if (!levels.length) {
      body.innerHTML = `<tr><td colspan="4">No strong historical SR levels found</td></tr>`;
      return;
    }
    body.innerHTML = levels
      .map(
        (lv, i) => `<tr>
          <td>SR-${i + 1}</td>
          <td class="${lv.side === "support" ? "pos" : "neg"}">${fmtPrice(lv.price)}</td>
          <td>${lv.count}</td>
          <td class="${lv.side === "support" ? "pos" : "neg"}">${lv.side === "support" ? "Support" : "Resistance"}</td>
        </tr>`
      )
      .join("");
  }

  function renderTfSummaryTable(rows) {
    const body = elements.smcTfSummaryBody;
    if (!body) return;
    if (!Array.isArray(rows) || !rows.length) {
      body.innerHTML = `<tr><td colspan="5">No strong multi-timeframe confluence found</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (r, i) => `<tr>
          <td>C-${i + 1}</td>
          <td class="${r.side === "support" ? "pos" : "neg"}">${fmtPrice(r.price)}</td>
          <td>${r.timeframes.join(", ")}</td>
          <td class="${r.side === "support" ? "pos" : "neg"}">${r.side === "support" ? "Support" : "Resistance"}</td>
          <td>${fmt(r.totalTouches)}</td>
        </tr>`
      )
      .join("");
  }

  function buildTfConfluence(rows, lastClose) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const px = Number(lastClose);
    const mergeTol = Number.isFinite(px) && px > 0 ? px * 0.0025 : 0.5; // 0.25%
    const nearBand = Number.isFinite(px) && px > 0 ? px * 0.2 : Number.POSITIVE_INFINITY;
    const buckets = [];
    for (const row of rows) {
      if (!Number.isFinite(row.price)) continue;
      if (Math.abs(row.price - px) > nearBand) continue;
      const found = buckets.find((b) => b.side === row.side && Math.abs(b.price - row.price) <= mergeTol);
      if (found) {
        found.count += 1;
        found.price = (found.price * (found.count - 1) + row.price) / found.count;
        found.totalTouches += Number(row.touches || 0);
        found.tfSet.add(row.interval);
      } else {
        buckets.push({
          side: row.side,
          price: row.price,
          count: 1,
          totalTouches: Number(row.touches || 0),
          tfSet: new Set([row.interval])
        });
      }
    }
    return buckets
      .map((b) => ({
        side: b.side,
        price: b.price,
        totalTouches: b.totalTouches,
        timeframes: [...b.tfSet].sort((a, b2) => a.localeCompare(b2))
      }))
      .filter((x) => x.timeframes.length >= 2)
      .sort((a, b) => b.timeframes.length - a.timeframes.length || b.totalTouches - a.totalTouches)
      .slice(0, 10);
  }

  async function loadTfSummary(symbol, lastClose, force = false) {
    const key = `${symbol}`;
    const now = Date.now();
    if (!force && state.tfSummaryKey === key && now - state.tfSummaryAt < 180000 && state.tfSummaryRows.length) {
      renderTfSummaryTable(state.tfSummaryRows);
      return;
    }
    const body = elements.smcTfSummaryBody;
    if (body) body.innerHTML = `<tr><td colspan="5">Loading multi-timeframe confluence...</td></tr>`;
    const tfPlan = [
      { interval: "1m", limit: 1600 },
      { interval: "5m", limit: 1400 },
      { interval: "15m", limit: 1200 },
      { interval: "1h", limit: 1000 },
      { interval: "4h", limit: 900 },
      { interval: "1d", limit: 700 }
    ];
    try {
      const { apiGet } = window.TitanApi;
      const tasks = tfPlan.map(async (p) => {
        const qs = new URLSearchParams({ symbol, interval: p.interval, limit: String(p.limit) });
        const payload = await apiGet(`/smc/scan?${qs.toString()}`);
        const lv = Array.isArray(payload?.srLevels) ? payload.srLevels : [];
        return lv.map((x) => ({
          interval: p.interval,
          side: String(x.side || "").toLowerCase() === "support" ? "support" : "resistance",
          price: Number(x.price),
          touches: Number(x.count || 0)
        }));
      });
      const packs = await Promise.all(tasks);
      const merged = packs.flat();
      const summary = buildTfConfluence(merged, lastClose);
      state.tfSummaryRows = summary;
      state.tfSummaryKey = key;
      state.tfSummaryAt = Date.now();
      renderTfSummaryTable(summary);
    } catch (_) {
      if (body) body.innerHTML = `<tr><td colspan="5">Cannot load multi-timeframe summary now</td></tr>`;
    }
  }

  function closeLiveStream() {
    if (state.ws) {
      try {
        state.ws.close();
      } catch (_) {}
    }
    state.ws = null;
    state.liveSymbol = null;
    state.liveInterval = null;
  }

  function connectLiveStream(symbol, interval) {
    if (!state.liveEnabled) return;
    const sym = String(symbol || "").toLowerCase();
    const intv = String(interval || "");
    if (!sym || !intv) return;
    if (state.ws && state.liveSymbol === sym && state.liveInterval === intv) return;

    closeLiveStream();
    const wsUrl = `wss://fstream.binance.com/ws/${sym}@kline_${intv}`;
    const ws = new WebSocket(wsUrl);
    state.ws = ws;
    state.liveSymbol = sym;
    state.liveInterval = intv;

    ws.onopen = () => {
      if (elements.smcStatus) {
        elements.smcStatus.textContent = `Live stream ON · ${sym.toUpperCase()} ${intv}`;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data || "{}");
        const k = msg?.k;
        if (!k) return;
        // Refresh SMC analysis when a candle closes.
        if (k.x === true && !state.runInFlight) {
          run({ fromStream: true }).catch(() => {});
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      if (elements.smcStatus) {
        elements.smcStatus.textContent = `Live stream error · ${sym.toUpperCase()} ${intv}`;
      }
    };

    ws.onclose = () => {
      if (state.liveEnabled && state.liveSymbol === sym && state.liveInterval === intv) {
        // Auto-reconnect with small backoff
        setTimeout(() => {
          if (state.liveEnabled) connectLiveStream(sym.toUpperCase(), intv);
        }, 1500);
      }
    };
  }

  async function run(opts = {}) {
    if (state.runInFlight) return;
    state.runInFlight = true;
    const symbol = String(elements.smcSymbolSelect?.value || "BTCUSDT").toUpperCase();
    const interval = String(elements.smcIntervalSelect?.value || "15m");
    const lookback = intervalTargetBars(interval);
    if (elements.smcStatus && !opts.fromStream) {
      elements.smcStatus.textContent = `Scanning ${symbol} ${interval}...`;
    }

    try {
      const { apiGet } = window.TitanApi;
      const qs = new URLSearchParams({
        symbol,
        interval,
        limit: String(Math.max(120, Math.min(lookback, 220000)))
      });
      const payload = await apiGet(`/smc/scan?${qs.toString()}`);
      const msPayload = await apiGet(`/multi-source/analysis?${qs.toString()}`);
      let orderMetrics = null;
      try {
        const headers = getAuthHeader();
        orderMetrics = await apiGet(`/multi-source/order-metrics?symbol=${encodeURIComponent(symbol)}`, {
          headers
        });
      } catch (_) {
        orderMetrics = { ok: false };
      }
      renderSummary(payload);
      renderConsensus(msPayload);
      renderOrderMetrics(orderMetrics);
      renderNotes(payload);
      renderCandles(payload);
      const rows = Array.isArray(payload?.candles) ? payload.candles : [];
      const lastClose = Number(rows[rows.length - 1]?.close || 0);
      const srLevels = sanitizeSrLevels(payload?.srLevels || computeHistoricalSrLevels(rows), lastClose);
      renderSrTable(srLevels);
      renderPriceLevels(payload);
      if (!opts.fromStream) {
        await loadTfSummary(symbol, lastClose, true);
      } else {
        renderTfSummaryTable(state.tfSummaryRows);
      }
      if (elements.smcStatus) {
        const start = rows.length ? new Date(rows[0].openTime).toISOString().slice(0, 16).replace("T", " ") : "--";
        const end = rows.length
          ? new Date(rows[rows.length - 1].openTime).toISOString().slice(0, 16).replace("T", " ")
          : "--";
        const raw = Number(payload?.rawCandlesCount || payload?.candlesCount || 0);
        const shown = rows.length;
        const compressNote = payload?.compressed ? " · compressed for chart" : "";
        const analysisBars = Number(payload?.analysisBarsUsed || 0);
        const analysisNote = analysisBars > 0 ? ` · analysis ${analysisBars}` : "";
        elements.smcStatus.textContent = `Source ${payload.source || "--"} · raw ${raw} · shown ${shown}${compressNote}${analysisNote} · range ${start} → ${end}${state.liveEnabled ? " · live ON" : " · live OFF"} · SMC data-only v14`;
      }
      connectLiveStream(symbol, interval);
    } catch (err) {
      if (elements.smcStatus) {
        elements.smcStatus.textContent = `SMC scan failed: ${err.message || "unknown error"}`;
      }
    } finally {
      state.runInFlight = false;
    }
  }

  if (elements.smcRunBtn) {
    elements.smcRunBtn.addEventListener("click", () => {
      run().catch(() => {});
    });
  }
  if (elements.smcSymbolSelect) {
    elements.smcSymbolSelect.addEventListener("change", () => run().catch(() => {}));
  }
  if (elements.smcApplyCustomBtn) {
    elements.smcApplyCustomBtn.addEventListener("click", () => {
      const pair = normalizePairInput(elements.smcCustomSymbolInput?.value || "");
      if (!pair) return;
      if (elements.smcSymbolSelect) {
        const exists = [...elements.smcSymbolSelect.options].some((o) => o.value === pair);
        if (!exists) {
          const opt = document.createElement("option");
          opt.value = pair;
          opt.textContent = pair;
          elements.smcSymbolSelect.appendChild(opt);
        }
        elements.smcSymbolSelect.value = pair;
      }
      run().catch(() => {});
    });
  }
  if (elements.smcCustomSymbolInput) {
    elements.smcCustomSymbolInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.smcApplyCustomBtn?.click();
      }
    });
  }
  if (elements.smcIntervalSelect) {
    elements.smcIntervalSelect.addEventListener("change", () => run().catch(() => {}));
  }
  if (elements.smcLiveToggleBtn) {
    elements.smcLiveToggleBtn.addEventListener("click", () => {
      state.liveEnabled = !state.liveEnabled;
      elements.smcLiveToggleBtn.textContent = `Live: ${state.liveEnabled ? "ON" : "OFF"}`;
      if (state.liveEnabled) {
        run().catch(() => {});
      } else {
        closeLiveStream();
        if (elements.smcStatus) {
          elements.smcStatus.textContent = "Live stream OFF";
        }
      }
    });
  }
  window.addEventListener("beforeunload", () => closeLiveStream());

  run().catch(() => {});
})();
