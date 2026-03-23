const REFRESH_MS = 30000;

const appState = {
  loggedIn: false,
  snapshot: {
    overview: null,
    coins: {},
    coinFocus: [],
    whales: [],
    whaleSummary: [],
    stablecoinFlows: null,
    alerts: [],
    deepAnalysis: null
  }
};

const elements = {
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

function bindTabs() {
  const map = {
    Overview: "overviewSection",
    "Coin Focus": "coinFocusSection",
    Flow: "whalesSection",
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

function hideRawPanel() {
  const rawPanel = document.getElementById("rawPanel");
  if (rawPanel) {
    rawPanel.style.display = "none";
  }
}

function renderRawSnapshot() {
  if (!elements.rawSnapshot) return;

  elements.rawSnapshot.textContent = JSON.stringify(
    {
      overview: appState.snapshot.overview,
      coins: appState.snapshot.coins,
      coinFocus: appState.snapshot.coinFocus,
      flowFeed: appState.snapshot.whales,
      positioningSummary: appState.snapshot.whaleSummary,
      liquiditySummary: appState.snapshot.stablecoinFlows,
      alerts: appState.snapshot.alerts,
      deepAnalysis: appState.snapshot.deepAnalysis
    },
    null,
    2
  );
}

function renderAll() {
  window.TitanRenderOverview.renderOverview(elements, appState.snapshot);
  window.TitanRenderOverview.renderSummary(elements, appState.snapshot);
  window.TitanRenderCoinFocus.renderCoinSnapshots(elements, appState.snapshot);
  window.TitanRenderCoinFocus.renderCoinFocus(elements, appState.snapshot);
  window.TitanRenderRealFlow.renderFlowFeed(elements, appState.snapshot);
  window.TitanRenderRealFlow.renderPositioningSummary(elements, appState.snapshot);
  window.TitanRenderRealFlow.renderLiquiditySummary(elements, appState.snapshot);
  window.TitanRenderAlerts.renderAlerts(elements, appState.snapshot);
  renderRawSnapshot();
}

async function loadAllData() {
  const { apiGet } = window.TitanApi;

  const [
    overview,
    btc,
    eth,
    bnb,
    coinFocus,
    alerts,
    deepAnalysis
  ] = await Promise.all([
    apiGet("/overview?v=2401"),
    apiGet("/coin/btc?v=2401"),
    apiGet("/coin/eth?v=2401"),
    apiGet("/coin/bnb?v=2401"),
    apiGet("/coin-focus?limit=12&v=2401"),
    apiGet("/alerts?v=2401"),
    apiGet("/analysis/deep?v=2401")
  ]);

  appState.snapshot.overview = overview || null;
  appState.snapshot.coins = {
    btc: btc || null,
    eth: eth || null,
    bnb: bnb || null
  };
  appState.snapshot.coinFocus = Array.isArray(coinFocus) ? coinFocus : [];
  appState.snapshot.alerts = Array.isArray(alerts) ? alerts : [];
  appState.snapshot.deepAnalysis = deepAnalysis || null;

  const whalesBlock = deepAnalysis?.whales || {};
  appState.snapshot.whales = Array.isArray(whalesBlock.mixedFeed) ? whalesBlock.mixedFeed : [];
  appState.snapshot.whaleSummary = Array.isArray(whalesBlock.summary) ? whalesBlock.summary : [];
  appState.snapshot.stablecoinFlows =
    whalesBlock.stablecoinFlows && !Array.isArray(whalesBlock.stablecoinFlows)
      ? whalesBlock.stablecoinFlows
      : null;
}

async function refreshDashboard() {
  try {
    await loadAllData();
    renderAll();

    if (elements.systemStatus) {
      elements.systemStatus.textContent = "LIVE";
      elements.systemStatus.classList.remove("neg");
      elements.systemStatus.classList.add("pos");
    }

    if (elements.lastUpdated) {
      const deepTs = appState.snapshot.deepAnalysis?.overview?.lastUpdated;
      elements.lastUpdated.textContent = deepTs || new Date().toLocaleString();
    }
  } catch (err) {
    console.error("refreshDashboard failed:", err);

    if (elements.systemStatus) {
      elements.systemStatus.textContent = "ERROR";
      elements.systemStatus.classList.remove("pos");
      elements.systemStatus.classList.add("neg");
    }

    if (window.TitanChat?.addChatMessage) {
      window.TitanChat.addChatMessage(
        elements,
        "ai",
        `Dashboard refresh failed: ${err.message || err}`
      );
    }
  }
}

function startAutoRefresh() {
  setInterval(() => {
    refreshDashboard();
  }, REFRESH_MS);
}

async function boot() {
  bindTabs();
  hideRawPanel();

  if (window.TitanChat?.bindChatEvents) {
    window.TitanChat.bindChatEvents(elements, appState);
  }

  if (elements.chatMessages && !elements.chatMessages.children.length) {
    if (window.TitanChat?.addChatMessage) {
      window.TitanChat.addChatMessage(elements, "ai", "AI chat ready. Login first.");
    }
  }

  await refreshDashboard();
  startAutoRefresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
