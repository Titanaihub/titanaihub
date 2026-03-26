const REFRESH_MS = 30000;

const appState = {
  loggedIn: false,
  authToken: null,
  authRole: null,
  demoLastDecision: null,
  snapshot: {
    overview: null,
    coins: {},
    coinFocus: [],
    whales: [],
    whaleSummary: [],
    stablecoinFlows: null,
    marketHistory: null,
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
  historySymbolsInput: document.getElementById("historySymbolsInput"),
  historyDaysSelect: document.getElementById("historyDaysSelect"),
  historyRefreshBtn: document.getElementById("historyRefreshBtn"),
  historyDataStatus: document.getElementById("historyDataStatus"),
  historyDataTableBody: document.getElementById("historyDataTableBody"),
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
  bnbTP: document.getElementById("bnbTP"),

  demoRunDecision: document.getElementById("demoRunDecision"),
  demoExecute: document.getElementById("demoExecute"),
  demoTradingStatus: document.getElementById("demoTradingStatus"),
  demoDecisionPreview: document.getElementById("demoDecisionPreview"),
  demoAccountMount: document.getElementById("demoAccountMount"),
  demoPlaceOrderHint: document.getElementById("demoPlaceOrderHint"),
  demoAutoIntervalMs: document.getElementById("demoAutoIntervalMs"),
  demoAutoStart: document.getElementById("demoAutoStart"),
  demoAutoStop: document.getElementById("demoAutoStop"),
  demoAutoStatusLine: document.getElementById("demoAutoStatusLine"),
  demoDecisionLog: document.getElementById("demoDecisionLog")
};

function bindTabs() {
  const map = {
    Overview: "overviewSection",
    "Coin Focus": "coinFocusSection",
    Flow: "whalesSection",
    "History Data": "historyDataSection",
    Alerts: "alertsSection",
    Health: "healthSection",
    Trading: "demoTradingSection",
    "AI Chat": "aiChatPanel"
  };

  const nav = document.querySelector("nav.top-tabs");
  const buttons = nav ? nav.querySelectorAll(".tab-btn") : [];

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
      marketHistory: appState.snapshot.marketHistory,
      alerts: appState.snapshot.alerts,
      deepAnalysis: appState.snapshot.deepAnalysis
    },
    null,
    2
  );
}

function fmtMoneyLikeCsv(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "--";
  return x.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function fmtVolLikeCsv(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "--";
  if (Math.abs(x) >= 1_000_000_000) return `${(x / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(x) >= 1_000_000) return `${(x / 1_000_000).toFixed(2)}M`;
  if (Math.abs(x) >= 1_000) return `${(x / 1_000).toFixed(2)}K`;
  return x.toFixed(2);
}

function fmtPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "--";
  return `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;
}

function renderMarketHistory() {
  const body = elements.historyDataTableBody;
  const statusEl = elements.historyDataStatus;
  if (!body) return;

  const payload = appState.snapshot.marketHistory;
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8">No history rows</td></tr>`;
  } else {
    body.innerHTML = rows
      .slice(0, 250)
      .map((r) => {
        const change = Number(r.changePct);
        const cls = !Number.isFinite(change) ? "" : change >= 0 ? "pos" : "neg";
        return `<tr>
          <td>${String(r.symbol || "--")}</td>
          <td>${String(r.date || "--")}</td>
          <td>${fmtMoneyLikeCsv(r.price)}</td>
          <td>${fmtMoneyLikeCsv(r.open)}</td>
          <td>${fmtMoneyLikeCsv(r.high)}</td>
          <td>${fmtMoneyLikeCsv(r.low)}</td>
          <td>${fmtVolLikeCsv(r.volume)}</td>
          <td class="${cls}">${fmtPct(r.changePct)}</td>
        </tr>`;
      })
      .join("");
  }

  if (statusEl) {
    const errCount = Array.isArray(payload?.errors) ? payload.errors.length : 0;
    const symText = Array.isArray(payload?.symbols) && payload.symbols.length
      ? payload.symbols.join(",")
      : "--";
    statusEl.textContent = `CoinGecko: ${symText} · rows ${rows.length}${errCount ? ` · errors ${errCount}` : ""}`;
  }
}

