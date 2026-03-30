(() => {
  const MT4_KEY_STORAGE = "titan_mt4_api_key";

  const elements = {
    goldApiKeyInput: document.getElementById("goldApiKeyInput"),
    goldRunSignalBtn: document.getElementById("goldRunSignalBtn"),
    goldRunPythonSmcBtn: document.getElementById("goldRunPythonSmcBtn"),
    goldRefreshLogBtn: document.getElementById("goldRefreshLogBtn"),
    goldRefreshHistoryBtn: document.getElementById("goldRefreshHistoryBtn"),
    goldStatus: document.getElementById("goldStatus"),
    goldSignalCards: document.getElementById("goldSignalCards"),
    goldBootstrapCards: document.getElementById("goldBootstrapCards"),
    goldTfBootstrapCards: document.getElementById("goldTfBootstrapCards"),
    goldSyncMeta: document.getElementById("goldSyncMeta"),
    goldPythonSmcPreview: document.getElementById("goldPythonSmcPreview"),
    goldAiInputsPreview: document.getElementById("goldAiInputsPreview"),
    goldAiDecisionPreview: document.getElementById("goldAiDecisionPreview"),
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

  function getEffectiveMt4Key() {
    const fromInput = String(elements.goldApiKeyInput?.value || "").trim();
    if (fromInput) return fromInput;
    try {
      return String(localStorage.getItem(MT4_KEY_STORAGE) || "").trim();
    } catch (_) {
      return "";
    }
  }

  /** Owner Bearer + optional MT4 key for Gold dashboard GET/POST (no login required if server allows public read). */
  function getGoldReadHeaders() {
    const h = { ...getOwnerAuthHeader() };
    const k = getEffectiveMt4Key();
    if (k) h["x-mt4-key"] = k;
    return h;
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

  function renderAiAnalysis(result) {
    if (!elements.goldAiInputsPreview || !elements.goldAiDecisionPreview) return;
    const dbg = result?.aiDebug;
    if (!dbg || !dbg.inputs) {
      elements.goldAiInputsPreview.textContent = "--";
      elements.goldAiDecisionPreview.textContent = "--";
      return;
    }
    const inputsObj = dbg.inputs;
    elements.goldAiInputsPreview.textContent = JSON.stringify(inputsObj, null, 2);

    const dec = result?.decision || {};
    const outObj = {
      action: String(dec.action || result?.action || "--").toUpperCase(),
      confidence: dec.confidence ?? result?.confidence ?? null,
      sl: dec.sl ?? result?.sl ?? null,
      tp: dec.tp ?? result?.tp ?? null,
      reason: dec.reason ?? result?.reason ?? "--",
      aiSource: dbg?.meta?.aiSource ?? result?.source ?? "--"
    };
    elements.goldAiDecisionPreview.textContent = JSON.stringify(
      { ...outObj, outputs: dbg.outputs || null },
      null,
      2
    );
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
      const persist = String(meta?.sync?.persistence || "disk_file");
      const persistedAt = String(meta?.sync?.persistedAt || "--");
      elements.goldSyncMeta.textContent = `Sync mode: ${mode} | Persistence: ${persist} | Last persisted: ${persistedAt}`;
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

  function barsPerDay(tf) {
    const x = String(tf || "").toUpperCase();
    if (x === "M1") return 1440;
    if (x === "M5") return 288;
    if (x === "M15") return 96;
    if (x === "M30") return 48;
    if (x === "H1") return 24;
    if (x === "H4") return 6;
    if (x === "D1") return 1;
    return 1;
  }

  function renderTfBootstrapStatus(rows, boot) {
    if (!elements.goldTfBootstrapCards) return;
    const arr = Array.isArray(rows) ? rows : [];
    if (!arr.length) {
      elements.goldTfBootstrapCards.innerHTML = `<div class="stat-card"><span>TF Progress</span><strong>--</strong></div>`;
      return;
    }
    const d1Target = Math.max(365, Number(boot?.targetRows) || 3650);
    const years = Math.max(1, d1Target / 365);
    const ordered = ["D1", "H4", "H1", "M30", "M15", "M5", "M1"];
    const byTf = new Map(arr.map((r) => [String(r.timeframe || "").toUpperCase(), r]));
    const cards = ordered
      .filter((tf) => byTf.has(tf))
      .map((tf) => {
        const row = byTf.get(tf) || {};
        const totalRows = Math.max(0, Number(row.totalRows) || 0);
        const targetRows = Math.max(365, Math.round(years * 365 * barsPerDay(tf)));
        const pct = Math.max(0, Math.min(100, (totalRows / targetRows) * 100));
        return `<div class="stat-card"><span>${tf}</span><strong>${fmt(pct, 1)}% (${fmt(totalRows, 0)}/${fmt(targetRows, 0)})</strong></div>`;
      });
    elements.goldTfBootstrapCards.innerHTML = cards.join("");
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
        debug: true,
        candles: buildDemoCandles(120)
      };
      const out = await apiPost("/mt4/gold/signal", payload, apiKey ? { "x-mt4-key": apiKey } : {});
      renderSignal(out);
      renderAiAnalysis(out);
      renderBootstrapStatus(out?.bootstrap || null, out || {});
      if (elements.goldStatus) {
        elements.goldStatus.textContent = `Signal ready: ${String(out?.decision?.action || out?.action || "--")}`;
      }
    } catch (err) {
      if (elements.goldStatus) elements.goldStatus.textContent = `Signal failed: ${err.message || "unknown error"}`;
    }
  }

  async function runPythonSmcTest() {
    if (elements.goldStatus) elements.goldStatus.textContent = "Running Python SMC test...";
    try {
      const { apiPost } = window.TitanApi;
      const headers = getGoldReadHeaders();
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
      const headers = getGoldReadHeaders();
      const out = await apiGet("/mt4/gold/execution-log?limit=40", { headers });
      renderExecution(out?.rows || []);
      if (elements.goldStatus) elements.goldStatus.textContent = "Execution log updated";
    } catch (err) {
      renderExecution([]);
      if (elements.goldStatus) elements.goldStatus.textContent = `Execution log failed: ${err.message || "unauthorized"}`;
    }
  }

  async function loadHistoryStatus() {
    try {
      const { apiGet } = window.TitanApi;
      const headers = getGoldReadHeaders();
      const out = await apiGet("/mt4/gold/history-status", { headers });
      renderHistoryStatus(out?.rows || []);
      renderBootstrapStatus(out?.bootstrap || null, out || {});
      renderTfBootstrapStatus(out?.rows || [], out?.bootstrap || null);
    } catch (_) {
      renderHistoryStatus([]);
      renderBootstrapStatus(null, {});
      renderTfBootstrapStatus([], null);
    }
  }

  try {
    const saved = localStorage.getItem(MT4_KEY_STORAGE);
    if (saved && elements.goldApiKeyInput && !String(elements.goldApiKeyInput.value || "").trim()) {
      elements.goldApiKeyInput.value = saved;
    }
  } catch (_) {}
  elements.goldApiKeyInput?.addEventListener("change", () => {
    const v = String(elements.goldApiKeyInput.value || "").trim();
    try {
      if (v) localStorage.setItem(MT4_KEY_STORAGE, v);
      else localStorage.removeItem(MT4_KEY_STORAGE);
    } catch (_) {}
  });

  elements.goldRunSignalBtn?.addEventListener("click", () => runSignalTest().catch(() => {}));
  elements.goldRunPythonSmcBtn?.addEventListener("click", () => runPythonSmcTest().catch(() => {}));
  elements.goldRefreshLogBtn?.addEventListener("click", () => loadExecutionLog().catch(() => {}));
  elements.goldRefreshHistoryBtn?.addEventListener("click", () => loadHistoryStatus().catch(() => {}));

  loadExecutionLog().catch(() => {});
  loadHistoryStatus().catch(() => {});
})();

