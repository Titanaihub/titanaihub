(() => {
  const elements = {
    smcSymbolSelect: document.getElementById("smcSymbolSelect"),
    smcIntervalSelect: document.getElementById("smcIntervalSelect"),
    smcRunBtn: document.getElementById("smcRunBtn"),
    smcStatus: document.getElementById("smcStatus"),
    smcSummaryCards: document.getElementById("smcSummaryCards"),
    smcNotesBody: document.getElementById("smcNotesBody"),
    smcCandlesBody: document.getElementById("smcCandlesBody"),
    smcChartWrap: document.getElementById("smcChartWrap"),
    smcChart: document.getElementById("smcChart")
  };

  const state = {
    chart: null,
    candleSeries: null,
    lineRefHigh: null,
    lineRefLow: null
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

  function renderChart(payload) {
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

    state.chart.timeScale().fitContent();
    resizeChart();
  }

  async function run() {
    const symbol = String(elements.smcSymbolSelect?.value || "BTCUSDT").toUpperCase();
    const interval = String(elements.smcIntervalSelect?.value || "15m");
    if (elements.smcStatus) {
      elements.smcStatus.textContent = `Scanning ${symbol} ${interval}...`;
    }

    try {
      const { apiGet } = window.TitanApi;
      const qs = new URLSearchParams({
        symbol,
        interval,
        limit: "240"
      });
      const payload = await apiGet(`/smc/scan?${qs.toString()}`);
      renderSummary(payload);
      renderNotes(payload);
      renderCandles(payload);
      renderChart(payload);
      if (elements.smcStatus) {
        elements.smcStatus.textContent = `Source ${payload.source || "--"} · candles ${payload.candlesCount || 0}`;
      }
    } catch (err) {
      if (elements.smcStatus) {
        elements.smcStatus.textContent = `SMC scan failed: ${err.message || "unknown error"}`;
      }
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
  window.addEventListener("resize", () => resizeChart());

  run().catch(() => {});
})();
