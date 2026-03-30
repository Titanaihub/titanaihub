(() => {
  const MT4_KEY_STORAGE = "titan_mt4_api_key";

  const el = {
    apiKey: document.getElementById("gildApiKeyInput"),
    account: document.getElementById("gildAccountInput"),
    runBtn: document.getElementById("gildRunBtn"),
    status: document.getElementById("gildStatus"),
    cards: document.getElementById("gildSignalCards"),
    humanSummary: document.getElementById("gildHumanSummary"),
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

  function normalizeKey(raw) {
    return String(raw || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
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

  function p3(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n.toFixed(3) : "--";
  }

  function pct(x) {
    const n = Number(x);
    return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "--";
  }

  function summarizeHuman(out) {
    const d = out?.decision || {};
    const dbg = out?.aiDebug || {};
    const inputs = dbg.inputs || {};
    const trend = inputs.trendContext || {};
    const smc = inputs.smcContext || {};
    const hz = inputs.historyProfile?.windows?.last30 || inputs.historyProfile?.windows?.last15 || inputs.historyProfile?.windows?.all || null;
    const zones = inputs.d1ExpectedZones || null;
    const py = inputs.pythonSmcDecision || null;
    const lines = [];

    lines.push(`Decision: ${String(d.action || "--")} | Confidence: ${pct(d.confidence)} | Source: ${String(out?.source || "--")}`);
    lines.push(`Reason: ${String(d.reason || "--")}`);
    lines.push(`SL/TP: ${p3(d.sl)} / ${p3(d.tp)} | Risk: ${Number(d.riskPercent ?? 0).toFixed(2)}%`);

    const d1 = trend?.d1 ? `${trend.d1.bias} (${p3(trend.d1.strength)})` : "--";
    const h1 = trend?.h1 ? `${trend.h1.bias} (${p3(trend.h1.strength)})` : "--";
    const m5 = trend?.m5 ? `${trend.m5.bias} (${p3(trend.m5.strength)})` : "--";
    lines.push(`Trend: D1=${d1}, H1=${h1}, M5=${m5}, alignment=${String(trend.alignment || "--")}`);

    lines.push(
      `SMC: support=${p3(smc.nearestSupport)}, resistance=${p3(smc.nearestResistance)}, refHigh=${p3(smc.refHigh)}, refLow=${p3(smc.refLow)}`
    );

    if (hz) {
      lines.push(
        `History(${hz.label || "window"}): open→high avg=${Number(hz.openToHighPct?.avg || 0).toFixed(3)}%, open→low avg=${Number(hz.openToLowPct?.avg || 0).toFixed(3)}%, open→close avg=${Number(hz.openToClosePct?.avg || 0).toFixed(3)}%`
      );
    } else {
      lines.push("History: --");
    }

    if (zones) {
      lines.push(
        `Expected zones(D1 ${zones.window || "--"}): high avg=${p3(zones.expectedHigh?.avg)} [${p3(zones.expectedHigh?.min)}..${p3(zones.expectedHigh?.max)}], low avg=${p3(zones.expectedLow?.avg)} [${p3(zones.expectedLow?.min)}..${p3(zones.expectedLow?.max)}]`
      );
    } else {
      lines.push("Expected zones: --");
    }

    if (py) {
      lines.push(`Python SMC: action=${String(py.action || "--")}, conf=${pct(py.confidence)}, reason=${String(py.reason || "--")}`);
    }

    if (out?.contratrendAdjusted === true) {
      lines.push("Guard impact: adjusted by risk/trend guard (contratrendAdjusted=true)");
    }

    return lines.join("\n");
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
      const apiKey = normalizeKey(getApiKey());
      if (!apiKey) {
        throw new Error("MT4 API Key is empty");
      }
      if (el.apiKey) el.apiKey.value = apiKey;
      try {
        localStorage.setItem(MT4_KEY_STORAGE, apiKey);
      } catch (_) {}
      payload.apiKey = apiKey;
      if (el.payload) el.payload.textContent = JSON.stringify(payload, null, 2);
      const out = await apiPost("/mt4/gold/signal", payload, { "x-mt4-key": apiKey });
      renderCards(out);
      if (el.humanSummary) el.humanSummary.textContent = summarizeHuman(out);
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
      if (el.status) el.status.textContent = `AI analysis ready (key len=${apiKey.length})`;
    } catch (err) {
      if (el.status) el.status.textContent = `Failed: ${err.message || "unknown error"}`;
      if (el.inputs) {
        el.inputs.textContent = JSON.stringify(
          {
            ok: false,
            message: err.message || "failed",
            hint: "ตรวจ MT4 API Key ให้เป็นค่า MT4_SHARED_SECRET แบบตรงตัวอักษร"
          },
          null,
          2
        );
      }
      if (el.decision) {
        el.decision.textContent = JSON.stringify(
          {
            ok: false,
            message: err.message || "failed",
            action: "WAIT"
          },
          null,
          2
        );
      }
      if (el.humanSummary) {
        el.humanSummary.textContent = `Decision: WAIT\nReason: ${err.message || "failed"}\nHint: ตรวจ key/สิทธิ์/การเชื่อมต่อ API`;
      }
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
  // Auto-load once so user immediately sees either analysis or explicit error reason.
  run().catch(() => {});
})();
