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

  healthOverallStatus: document.getElementById("healthOverallStatus"),
  healthLastChecked: document.getElementById("healthLastChecked"),
  healthOkCount: document.getElementById("healthOkCount"),
  healthIssueCount: document.getElementById("healthIssueCount"),
  healthGrid: document.getElementById("healthGrid"),

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
    Health: "healthSection",
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

  if (window.TitanRenderHealth?.renderHealth) {
    window.TitanRenderHealth.renderHealth(elements, appState.snapshot);
  }

  renderRawSnapshot();
}

async function loadAllData() {
  const { apiGet } = window.TitanApi;

  const results = await Promise.allSettled([
    apiGet("/overview?v=2600"),
    apiGet("/coin/btc?v=2600"),
    apiGet("/coin/eth?v=2600"),
    apiGet("/coin/bnb?v=2600"),
    apiGet("/coin-focus?limit=12&v=2600"),
    apiGet("/alerts?v=2600"),
    apiGet("/analysis/deep?v=2600")
  ]);

  const getValue = (index, fallback = null) => {
    const result = results[index];
    return result && result.status === "fulfilled" ? result.value : fallback;
  };

  const overview = getValue(0, null);
  const btc = getValue(1, null);
  const eth = getValue(2, null);
  const bnb = getValue(3, null);
  const coinFocus = getValue(4, []);
  const alerts = getValue(5, []);
  const deepAnalysis = getValue(6, null);

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

  return {
    overviewOk: Boolean(overview),
    btcOk: Boolean(btc),
    ethOk: Boolean(eth),
    bnbOk: Boolean(bnb),
    coinFocusOk: Array.isArray(coinFocus) && coinFocus.length > 0,
    alertsOk: Array.isArray(alerts) && alerts.length > 0,
    deepAnalysisOk: Boolean(deepAnalysis),
    whalesOk: Array.isArray(appState.snapshot.whales) && appState.snapshot.whales.length > 0,
    whaleSummaryOk:
      Array.isArray(appState.snapshot.whaleSummary) && appState.snapshot.whaleSummary.length > 0,
    liquidityOk: Boolean(appState.snapshot.stablecoinFlows)
  };
}
async function refreshDashboard() {
  try {
    const health = await loadAllData();
    renderAll();

    const hasCoreData =
      health.overviewOk ||
      health.btcOk ||
      health.ethOk ||
      health.bnbOk;

    if (elements.systemStatus) {
      if (hasCoreData) {
        elements.systemStatus.textContent = "LIVE";
        elements.systemStatus.classList.remove("neg", "flat");
        elements.systemStatus.classList.add("pos");
      } else {
        elements.systemStatus.textContent = "WAIT";
        elements.systemStatus.classList.remove("pos", "flat");
        elements.systemStatus.classList.add("neg");
      }
    }

    if (elements.lastUpdated) {
      const overviewTs = appState.snapshot.overview?.lastUpdated;
      const deepTs = appState.snapshot.deepAnalysis?.overview?.lastUpdated;
      elements.lastUpdated.textContent = overviewTs || deepTs || "--";
    }

    if (elements.globalBias) {
      const overviewBias = appState.snapshot.overview?.marketBias;
      const deepBias = appState.snapshot.deepAnalysis?.overview?.marketBias;
      elements.globalBias.textContent = overviewBias || deepBias || "WAIT";
      elements.globalBias.classList.remove("pos", "neg", "flat");

      const biasText = String(overviewBias || deepBias || "WAIT").toLowerCase();
      if (biasText.includes("bull") || biasText.includes("risk-on")) {
        elements.globalBias.classList.add("pos");
      } else if (biasText.includes("bear") || biasText.includes("risk-off") || biasText.includes("panic")) {
        elements.globalBias.classList.add("neg");
      } else {
        elements.globalBias.classList.add("flat");
      }
    }
  } catch (err) {
    console.error("refreshDashboard failed:", err);

    if (elements.systemStatus) {
      elements.systemStatus.textContent = "WAIT";
      elements.systemStatus.classList.remove("pos", "flat");
      elements.systemStatus.classList.add("neg");
    }

    if (elements.lastUpdated) {
      elements.lastUpdated.textContent = "--";
    }

    if (elements.globalBias) {
      elements.globalBias.textContent = "WAIT";
      elements.globalBias.classList.remove("pos", "neg");
      elements.globalBias.classList.add("flat");
    }

    renderAll();
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