function parseSymbolInput(raw) {
  const list = String(raw || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(list)];
}

async function loadMarketHistory(force = false) {
  const payload = appState.snapshot.marketHistory;
  const nowTs = Date.now();
  if (!force && payload?.fetchedAt && nowTs - payload.fetchedAt < 5 * 60 * 1000) {
    return payload;
  }

  const symbols = parseSymbolInput(elements.historySymbolsInput?.value || "BTC,ETH,BNB,SOL,XRP");
  const days = Number(elements.historyDaysSelect?.value || 30);

  if (elements.historyDataStatus) {
    elements.historyDataStatus.textContent = "Loading CoinGecko history...";
  }

  try {
    const { apiGet } = window.TitanApi;
    const qs = new URLSearchParams({
      symbols: symbols.join(","),
      days: String(days),
      perCoin: "30"
    });
    const data = await apiGet(`/market-history?${qs.toString()}`);
    appState.snapshot.marketHistory = {
      ...data,
      fetchedAt: Date.now()
    };
  } catch (err) {
    appState.snapshot.marketHistory = {
      ok: false,
      symbols,
      rows: [],
      errors: [{ symbol: "*", message: err.message || "failed" }],
      fetchedAt: Date.now()
    };
    if (elements.historyDataStatus) {
      elements.historyDataStatus.textContent = `History load failed: ${err.message || "unknown error"}`;
    }
  }

  renderMarketHistory();
  return appState.snapshot.marketHistory;
}

function renderAll() {
  window.TitanRenderOverview.renderOverview(elements, appState.snapshot);
  window.TitanRenderOverview.renderSummary(elements, appState.snapshot);
  window.TitanRenderCoinFocus.renderCoinSnapshots(elements, appState.snapshot);
  window.TitanRenderCoinFocus.renderCoinFocus(elements, appState.snapshot);
  window.TitanRenderRealFlow.renderFlowFeed(elements, appState.snapshot);
  window.TitanRenderRealFlow.renderPositioningSummary(elements, appState.snapshot);
  window.TitanRenderRealFlow.renderLiquiditySummary(elements, appState.snapshot);
  renderMarketHistory();
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
    apiGet("/coin-focus?limit=15&v=2600"),
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
    await loadMarketHistory(false);
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

    if (appState.loggedIn && window.TitanDemoTrading?.loadAccount) {
      await window.TitanDemoTrading.loadAccount(elements, appState).catch(() => {});
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

  if (elements.historyRefreshBtn) {
    elements.historyRefreshBtn.addEventListener("click", () => {
      loadMarketHistory(true).catch((err) => {
        if (elements.historyDataStatus) {
          elements.historyDataStatus.textContent = `History refresh failed: ${err.message || "unknown error"}`;
        }
      });
    });
  }

  if (elements.historyDaysSelect) {
    elements.historyDaysSelect.addEventListener("change", () => {
      loadMarketHistory(true).catch(() => {});
    });
  }

  if (window.TitanDemoTrading?.bindEvents) {
    window.TitanDemoTrading.bindEvents(elements, appState);
  }

  if (window.TitanChat?.bindChatEvents) {
    window.TitanChat.bindChatEvents(elements, appState);
  }

  let sessionRestored = false;
  if (window.TitanChat?.restoreSessionFromStorage) {
    sessionRestored = await window.TitanChat.restoreSessionFromStorage(elements, appState);
  }

  if (sessionRestored && window.TitanChat?.addChatMessage) {
    window.TitanChat.addChatMessage(elements, "ai", "Session restored (stays logged in after refresh).");
  } else if (elements.chatMessages && !elements.chatMessages.children.length) {
    if (window.TitanChat?.addChatMessage) {
      window.TitanChat.addChatMessage(elements, "ai", "AI chat ready. Login first.");
    }
  }

  await refreshDashboard();
  await loadMarketHistory(true).catch(() => {});
  startAutoRefresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
