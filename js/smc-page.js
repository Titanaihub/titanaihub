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
    smcConsensusCards: document.getElementById("smcConsensusCards"),
    smcOrderMetricsCards: document.getElementById("smcOrderMetricsCards"),
    smcNotesBody: document.getElementById("smcNotesBody"),
    smcSrBody: document.getElementById("smcSrBody"),
    smcCandlesBody: document.getElementById("smcCandlesBody"),
    smcChartWrap: document.getElementById("smcChartWrap"),
    smcChart: document.getElementById("smcChart")
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
    runInFlight: false
  };

  function fmt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    return x.toLocaleString("en-US", { maximumFractionDigits: 8 });
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

  function ensureChart() {
    if (!elements.smcChart || !elements.smcChartWrap) return false;
    if (!window.LightweightCharts) return false;
    if (state.chart) return true;

    state.chart = window.LightweightCharts.createChart(elements.smcChart, {
      width: elements.smcChartWrap.clientWidth || 900,
      height: elements.smcChartWrap.clientHeight || 640,
      layout: {
        background: { type: "solid", color: "#0b0e11" },
        textColor: "rgba(228,232,238,0.92)"
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" }
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.14)"
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.14)",
        timeVisible: true
      },
      crosshair: {
        mode: 0
      }
    });

    state.candleSeries = state.chart.addCandlestickSeries({
      upColor: "#0ecb81",
      downColor: "#f6465d",
      borderVisible: false,
      wickUpColor: "#0ecb81",
      wickDownColor: "#f6465d"
    });
    state.lineRefHigh = state.chart.addLineSeries({
      color: "rgba(80, 195, 255, 0.9)",
      lineWidth: 2,
      lineStyle: 2,
      title: "Ref High"
    });
    state.lineRefLow = state.chart.addLineSeries({
      color: "rgba(255, 196, 80, 0.9)",
      lineWidth: 2,
      lineStyle: 2,
      title: "Ref Low"
    });
    return true;
  }

  function resizeChart() {
    if (!state.chart || !elements.smcChartWrap) return;
    const w = Math.max(320, elements.smcChartWrap.clientWidth || 320);
    const h = Math.max(260, elements.smcChartWrap.clientHeight || 260);
    state.chart.applyOptions({ width: w, height: h });
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
      <div class="stat-card"><span>Buy Volume</span><strong>${buyVolText}</strong></div>
      <div class="stat-card"><span>Sell Volume</span><strong>${sellVolText}</strong></div>
    `;
  }

  function renderOrderMetrics(payload) {
    if (!elements.smcOrderMetricsCards) return;
    const a = payload?.averages || {};
    const fmtPx = (v) => (Number.isFinite(Number(v)) ? fmt(v) : "--");
    elements.smcOrderMetricsCards.innerHTML = `
      <div class="stat-card"><span>TP Buy avg</span><strong>${fmtPx(a.tpBuy)}</strong></div>
      <div class="stat-card"><span>SL Buy avg</span><strong>${fmtPx(a.slBuy)}</strong></div>
      <div class="stat-card"><span>TP Sell avg</span><strong>${fmtPx(a.tpSell)}</strong></div>
      <div class="stat-card"><span>SL Sell avg</span><strong>${fmtPx(a.slSell)}</strong></div>
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
          <td>${fmt(lv.price)}</td>
          <td>${lv.count}</td>
          <td>${lv.side === "support" ? "Support" : "Resistance"}</td>
        </tr>`
      )
      .join("");
  }

  function renderChart(payload, options = {}) {
    const shouldFit = options.fit === true;
    if (!ensureChart()) {
      if (elements.smcStatus) {
        elements.smcStatus.textContent = "Chart library not loaded. Table data is still available.";
      }
      return;
    }
    const rows = Array.isArray(payload?.candles) ? payload.candles : [];
    if (!rows.length) return;

    const chartRows = rows
      .map((c) => ({
        time: Math.floor(Number(c.openTime || 0) / 1000),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume)
      }))
      .filter(
        (c) =>
          Number.isFinite(c.time) &&
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
      );

    state.candleSeries.setData(chartRows);
    const lastTime = chartRows.length ? chartRows[chartRows.length - 1].time : null;

    const refHigh = Number(payload?.smc?.reference?.refHigh);
    const refLow = Number(payload?.smc?.reference?.refLow);
    if (Number.isFinite(refHigh)) {
      state.lineRefHigh.setData(chartRows.map((c) => ({ time: c.time, value: refHigh })));
    } else {
      state.lineRefHigh.setData([]);
    }
    if (Number.isFinite(refLow)) {
      state.lineRefLow.setData(chartRows.map((c) => ({ time: c.time, value: refLow })));
    } else {
      state.lineRefLow.setData([]);
    }

    clearSrLines();
    const srLevels = computeHistoricalSrLevels(rows);
    renderSrTable(srLevels);
    srLevels.forEach((lv) => {
      const s = state.chart.addLineSeries({
        color: lv.side === "support" ? "rgba(33,196,106,0.65)" : "rgba(224,79,95,0.65)",
        lineWidth: 1,
        lineStyle: 2,
        title: lv.side === "support" ? "Support" : "Resistance"
      });
      s.setData(chartRows.map((c) => ({ time: c.time, value: Number(lv.price) })));
      state.srSeries.push(s);
    });

    const signals = payload?.smc?.signals || {};
    const markers = [];
    if (lastTime != null) {
      if (signals.sweepLow) {
        markers.push({
          time: lastTime,
          position: "belowBar",
          color: "#21c46a",
          shape: "arrowUp",
          text: "Sweep Low"
        });
      }
      if (signals.sweepHigh) {
        markers.push({
          time: lastTime,
          position: "aboveBar",
          color: "#e04f5f",
          shape: "arrowDown",
          text: "Sweep High"
        });
      }
      if (signals.bosUp) {
        markers.push({
          time: lastTime,
          position: "aboveBar",
          color: "#53c3ff",
          shape: "circle",
          text: "BOS Up"
        });
      }
      if (signals.bosDown) {
        markers.push({
          time: lastTime,
          position: "belowBar",
          color: "#ffbe55",
          shape: "circle",
          text: "BOS Down"
        });
      }
      if (signals.chochUp) {
        markers.push({
          time: lastTime,
          position: "belowBar",
          color: "#89ffb2",
          shape: "square",
          text: "CHoCH Up"
        });
      }
      if (signals.chochDown) {
        markers.push({
          time: lastTime,
          position: "aboveBar",
          color: "#ff8f8f",
          shape: "square",
          text: "CHoCH Down"
        });
      }
      if (signals.displacement) {
        markers.push({
          time: lastTime,
          position: "aboveBar",
          color: "#d4af37",
          shape: "diamond",
          text: "Displacement"
        });
      }
    }
    state.candleSeries.setMarkers(markers);

    if (shouldFit) {
      state.chart.timeScale().fitContent();
    }
    resizeChart();
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
    if (!state.liveEnabled || !state.candleSeries) return;
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
        state.candleSeries.update({
          time: Math.floor(Number(k.t || 0) / 1000),
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c)
        });

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
      renderChart(payload, { fit: !opts.fromStream });
      if (elements.smcStatus) {
        const rows = Array.isArray(payload?.candles) ? payload.candles : [];
        const start = rows.length ? new Date(rows[0].openTime).toISOString().slice(0, 16).replace("T", " ") : "--";
        const end = rows.length
          ? new Date(rows[rows.length - 1].openTime).toISOString().slice(0, 16).replace("T", " ")
          : "--";
        const raw = Number(payload?.rawCandlesCount || payload?.candlesCount || 0);
        const shown = rows.length;
        const compressNote = payload?.compressed ? " · compressed for chart" : "";
        elements.smcStatus.textContent = `Source ${payload.source || "--"} · raw ${raw} · shown ${shown}${compressNote} · range ${start} → ${end}${state.liveEnabled ? " · live ON" : " · live OFF"} · chart no-volume v10`;
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
  window.addEventListener("resize", () => resizeChart());
  window.addEventListener("beforeunload", () => closeLiveStream());

  run().catch(() => {});
})();
