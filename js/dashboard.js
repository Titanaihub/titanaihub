const API_BASE = "/api";
const REFRESH_MS = 30000;

const state = {
  loggedIn: false,
  snapshot: {
    overview: null,
    coins: {},
    coinFocus: [],
    whales: [],
    whaleSummary: [],
    stablecoinFlows: [],
    alerts: [],
    deepAnalysis: null
  }
};

const el = {
  systemStatus: document.getElementById("systemStatus"),
  lastUpdated: document.getElementById("lastUpdated"),
  globalBias: document.getElementById("globalBias"),

  totalMarketCap: document.getElementById("totalMarketCap"),
  totalVolume24h: document.getElementById("totalVolume24h"),
  btcDominance: document.getElementById("btcDominance"),
  fearGreed: document.getElementById("fearGreed"),

  topSetup: document.getElementById("topSetup"),
  summaryConfidence: document.getElementById("summaryConfidence"),
  riskLevel: document.getElementById("riskLevel"),

  coinFocusGrid: document.getElementById("coinFocusGrid"),
  whaleTableBody: document.getElementById("whaleTableBody"),
  whaleSummaryGrid: document.getElementById("whaleSummaryGrid"),
  stablecoinFlowGrid: document.getElementById("stablecoinFlowGrid"),
  alertsGrid: document.getElementById("alertsGrid"),
  rawSnapshot: document.getElementById("rawSnapshot"),

  username: document.getElementById("username"),
  password: document.getElementById("password"),
  loginBtn: document.getElementById("loginBtn"),
  loginState: document.getElementById("loginState"),
  chatStatus: document.getElementById("chatStatus"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendChatBtn: document.getElementById("sendChatBtn"),

  askAnalyzeBTC: document.getElementById("askAnalyzeBTC"),
  askCompareCoins: document.getElementById("askCompareCoins"),
  askRisk: document.getElementById("askRisk"),

  btcPrice: document.getElementById("btcPrice"),
  btcSignal: document.getElementById("btcSignal"),
  btc5m: document.getElementById("btc5m"),
  btc15m: document.getElementById("btc15m"),
  btc1h: document.getElementById("btc1h"),
  btc4h: document.getElementById("btc4h"),
  btcFunding: document.getElementById("btcFunding"),
  btcOI: document.getElementById("btcOI"),
  btcBias: document.getElementById("btcBias"),
  btcEntry: document.getElementById("btcEntry"),
  btcSL: document.getElementById("btcSL"),
  btcTP: document.getElementById("btcTP"),

  ethPrice: document.getElementById("ethPrice"),
  ethSignal: document.getElementById("ethSignal"),
  eth5m: document.getElementById("eth5m"),
  eth15m: document.getElementById("eth15m"),
  eth1h: document.getElementById("eth1h"),
  eth4h: document.getElementById("eth4h"),
  ethFunding: document.getElementById("ethFunding"),
  ethOI: document.getElementById("ethOI"),
  ethBias: document.getElementById("ethBias"),
  ethEntry: document.getElementById("ethEntry"),
  ethSL: document.getElementById("ethSL"),
  ethTP: document.getElementById("ethTP"),

  bnbPrice: document.getElementById("bnbPrice"),
  bnbSignal: document.getElementById("bnbSignal"),
  bnb5m: document.getElementById("bnb5m"),
  bnb15m: document.getElementById("bnb15m"),
  bnb1h: document.getElementById("bnb1h"),
  bnb4h: document.getElementById("bnb4h"),
  bnbFunding: document.getElementById("bnbFunding"),
  bnbOI: document.getElementById("bnbOI"),
  bnbBias: document.getElementById("bnbBias"),
  bnbEntry: document.getElementById("bnbEntry"),
  bnbSL: document.getElementById("bnbSL"),
  bnbTP: document.getElementById("bnbTP")
};

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || `POST ${path} failed: ${res.status}`);
  }

  return data;
}

function formatUsdCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatMaybe(value, fallback = "--") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSignalClass(signal) {
  const s = String(signal || "").toUpperCase();
  if (s.includes("LONG")) return "signal-long";
  if (s.includes("SHORT")) return "signal-short";
  return "signal-wait";
}

