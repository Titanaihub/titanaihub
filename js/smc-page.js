(() => {
  const elements = {
    smcSymbolSelect: document.getElementById("smcSymbolSelect"),
    smcIntervalSelect: document.getElementById("smcIntervalSelect"),
    smcRunBtn: document.getElementById("smcRunBtn"),
    smcStatus: document.getElementById("smcStatus"),
    smcSummaryCards: document.getElementById("smcSummaryCards"),
    smcNotesBody: document.getElementById("smcNotesBody"),
    smcCandlesBody: document.getElementById("smcCandlesBody")
  };

  function fmt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    return x.toLocaleString("en-US", { maximumFractionDigits: 8 });
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
    body.innerHTML = rows
      .slice(-80)
      .reverse()
      .map((c) => {
        const ts = c.openTime ? new Date(c.openTime).toISOString().slice(0, 19).replace("T", " ") : "--";
        return `<tr>
          <td>${ts}</td>
          <td>${fmt(c.open)}</td>
          <td>${fmt(c.high)}</td>
          <td>${fmt(c.low)}</td>
          <td>${fmt(c.close)}</td>
          <td>${fmt(c.volume)}</td>
        </tr>`;
      })
      .join("");
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

  run().catch(() => {});
})();
