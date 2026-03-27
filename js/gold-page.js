(() => {
  const elements = {
    goldApiKeyInput: document.getElementById("goldApiKeyInput"),
    goldRunSignalBtn: document.getElementById("goldRunSignalBtn"),
    goldRunPythonSmcBtn: document.getElementById("goldRunPythonSmcBtn"),
    goldRefreshLogBtn: document.getElementById("goldRefreshLogBtn"),
    goldRefreshHistoryBtn: document.getElementById("goldRefreshHistoryBtn"),
    goldStatus: document.getElementById("goldStatus"),
    goldSignalCards: document.getElementById("goldSignalCards"),
    goldBootstrapCards: document.getElementById("goldBootstrapCards"),
    goldSyncMeta: document.getElementById("goldSyncMeta"),
    goldPythonSmcPreview: document.getElementById("goldPythonSmcPreview"),
    goldExecutionBody: document.getElementById("goldExecutionBody"),
    goldHistoryBody: document.getElementById("goldHistoryBody")
  };

  function fmt(n, digits = 2) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    return x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function getOwnerAuthHeader() {
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

  function renderSignal(result) {
    if (!elements.goldSignalCards) return;
    const d = result?.decision || {};
    const act = String(d.action || "--").toUpperCase();
    const cls = act.includes("BUY") ? "pos" : act.includes("SELL") ? "neg" : "flat";
    elements.goldSignalCards.innerHTML = `
      <div class="stat-card"><span>Action</span><strong class="${cls}">${act}</strong></div>
      <div class="stat-card"><span>Confidence</span><strong>${fmt((Number(d.confidence) || 0) * 100)}%</strong></div>
      <div class="stat-card"><span>Reason</span><strong>${String(d.reason || "--")}</strong></div>
      <div class="stat-card"><span>SL</span><strong>${fmt(d.sl, 3)}</strong></div>
      <div class="stat-card"><span>TP</span><strong>${fmt(d.tp, 3)}</strong></div>
      <div class="stat-card"><span>Source</span><strong>${String(result?.source || "--")}${result?.cached ? " (cached)" : ""}</strong></div>
    `;
  }

  function renderBootstrapStatus(boot, meta = {}) {
    if (!elements.goldBootstrapCards) return;
    const completed = Boolean(boot?.completed);
    const statusCls = completed ? "pos" : "neg";
    elements.goldBootstrapCards.innerHTML = `
      <div class="stat-card"><span>Bootstrap</span><strong class="${statusCls}">${completed ? "READY" : "IN PROGRESS"}</strong></div>
      <div class="stat-card"><span>Progress</span><strong>${fmt(boot?.progressPct, 1)}%</strong></div>
      <div class="stat-card"><span>D1 Rows</span><strong>${fmt(boot?.currentRows, 0)}</strong></div>
      <div class="stat-card"><span>Target Rows</span><strong>${fmt(boot?.targetRows, 0)}</strong></div>
      <div class="stat-card"><span>Updated</span><strong>${String(boot?.updatedAt || "--")}</strong></div>
    `;
    if (elements.goldSyncMeta) {
      const mode = meta?.globalHistoryMode ? "global" : "by-account";
      const persistedAt = String(meta?.sync?.persistedAt || "--");
      elements.goldSyncMeta.textContent = `Sync mode: ${mode} | Persistence: disk_file | Last persisted: ${persistedAt}`;
    }
  }

  function renderExecution(rows) {
    const body = elements.goldExecutionBody;
    if (!body) return;
    const arr = Array.isArray(rows) ? rows : [];
    if (!arr.length) {
      body.innerHTML = `<tr><td colspan="9">No execution logs yet</td></tr>`;
      return;
    }
    body.innerHTML = arr
      .map(
        (r) => `<tr>
          <td>${String(r.ts || "--")}</td>
          <td>${String(r.accountId || "--")}</td>
          <td>${String(r.symbol || "--")}</td>
          <td>${String(r.orderType || "--")}</td>
          <td>${fmt(r.lots, 2)}</td>
          <td>${fmt(r.price, 3)}</td>
          <td class="${Number(r.pnl) >= 0 ? "pos" : "neg"}">${fmt(r.pnl, 2)}</td>
          <td>${String(r.ticket || "--")}</td>
          <td>${String(r.comment || "--")}</td>
        </tr>`
      )
      .join("");
  }

  function renderHistoryStatus(rows) {
    const body = elements.goldHistoryBody;
    if (!body) return;
    const arr = Array.isArray(rows) ? rows : [];
    if (!arr.length) {
      body.innerHTML = `<tr><td colspan="5">No uploaded history yet</td></tr>`;
      return;
    }
    body.innerHTML = arr
      .map(
        (r) => `<tr>
          <td>${String(r.timeframe || "--")}</td>
          <td>${fmt(r.totalRows, 0)}</td>
          <td>${String(r.from || "--")}</td>
          <td>${String(r.to || "--")}</td>
          <td>${String(r.updatedAt || "--")}</td>
        </tr>`
      )
      .join("");
  }

  function buildDemoCandles(count = 180) {
    const now = Date.now();
    return Array.from({ length: count }).map((_, i) => {
      const t = new Date(now - (count - i) * 5 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
      const base = 2175 + Math.sin(i / 7) * 3 + i * 0.01;
      const o = base + Math.sin(i / 4) * 0.2;
      const c = base + Math.cos(i / 5) * 0.2;
      const h = Math.max(o, c) + 0.35;
      const l = Math.min(o, c) - 0.35;
      return { time: t, open: Number(o.toFixed(3)), high: Number(h.toFixed(3)), low: Number(l.toFixed(3)), close: Number(c.toFixed(3)) };
    });
  }

  async function runSignalTest() {
    if (elements.goldStatus) elements.goldStatus.textContent = "Requesting XAUUSD signal...";
    try {
      const { apiPost } = window.TitanApi;
      const apiKey = String(elements.goldApiKeyInput?.value || "").trim();
      const payload = {
        apiKey,
        accountId: "web-test",
        symbol: "XAUUSD",
        timeframe: "M5",
        brokerTime: new Date().toISOString(),
        bid: 2180.12,
        ask: 2180.32,
        spreadPoints: 20,
        equity: 10000,
        freeMargin: 9200,
        openPositions: [],
        candles: buildDemoCandles(120)
      };
      const out = await apiPost("/mt4/gold/signal", payload, apiKey ? { "x-mt4-key": apiKey } : {});
      renderSignal(out);
      renderBootstrapStatus(out?.bootstrap || null, out || {});
      if (elements.goldStatus) {
        elements.goldStatus.textContent = `Signal ready: ${String(out?.decision?.action || "--")}`;
      }
    } catch (err) {
      if (elements.goldStatus) elements.goldStatus.textContent = `Signal failed: ${err.message || "unknown error"}`;
    }
  }

  async function runPythonSmcTest() {
    if (elements.goldStatus) elements.goldStatus.textContent = "Running Python SMC test...";
    try {
      const { apiPost } = window.TitanApi;
      const headers = getOwnerAuthHeader();
      const out = await apiPost("/mt4/gold/python-smc-test", { candles: buildDemoCandles(220) }, headers);
      if (elements.goldPythonSmcPreview) {
        elements.goldPythonSmcPreview.textContent = JSON.stringify(out?.pythonSmc || out, null, 2);
      }
      if (elements.goldStatus) elements.goldStatus.textContent = "Python SMC test completed";
    } catch (err) {
      if (elements.goldPythonSmcPreview) {
        elements.goldPythonSmcPreview.textContent = JSON.stringify({ ok: false, message: err.message || "python smc test failed" }, null, 2);
      }
      if (elements.goldStatus) elements.goldStatus.textContent = `Python SMC test failed: ${err.message || "unknown error"}`;
    }
  }

  async function loadExecutionLog() {
    if (elements.goldStatus) elements.goldStatus.textContent = "Loading execution log...";
    try {
      const { apiGet } = window.TitanApi;
      const headers = getOwnerAuthHeader();
      const out = await apiGet("/mt4/gold/execution-log?limit=40", { headers });
      renderExecution(out?.rows || []);
      if (elements.goldStatus) elements.goldStatus.textContent = "Execution log updated";
    } catch (err) {
      renderExecution([]);
      if (elements.goldStatus) elements.goldStatus.textContent = `Execution log failed: ${err.message || "login required"}`;
    }
  }

  async function loadHistoryStatus() {
    try {
      const { apiGet } = window.TitanApi;
      const headers = getOwnerAuthHeader();
      const out = await apiGet("/mt4/gold/history-status", { headers });
      renderHistoryStatus(out?.rows || []);
      renderBootstrapStatus(out?.bootstrap || null, out || {});
    } catch (_) {
      renderHistoryStatus([]);
      renderBootstrapStatus(null, {});
    }
  }

  elements.goldRunSignalBtn?.addEventListener("click", () => runSignalTest().catch(() => {}));
  elements.goldRunPythonSmcBtn?.addEventListener("click", () => runPythonSmcTest().catch(() => {}));
  elements.goldRefreshLogBtn?.addEventListener("click", () => loadExecutionLog().catch(() => {}));
  elements.goldRefreshHistoryBtn?.addEventListener("click", () => loadHistoryStatus().catch(() => {}));

  loadExecutionLog().catch(() => {});
  loadHistoryStatus().catch(() => {});
})();