function getSignedClass(value) {
  const text = String(value || "");
  if (text.startsWith("+")) return "pos";
  if (text.startsWith("-")) return "neg";
  return "flat";
}
const API_BASE = "/api";
const REFRESH_MS = 30000;

const state = {
  loggedIn: false,
  snapshot: {
    overview: null,
    coins: {},
    coinFocus: [],
    whales: [],
    whaleSummary: [],
    stablecoinFlows: [],
    alerts: [],
    deepAnalysis: null
  }
};

const el = {
  systemStatus: document.getElementById("systemStatus"),
  lastUpdated: document.getElementById("lastUpdated"),
  globalBias: document.getElementById("globalBias"),

  totalMarketCap: document.getElementById("totalMarketCap"),
  totalVolume24h: document.getElementById("totalVolume24h"),
  btcDominance: document.getElementById("btcDominance"),
  fearGreed: document.getElementById("fearGreed"),

  topSetup: document.getElementById("topSetup"),
  summaryConfidence: document.getElementById("summaryConfidence"),
  riskLevel: document.getElementById("riskLevel"),

  coinFocusGrid: document.getElementById("coinFocusGrid"),
  whaleTableBody: document.getElementById("whaleTableBody"),
  whaleSummaryGrid: document.getElementById("whaleSummaryGrid"),
  stablecoinFlowGrid: document.getElementById("stablecoinFlowGrid"),
  alertsGrid: document.getElementById("alertsGrid"),
  rawSnapshot: document.getElementById("rawSnapshot"),

  username: document.getElementById("username"),
  password: document.getElementById("password"),
  loginBtn: document.getElementById("loginBtn"),
  loginState: document.getElementById("loginState"),
  chatStatus: document.getElementById("chatStatus"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendChatBtn: document.getElementById("sendChatBtn"),

  askAnalyzeBTC: document.getElementById("askAnalyzeBTC"),
  askCompareCoins: document.getElementById("askCompareCoins"),
  askRisk: document.getElementById("askRisk"),

  btcPrice: document.getElementById("btcPrice"),
  btcSignal: document.getElementById("btcSignal"),
  btc5m: document.getElementById("btc5m"),
  btc15m: document.getElementById("btc15m"),
  btc1h: document.getElementById("btc1h"),
  btc4h: document.getElementById("btc4h"),
  btcFunding: document.getElementById("btcFunding"),
  btcOI: document.getElementById("btcOI"),
  btcBias: document.getElementById("btcBias"),
  btcEntry: document.getElementById("btcEntry"),
  btcSL: document.getElementById("btcSL"),
  btcTP: document.getElementById("btcTP"),

  ethPrice: document.getElementById("ethPrice"),
  ethSignal: document.getElementById("ethSignal"),
  eth5m: document.getElementById("eth5m"),
  eth15m: document.getElementById("eth15m"),
  eth1h: document.getElementById("eth1h"),
  eth4h: document.getElementById("eth4h"),
  ethFunding: document.getElementById("ethFunding"),
  ethOI: document.getElementById("ethOI"),
  ethBias: document.getElementById("ethBias"),
  ethEntry: document.getElementById("ethEntry"),
  ethSL: document.getElementById("ethSL"),
  ethTP: document.getElementById("ethTP"),

  bnbPrice: document.getElementById("bnbPrice"),
  bnbSignal: document.getElementById("bnbSignal"),
  bnb5m: document.getElementById("bnb5m"),
  bnb15m: document.getElementById("bnb15m"),
  bnb1h: document.getElementById("bnb1h"),
  bnb4h: document.getElementById("bnb4h"),
  bnbFunding: document.getElementById("bnbFunding"),
  bnbOI: document.getElementById("bnbOI"),
  bnbBias: document.getElementById("bnbBias"),
  bnbEntry: document.getElementById("bnbEntry"),
  bnbSL: document.getElementById("bnbSL"),
  bnbTP: document.getElementById("bnbTP")
};

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || `POST ${path} failed: ${res.status}`);
  }

  return data;
}

function formatUsdCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatMaybe(value, fallback = "--") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSignalClass(signal) {
  const s = String(signal || "").toUpperCase();
  if (s.includes("LONG")) return "signal-long";
  if (s.includes("SHORT")) return "signal-short";
  return "signal-wait";
}

