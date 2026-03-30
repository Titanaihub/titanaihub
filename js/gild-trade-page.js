(() => {
  const MT4_KEY_STORAGE = "titan_mt4_api_key";

  const el = {
    apiKey: document.getElementById("gildApiKeyInput"),
    account: document.getElementById("gildAccountInput"),
    runBtn: document.getElementById("gildRunBtn"),
    status: document.getElementById("gildStatus"),
    cards: document.getElementById("gildSignalCards"),
    payload: document.getElementById("gildPayloadPreview"),
    inputs: document.getElementById("gildInputsPreview"),
    decision: document.getElementById("gildDecisionPreview")
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
      const token = JSON.parse(raw)?.token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch (_) {
      return {};
    }
  }

  function getApiKey() {
    const fromInput = String(el.apiKey?.value || "").trim();
    if (fromInput) return fromInput;
    try {
      return String(localStorage.getItem(MT4_KEY_STORAGE) || "").trim();
    } catch (_) {
      return "";
    }
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

  function renderCards(out) {
    if (!el.cards) return;
    const d = out?.decision || {};
    const action = String(d.action || out?.action || "--").toUpperCase();
    const cls = action.includes("BUY") ? "pos" : action.includes("SELL") ? "neg" : "flat";
    el.cards.innerHTML = `
      <div class="stat-card"><span>Action</span><strong class="${cls}">${action}</strong></div>
      <div class="stat-card"><span>Confidence</span><strong>${fmt((Number(d.confidence ?? out?.confidence) || 0) * 100)}%</strong></div>
      <div class="stat-card"><span>Reason</span><strong>${String(d.reason || out?.reason || "--")}</strong></div>
      <div class="stat-card"><span>SL</span><strong>${fmt(d.sl ?? out?.sl, 3)}</strong></div>
      <div class="stat-card"><span>TP</span><strong>${fmt(d.tp ?? out?.tp, 3)}</strong></div>
      <div class="stat-card"><span>Source</span><strong>${String(out?.source || "--")}${out?.cached ? " (cached)" : ""}</strong></div>
    `;
  }

  async function buildSignalPayload() {
    const accountId = String(el.account?.value || "web-test").trim() || "web-test";
    const headers = { ...getOwnerAuthHeader() };
    const apiKey = getApiKey();
    if (apiKey) headers["x-mt4-key"] = apiKey;

    try {
      const { apiGet } = window.TitanApi;
      const rowsResp = await apiGet(`/mt4/gold/history-rows?symbol=XAUUSD&timeframe=M5&accountId=${encodeURIComponent(accountId)}&limit=180`, { headers });
      const rows = Array.isArray(rowsResp?.rows) ? rowsResp.rows : [];
      if (rows.length >= 40) {
        const last = rows[rows.length - 1];
        const close = Number(last?.close || 0);
        const spread = 25;
        return {
          apiKey,
          accountId,
          symbol: "XAUUSD",
          timeframe: "M5",
          brokerTime: new Date().toISOString(),
          bid: close > 0 ? close : 2180.12,
          ask: close > 0 ? close + 0.2 : 2180.32,
          spreadPoints: spread,
          equity: 10000,
          freeMargin: 9200,
          openPositions: [],
          debug: true,
          candles: rows.slice(-120)
        };
      }
    } catch (_) {}

    return {
      apiKey,
      accountId,
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
  }

  async function run() {
    if (el.status) el.status.textContent = "Running AI analysis...";
    try {
      const { apiPost } = window.TitanApi;
      const payload = await buildSignalPayload();
      const apiKey = getApiKey();
      el.payload.textContent = JSON.stringify(payload, null, 2);
      const out = await apiPost("/mt4/gold/signal", payload, apiKey ? { "x-mt4-key": apiKey } : {});
      renderCards(out);
      el.inputs.textContent = JSON.stringify(out?.aiDebug?.inputs || {}, null, 2);
      el.decision.textContent = JSON.stringify(
        {
          decision: out?.decision || null,
          aiSource: out?.aiDebug?.meta?.aiSource || out?.source || null,
          contratrendAdjusted: out?.contratrendAdjusted ?? null
        },
        null,
        2
      );
      if (el.status) el.status.textContent = "AI analysis ready";
    } catch (err) {
      if (el.status) el.status.textContent = `Failed: ${err.message || "unknown error"}`;
      if (el.inputs) el.inputs.textContent = "--";
      if (el.decision) el.decision.textContent = JSON.stringify({ ok: false, message: err.message || "failed" }, null, 2);
    }
  }

  try {
    const saved = localStorage.getItem(MT4_KEY_STORAGE);
    if (saved && el.apiKey && !String(el.apiKey.value || "").trim()) {
      el.apiKey.value = saved;
    }
  } catch (_) {}

  el.apiKey?.addEventListener("change", () => {
    const v = String(el.apiKey.value || "").trim();
    try {
      if (v) localStorage.setItem(MT4_KEY_STORAGE, v);
      else localStorage.removeItem(MT4_KEY_STORAGE);
    } catch (_) {}
  });

  el.runBtn?.addEventListener("click", () => run().catch(() => {}));
})();
