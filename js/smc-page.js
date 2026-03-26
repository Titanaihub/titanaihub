(() => {
  const elements = {
    smcSymbolSelect: document.getElementById("smcSymbolSelect"),
    smcIntervalSelect: document.getElementById("smcIntervalSelect"),
    smcLookbackSelect: document.getElementById("smcLookbackSelect"),
    smcRunBtn: document.getElementById("smcRunBtn"),
    smcLiveToggleBtn: document.getElementById("smcLiveToggleBtn"),
    smcStatus: document.getElementById("smcStatus"),
    smcSummaryCards: document.getElementById("smcSummaryCards"),
    smcConsensusCards: document.getElementById("smcConsensusCards"),
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

  function ensureChart() {
    if (!elements.smcChart || !elements.smcChartWrap) return false;
    if (!window.LightweightCharts) return false;
    if (state.chart) return true;

    state.chart = window.LightweightCharts.createChart(elements.smcChart, {
      width: elements.smcChartWrap.clientWidth || 900,
      height: elements.smcChartWrap.clientHeight || 420,
      layout: {
        background: { type: "solid", color: "#0a1738" },
        textColor: "rgba(244,248,255,0.82)"
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" }
      },
      rightPriceScale: {
        borderColor: "rgba(212,175,55,0.25)"
      },
      timeScale: {
        borderColor: "rgba(212,175,55,0.25)",
        timeVisible: true
      },
      crosshair: {
        mode: 0
      }
    });

    state.candleSeries = state.chart.addCandlestickSeries({
      upColor: "#21c46a",
      downColor: "#e04f5f",
      borderVisible: false,
      wickUpColor: "#21c46a",
      wickDownColor: "#e04f5f"
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
    elements.smcConsensusCards.innerHTML = `
      <div class="stat-card"><span>Bias</span><strong class="${biasCls}">${String(c.bias || "--")}</strong></div>
      <div class="stat-card"><span>Score</span><strong class="${scoreCls}">${fmt(c.score)}</strong></div>
      <div class="stat-card"><span>Confidence</span><strong>${fmt(c.confidence)}%</strong></div>
      <div class="stat-card"><span>Buy Ratio</span><strong>${buyRatioPct}</strong></div>
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

  function renderCandles(payload) {
    const body = elements.smcCandlesBody;
    if (!body) return;
    const rows = Array.isArray(payload?.candles) ? payload.candles : [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6">No candles</td></tr>`;
      return;
    }

    const byDay = new Map();
    const asc = [...rows].sort((a, b) => Number(a.openTime || 0) - Number(b.openTime || 0));
    asc.forEach((c) => {
      const dateKey = c.openTime ? new Date(c.openTime).toISOString().slice(0, 10) : "--";
      const cur = byDay.get(dateKey);
      if (!cur) {
        byDay.set(dateKey, {
          date: dateKey,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume) || 0,
          firstTs: Number(c.openTime || 0),
          lastTs: Number(c.openTime || 0)
        });
        return;
      }
      const ts = Number(c.openTime || 0);
      if (ts < cur.firstTs) {
        cur.firstTs = ts;
        cur.open = Number(c.open);
      }
      if (ts >= cur.lastTs) {
        cur.lastTs = ts;
        cur.close = Number(c.close);
      }
      cur.high = Math.max(cur.high, Number(c.high));
      cur.low = Math.min(cur.low, Number(c.low));
      cur.volume += Number(c.volume) || 0;
    });

    const dailyRows = [...byDay.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    body.innerHTML = dailyRows
      .slice(0, 180)
      .map((d) => {
        return `<tr>
          <td>${d.date}</td>
          <td>${fmt(d.open)}</td>
          <td>${fmt(d.high)}</td>
          <td>${fmt(d.low)}</td>
          <td>${fmt(d.close)}</td>
          <td>${fmt(d.volume)}</td>
        </tr>`;
      })
      .join("");
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
        close: Number(c.close)
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
    const lookback = Number(elements.smcLookbackSelect?.value || 1000);
    if (elements.smcStatus && !opts.fromStream) {
      elements.smcStatus.textContent = `Scanning ${symbol} ${interval}...`;
    }

    try {
      const { apiGet } = window.TitanApi;
      const qs = new URLSearchParams({
        symbol,
        interval,
        limit: String(Math.max(60, Math.min(lookback, 1500)))
      });
      const payload = await apiGet(`/smc/scan?${qs.toString()}`);
      const msPayload = await apiGet(`/multi-source/analysis?${qs.toString()}`);
      renderSummary(payload);
      renderConsensus(msPayload);
      renderNotes(payload);
      renderCandles(payload);
      renderChart(payload, { fit: !opts.fromStream });
      if (elements.smcStatus) {
        elements.smcStatus.textContent = `Source ${payload.source || "--"} · candles ${payload.candlesCount || 0}${state.liveEnabled ? " · live ON" : " · live OFF"}`;
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
  if (elements.smcIntervalSelect) {
    elements.smcIntervalSelect.addEventListener("change", () => run().catch(() => {}));
  }
  if (elements.smcLookbackSelect) {
    elements.smcLookbackSelect.addEventListener("change", () => run().catch(() => {}));
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