function getSignedClass(value) {
  const text = String(value || "");
  if (text.startsWith("+")) return "pos";
  if (text.startsWith("-")) return "neg";
  return "flat";
}
function renderWhales() {
  if (!el.whaleTableBody) return;

  const rows = Array.isArray(state.snapshot.whales) ? state.snapshot.whales : [];

  if (!rows.length) {
    setHtml(
      el.whaleTableBody,
      `
        <tr>
          <td colspan="13">No whale feed data</td>
        </tr>
      `
    );
    return;
  }

  const html = rows
    .map((row) => {
      const actionClass = String(row.action || "").toLowerCase().includes("short")
        ? "neg"
        : String(row.action || "").toLowerCase().includes("long")
        ? "pos"
        : "flat";

      return `
        <tr>
          <td>
            <a href="${escapeHtml(row.explorerUrl || "#")}" target="_blank" rel="noreferrer">
              ${escapeHtml(row.address || "--")}
            </a>
          </td>
          <td>${escapeHtml(row.symbol || "--")}</td>
          <td class="${actionClass}">${escapeHtml(row.action || "--")}</td>
          <td>${escapeHtml(row.position || "--")}</td>
          <td>${escapeHtml(row.price || "--")}</td>
          <td>${escapeHtml(row.entry || "--")}</td>
          <td>${escapeHtml(row.exit || "--")}</td>
          <td>${escapeHtml(row.tp || "--")}</td>
          <td>${escapeHtml(row.sl || "--")}</td>
          <td>${escapeHtml(row.status || "--")}</td>
          <td>${escapeHtml(row.pendingType || "--")}</td>
          <td>${escapeHtml(row.pendingPrice || "--")}</td>
          <td>${escapeHtml(row.time || "--")}</td>
        </tr>
      `;
    })
    .join("");

  setHtml(el.whaleTableBody, html);
}

function renderWhaleSummary() {
  if (!el.whaleSummaryGrid) return;

  const items = Array.isArray(state.snapshot.whaleSummary)
    ? state.snapshot.whaleSummary
    : [];

  if (!items.length) {
    setHtml(
      el.whaleSummaryGrid,
      `
        <div class="stat-card">
          <span>Whale summary unavailable</span>
          <strong>--</strong>
        </div>
      `
    );
    return;
  }

  const html = items
    .map((item) => {
      const biasClass =
        String(item.netBias || "").toLowerCase().includes("long")
          ? "pos"
          : String(item.netBias || "").toLowerCase().includes("short")
          ? "neg"
          : "flat";

      return `
        <article class="summary-card">
          <div class="summary-card-top">
            <h3>${escapeHtml(item.symbol || "--")}</h3>
            <strong class="${biasClass}">${escapeHtml(item.netBias || "--")}</strong>
          </div>

          <div class="summary-card-grid">
            ${buildMetricBox("Whales", item.whaleCount)}
            ${buildMetricBox("Open Long", item.openLongUsd)}
            ${buildMetricBox("Open Short", item.openShortUsd)}
            ${buildMetricBox("Avg Long", item.avgLongEntry)}
            ${buildMetricBox("Avg Short", item.avgShortEntry)}
            ${buildMetricBox("Avg TP", item.avgTp)}
            ${buildMetricBox("Avg SL", item.avgSl)}
            ${buildMetricBox("Pending", item.pendingOrders)}
          </div>
        </article>
      `;
    })
    .join("");

  setHtml(el.whaleSummaryGrid, html);
}

function renderStablecoinFlows() {
  if (!el.stablecoinFlowGrid) return;

  const items = Array.isArray(state.snapshot.stablecoinFlows)
    ? state.snapshot.stablecoinFlows
    : [];

  if (!items.length) {
    setHtml(
      el.stablecoinFlowGrid,
      `
        <div class="stat-card">
          <span>Stablecoin flow unavailable</span>
          <strong>Disabled until real provider</strong>
        </div>
      `
    );
    return;
  }

  const html = items
    .map((item) => {
      const netClass = String(item.netFlow || "").startsWith("-") ? "neg" : "pos";

      return `
        <article class="summary-card">
          <div class="summary-card-top">
            <h3>${escapeHtml(item.symbol || "--")}</h3>
            <strong class="${netClass}">${escapeHtml(item.netFlow || "--")}</strong>
          </div>

          <div class="summary-card-grid">
            ${buildMetricBox("Inflow", item.exchangeInflow)}
            ${buildMetricBox("Outflow", item.exchangeOutflow)}
          </div>

          <p class="summary-card-note">${escapeHtml(item.interpretation || "")}</p>
        </article>
      `;
    })
    .join("");

  setHtml(el.stablecoinFlowGrid, html);
}

function renderAlerts() {
  if (!el.alertsGrid) return;

  const items = Array.isArray(state.snapshot.alerts) ? state.snapshot.alerts : [];

  if (!items.length) {
    setHtml(
      el.alertsGrid,
      `
        <div class="stat-card">
          <span>No alerts</span>
          <strong>--</strong>
        </div>
      `
    );
    return;
  }

  const html = items
    .map((item) => {
      const type = String(item.type || "system").toLowerCase();

      return `
        <article class="alert-card alert-${escapeHtml(type)}">
          <div class="alert-card-top">
            <span class="alert-type">${escapeHtml(type.toUpperCase())}</span>
            <strong>${escapeHtml(item.symbol || "--")}</strong>
          </div>
          <h3>${escapeHtml(item.title || "--")}</h3>
          <p>${escapeHtml(item.detail || "")}</p>
        </article>
      `;
    })
    .join("");

  setHtml(el.alertsGrid, html);
}

function renderRawSnapshot() {
  if (!el.rawSnapshot) return;

  const payload = {
    overview: state.snapshot.overview,
    coins: state.snapshot.coins,
    coinFocus: state.snapshot.coinFocus,
    whales: state.snapshot.whales,
    whaleSummary: state.snapshot.whaleSummary,
    stablecoinFlows: state.snapshot.stablecoinFlows,
    alerts: state.snapshot.alerts,
    deepAnalysis: state.snapshot.deepAnalysis
  };

  el.rawSnapshot.textContent = JSON.stringify(payload, null, 2);
}
function addChatMessage(role, message) {
  if (!el.chatMessages) return;

  const row = document.createElement("div");
  row.className = `chat-row ${role === "user" ? "chat-row-user" : "chat-row-ai"}`;

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`;
  bubble.textContent = String(message || "");

  row.appendChild(bubble);
  el.chatMessages.appendChild(row);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function updateChatUi() {
  if (el.chatStatus) {
    el.chatStatus.textContent = state.loggedIn ? "Unlocked" : "Locked";
    el.chatStatus.classList.remove("locked", "unlocked");
    el.chatStatus.classList.add(state.loggedIn ? "unlocked" : "locked");
  }

  if (el.loginState) {
    el.loginState.textContent = state.loggedIn ? "Logged in" : "Owner-only analysis";
  }

  if (el.chatInput) {
    el.chatInput.disabled = !state.loggedIn;
    el.chatInput.placeholder = state.loggedIn
      ? "Ask about BTC, ETH, BNB, risk, setup, execution..."
      : "Login first to use AI chat...";
  }

  if (el.sendChatBtn) {
    el.sendChatBtn.disabled = !state.loggedIn;
  }
}

function buildChatSnapshot() {
  return JSON.stringify({
    overview: state.snapshot.overview,
    coins: state.snapshot.coins,
    coinFocus: state.snapshot.coinFocus,
    whales: state.snapshot.whales,
    alerts: state.snapshot.alerts
  });
}

async function handleLogin() {
  try {
    const username = el.username ? el.username.value : "";
    const password = el.password ? el.password.value : "";

    await apiPost("/login", { username, password });

    state.loggedIn = true;
    updateChatUi();
    addChatMessage("ai", "Login successful. AI chat unlocked.");
  } catch (err) {
    state.loggedIn = false;
    updateChatUi();
    addChatMessage("ai", err.message || "Login failed.");
  }
}

async function handleSendChat(prefilledQuestion = "") {
  if (!state.loggedIn) return;

  const question = String(
    prefilledQuestion || (el.chatInput ? el.chatInput.value : "")
  ).trim();

  if (!question) return;

  addChatMessage("user", question);

  if (el.chatInput && !prefilledQuestion) {
    el.chatInput.value = "";
  }

  try {
    const data = await apiPost("/chat", {
      question,
      snapshot: buildChatSnapshot()
    });

    addChatMessage("ai", data?.reply || "No reply.");
  } catch (err) {
    addChatMessage("ai", err.message || "Chat request failed.");
  }
}

function bindChatEvents() {
  if (el.loginBtn) {
    el.loginBtn.addEventListener("click", handleLogin);
  }

  if (el.sendChatBtn) {
    el.sendChatBtn.addEventListener("click", () => handleSendChat());
  }

  if (el.chatInput) {
    el.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSendChat();
      }
    });
  }

  if (el.askAnalyzeBTC) {
    el.askAnalyzeBTC.addEventListener("click", () => {
      handleSendChat("ช่วยวิเคราะห์ BTC แบบลึกจากข้อมูลจริงตอนนี้");
    });
  }

  if (el.askCompareCoins) {
    el.askCompareCoins.addEventListener("click", () => {
      handleSendChat("ช่วยเปรียบเทียบ BTC ETH และ BNB ตอนนี้ เหรียญไหนน่าสนใจกว่า");
    });
  }

  if (el.askRisk) {
    el.askRisk.addEventListener("click", () => {
      handleSendChat("ช่วยสรุประดับความเสี่ยงของตลาดตอนนี้");
    });
  }

  updateChatUi();
}

function bindTabs() {
  const map = {
    Overview: "overviewSection",
    "Coin Focus": "coinFocusSection",
    Whales: "whalesSection",
    Alerts: "alertsSection",
    "AI Chat": "aiChatPanel"
  };

  const buttons = document.querySelectorAll(".tab-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const label = String(btn.textContent || "").trim();
      const targetId = map[label];
      const target = targetId ? document.getElementById(targetId) : null;

      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    });
  });
}

function renderAll() {
  renderOverview();
  renderSummary();
  renderCoinSnapshots();
  renderCoinFocus();
  renderWhales();
  renderWhaleSummary();
  renderStablecoinFlows();
  renderAlerts();
  renderRawSnapshot();
}
async function loadOverview() {
  state.snapshot.overview = await apiGet("/overview?v=1600");
}

async function loadCoins() {
  const [btc, eth, bnb] = await Promise.all([
    apiGet("/coin/btc?v=1600"),
    apiGet("/coin/eth?v=1600"),
    apiGet("/coin/bnb?v=1600")
  ]);

  state.snapshot.coins = { btc, eth, bnb };
}

async function loadCoinFocus() {
  state.snapshot.coinFocus = await apiGet("/coin-focus?limit=12&v=1600");
}

async function loadWhaleBlocks() {
  const [whales, whaleSummary, stablecoinFlows] = await Promise.all([
    apiGet("/whales-mixed?limit=20&v=1600"),
    apiGet("/whales-summary?v=1600"),
    apiGet("/stablecoin-flows?v=1600")
  ]);

  state.snapshot.whales = Array.isArray(whales) ? whales : [];
  state.snapshot.whaleSummary = Array.isArray(whaleSummary) ? whaleSummary : [];
  state.snapshot.stablecoinFlows = Array.isArray(stablecoinFlows) ? stablecoinFlows : [];
}

async function loadAlerts() {
  state.snapshot.alerts = await apiGet("/alerts?v=1600");
}

async function loadDeepAnalysis() {
  state.snapshot.deepAnalysis = await apiGet("/analysis/deep?v=1600");
}

async function refreshDashboard() {
  try {
    await Promise.all([
      loadOverview(),
      loadCoins(),
      loadCoinFocus(),
      loadWhaleBlocks(),
      loadAlerts(),
      loadDeepAnalysis()
    ]);

    renderAll();

    if (el.lastUpdated) {
      el.lastUpdated.textContent = formatTimestamp(new Date());
    }
  } catch (err) {
    console.error("refreshDashboard failed:", err);
    addChatMessage("ai", `Dashboard refresh failed: ${err.message || err}`);
  }
}

function startAutoRefresh() {
  setInterval(() => {
    refreshDashboard();
  }, REFRESH_MS);
}

function initDashboard() {
  bindTabs();
  bindChatEvents();
  renderAll();
  refreshDashboard();
  startAutoRefresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}
