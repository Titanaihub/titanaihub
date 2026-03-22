const API_BASE = "https://titan-ai-api.onrender.com";

let started = false;
let refreshTimer = null;
let lastGoodData = null;
let isLoggedIn = false;

function el(id) {
  return document.getElementById(id);
}

function text(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function shortAddr(addr) {
  const s = String(addr || "");
  if (!s) return "--";
  if (s.length <= 18) return s;
  return `${s.slice(0, 10)}...${s.slice(-6)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clearColorClasses(node) {
  if (!node) return;
  node.classList.remove(
    "bullish-text",
    "bearish-text",
    "neutral-text",
    "live-status",
    "error-status",
    "signal-long",
    "signal-short",
    "signal-wait",
    "alert-risk",
    "alert-flow",
    "alert-opportunity"
  );
}

function setColor(id, mode) {
  const node = el(id);
  if (!node) return;
  clearColorClasses(node);

  if (mode === "bull") node.classList.add("bullish-text");
  else if (mode === "bear") node.classList.add("bearish-text");
  else if (mode === "live") node.classList.add("live-status");
  else if (mode === "error") node.classList.add("error-status");
  else node.classList.add("neutral-text");
}

function setSignedValue(id, value, formatter) {
  const node = el(id);
  if (!node) return;

  const n = Number(value);
  clearColorClasses(node);

  if (!Number.isFinite(n)) {
    node.textContent = "--";
    node.classList.add("neutral-text");
    return;
  }

  node.textContent = formatter(value);

  if (n > 0) node.classList.add("bullish-text");
  else if (n < 0) node.classList.add("bearish-text");
  else node.classList.add("neutral-text");
}

function setSignal(id, signal) {
  const node = el(id);
  if (!node) return;

  const s = String(signal || "WAIT").toUpperCase();
  node.textContent = s;
  clearColorClasses(node);

  if (s.includes("LONG")) node.classList.add("signal-long");
  else if (s.includes("SHORT")) node.classList.add("signal-short");
  else node.classList.add("signal-wait");
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `HTTP ${res.status}`);
  }
  return data;
}

async function getJsonWithRetry(url, retries = 2, delayMs = 1200) {
  let lastError = null;

  for (let i = 0; i <= retries; i += 1) {
    try {
      return await getJson(url);
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
function renderOverview(data) {
  text("systemStatus", data.status || "LIVE");
  text("lastUpdated", data.lastUpdated || "--");
  text("globalBias", data.marketBias || "--");
  text("totalMarketCap", money(data.totalMarketCap));
  text("totalVolume24h", money(data.totalVolume24h));
  text(
    "btcDominance",
    Number.isFinite(Number(data.btcDominance))
      ? `${Number(data.btcDominance).toFixed(1)}%`
      : "--"
  );
  text(
    "fearGreed",
    Number.isFinite(Number(data.fearGreed))
      ? String(Math.round(Number(data.fearGreed)))
      : "--"
  );

  setColor("systemStatus", "live");

  const bias = String(data.marketBias || "").toLowerCase();
  if (bias.includes("risk-off") || bias.includes("bear")) setColor("globalBias", "bear");
  else if (bias.includes("risk-on") || bias.includes("bull")) setColor("globalBias", "bull");
  else setColor("globalBias", "neutral");
}

function renderSummaryFromCoinFocus(list) {
  const first = Array.isArray(list) && list.length ? list[0] : null;

  text("topSetup", first ? `${first.symbol} / ${first.setupDirection}` : "--");
  text(
    "summaryConfidence",
    first && Number.isFinite(Number(first.confidenceScore))
      ? `${first.confidenceScore}%`
      : "--"
  );

  let risk = "Medium";
  if (first) {
    if (Number(first.liquidityRisk) >= 70) risk = "High";
    else if (Number(first.liquidityRisk) <= 40) risk = "Low";
  }

  text("riskLevel", risk);

  if (risk === "High") setColor("riskLevel", "bear");
  else if (risk === "Low") setColor("riskLevel", "bull");
  else setColor("riskLevel", "neutral");
}

function renderCoin(prefix, coin) {
  const signal = String(coin.signal || "WAIT").toUpperCase();

  text(`${prefix}Price`, money(coin.price));
  setSignedValue(`${prefix}5m`, coin.change5m, pct);
  setSignedValue(`${prefix}15m`, coin.change15m, pct);
  setSignedValue(`${prefix}1h`, coin.change1h, pct);
  setSignedValue(`${prefix}4h`, coin.change4h, pct);
  setSignedValue(`${prefix}Funding`, coin.funding, (v) => `${Number(v).toFixed(3)}%`);

  text(`${prefix}OI`, money(coin.oi));
  text(`${prefix}Bias`, coin.bias || "--");
  text(`${prefix}Entry`, money(coin.entry));
  text(`${prefix}SL`, money(coin.sl));
  text(`${prefix}TP`, money(coin.tp));

  setSignal(`${prefix}Signal`, signal);

  const biasText = String(coin.bias || "").toLowerCase();
  if (biasText.includes("bull")) setColor(`${prefix}Bias`, "bull");
  else if (biasText.includes("bear")) setColor(`${prefix}Bias`, "bear");
  else setColor(`${prefix}Bias`, "neutral");

  if (signal.includes("LONG")) {
    setColor(`${prefix}TP`, "bull");
    setColor(`${prefix}SL`, "bear");
  } else if (signal.includes("SHORT")) {
    setColor(`${prefix}TP`, "bear");
    setColor(`${prefix}SL`, "bull");
  } else {
    setColor(`${prefix}TP`, "neutral");
    setColor(`${prefix}SL`, "neutral");
  }
}

function renderCoinFocus(list) {
  const wrap = el("coinFocusGrid");
  if (!wrap) return;

  if (!Array.isArray(list) || list.length === 0) {
    wrap.innerHTML = `
      <div class="stat-card">
        <span>No coin focus data</span>
        <strong>--</strong>
      </div>
    `;
    return;
  }

  wrap.innerHTML = list
    .map((coin) => {
      const scoreClass =
        Number(coin.finalSetupScore) >= 65
          ? "bullish-text"
          : Number(coin.finalSetupScore) <= 40
          ? "bearish-text"
          : "neutral-text";

      const liquidityClass =
        String(coin.liquiditySignal || "").toLowerCase().includes("clean")
          ? "bullish-text"
          : String(coin.liquiditySignal || "").toLowerCase().includes("risk")
          ? "bearish-text"
          : "neutral-text";

      return `
        <article class="coin-focus-card">
          <div class="coin-focus-top">
            <div>
              <h3>${escapeHtml(coin.symbol || "--")}</h3>
              <p>${escapeHtml(coin.setupDirection || "--")}</p>
            </div>
            <div class="coin-focus-price">${escapeHtml(coin.price || "--")}</div>
          </div>

          <div class="coin-focus-score-row">
            <div class="metric-chip">
              <span>Setup Score</span>
              <strong class="${scoreClass}">${escapeHtml(String(coin.finalSetupScore ?? "--"))}</strong>
            </div>
            <div class="metric-chip">
              <span>Confidence</span>
              <strong>${escapeHtml(String(coin.confidenceScore ?? "--"))}%</strong>
            </div>
            <div class="metric-chip">
              <span>Liquidity</span>
              <strong class="${liquidityClass}">${escapeHtml(coin.liquiditySignal || "--")}</strong>
            </div>
          </div>

          <div class="coin-focus-mini-grid">
            <div><span>Trend</span><strong>${escapeHtml(coin.trendState || "--")}</strong></div>
            <div><span>Bias</span><strong>${escapeHtml(coin.bias || "--")}</strong></div>
            <div><span>Whales</span><strong>${escapeHtml(coin.longShortContext || "--")}</strong></div>
            <div><span>Funding</span><strong>${escapeHtml(coin.funding || "--")}</strong></div>
            <div><span>OI</span><strong>${escapeHtml(coin.oi || "--")}</strong></div>
            <div><span>Pending</span><strong>${escapeHtml(String(coin.pendingOrders ?? "--"))}</strong></div>
            <div><span>5m</span><strong>${escapeHtml(coin.change5m || "--")}</strong></div>
            <div><span>1h</span><strong>${escapeHtml(coin.change1h || "--")}</strong></div>
            <div><span>Entry</span><strong>${escapeHtml(coin.entry || "--")}</strong></div>
            <div><span>SL</span><strong>${escapeHtml(coin.sl || "--")}</strong></div>
            <div><span>TP</span><strong>${escapeHtml(coin.tp || "--")}</strong></div>
            <div><span>Macro</span><strong>${escapeHtml(coin.macroSentiment || "--")}</strong></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderWhales(rows) {
  const tbody = el("whaleTableBody");
  if (!tbody) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13">No whale data</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const action = String(row.action || "--");
      const cls = action.toLowerCase().includes("long")
        ? "whale-long"
        : action.toLowerCase().includes("short")
        ? "whale-short"
        : "";

      return `
        <tr>
          <td class="whale-address-cell">
            <a
              class="whale-address-link"
              href="${row.explorerUrl || "#"}"
              target="_blank"
              rel="noopener noreferrer"
              title="${escapeHtml(row.address || "--")}"
            >${escapeHtml(shortAddr(row.address))}</a>
          </td>
          <td>${escapeHtml(row.symbol || "--")}</td>
          <td class="${cls}">${escapeHtml(action)}</td>
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
}
function renderWhaleSummary(list) {
  const wrap = el("whaleSummaryGrid");
  if (!wrap) return;

  if (!Array.isArray(list) || list.length === 0) {
    wrap.innerHTML = `
      <div class="stat-card">
        <span>No whale summary</span>
        <strong>--</strong>
      </div>
    `;
    return;
  }

  wrap.innerHTML = list
    .map((item) => {
      const bias = String(item.netBias || "Mixed");
      const biasClass =
        bias === "Long Dominant"
          ? "bullish-text"
          : bias === "Short Dominant"
          ? "bearish-text"
          : "neutral-text";

      return `
        <article class="summary-card">
          <div class="summary-card-head">
            <h3>${escapeHtml(item.symbol || "--")}</h3>
            <strong class="${biasClass}">${escapeHtml(bias)}</strong>
          </div>

          <div class="summary-card-grid">
            <div><span>Whales</span><strong>${escapeHtml(String(item.whaleCount ?? "--"))}</strong></div>
            <div><span>Open Long</span><strong>${escapeHtml(item.openLongUsd || "--")}</strong></div>
            <div><span>Open Short</span><strong>${escapeHtml(item.openShortUsd || "--")}</strong></div>
            <div><span>Avg Long</span><strong>${escapeHtml(item.avgLongEntry || "--")}</strong></div>
            <div><span>Avg Short</span><strong>${escapeHtml(item.avgShortEntry || "--")}</strong></div>
            <div><span>Avg TP</span><strong>${escapeHtml(item.avgTp || "--")}</strong></div>
            <div><span>Avg SL</span><strong>${escapeHtml(item.avgSl || "--")}</strong></div>
            <div><span>Pending</span><strong>${escapeHtml(String(item.pendingOrders ?? "--"))}</strong></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderStablecoinFlows(list) {
  const wrap = el("stablecoinFlowGrid");
  if (!wrap) return;

  if (!Array.isArray(list) || list.length === 0) {
    wrap.innerHTML = `
      <div class="stat-card">
        <span>No stablecoin flow</span>
        <strong>--</strong>
      </div>
    `;
    return;
  }

  wrap.innerHTML = list
    .map((item) => {
      const netText = String(item.netFlow || "--");
      const netClass = netText.startsWith("-") ? "bearish-text" : "bullish-text";

      return `
        <article class="summary-card">
          <div class="summary-card-head">
            <h3>${escapeHtml(item.symbol || "--")}</h3>
            <strong class="${netClass}">${escapeHtml(netText)}</strong>
          </div>

          <div class="summary-card-grid">
            <div><span>Inflow</span><strong>${escapeHtml(item.exchangeInflow || "--")}</strong></div>
            <div><span>Outflow</span><strong>${escapeHtml(item.exchangeOutflow || "--")}</strong></div>
          </div>

          <p class="summary-card-note">${escapeHtml(item.interpretation || "--")}</p>
        </article>
      `;
    })
    .join("");
}

function renderAlerts(list) {
  const wrap = el("alertsGrid");
  if (!wrap) return;

  if (!Array.isArray(list) || list.length === 0) {
    wrap.innerHTML = `
      <div class="stat-card">
        <span>No alerts</span>
        <strong>--</strong>
      </div>
    `;
    return;
  }

  wrap.innerHTML = list
    .map((item) => {
      const type = String(item.type || "").toLowerCase();
      const typeClass =
        type === "opportunity"
          ? "alert-opportunity"
          : type === "flow"
          ? "alert-flow"
          : "alert-risk";

      return `
        <article class="alert-card ${typeClass}">
          <div class="alert-card-top">
            <span class="alert-type">${escapeHtml(item.type || "--")}</span>
            <strong>${escapeHtml(item.symbol || "--")}</strong>
          </div>
          <h3>${escapeHtml(item.title || "--")}</h3>
          <p>${escapeHtml(item.detail || "--")}</p>
        </article>
      `;
    })
    .join("");
}

function hideRawPanel() {
  const rawPanel = el("rawPanel");
  if (rawPanel) rawPanel.style.display = "none";
}

function bindTabs() {
  const map = {
    overview: "overviewSection",
    "coin focus": "coinFocusSection",
    whales: "whalesSection",
    alerts: "alertsSection",
    "ai chat": "aiChatPanel"
  };

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = function () {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const key = String(btn.textContent || "").trim().toLowerCase();
      const targetId = map[key];
      if (!targetId) return;

      const target = el(targetId);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
}

function addChatMessage(role, content) {
  const wrap = el("chatMessages");
  if (!wrap) return;

  const rowClass = role === "user" ? "chat-row-user" : "chat-row-ai";
  const bubbleClass = role === "user" ? "chat-bubble-user" : "chat-bubble-ai";

  const row = document.createElement("div");
  row.className = `chat-row ${rowClass}`;
  row.innerHTML = `<div class="chat-bubble ${bubbleClass}">${escapeHtml(content)}</div>`;

  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
}

function setChatLockedState(locked) {
  const chatInput = el("chatInput");
  const sendBtn = el("sendChatBtn");
  const chatStatus = el("chatStatus");

  if (chatInput) {
    chatInput.disabled = locked;
    chatInput.placeholder = locked
      ? "Login first to use AI chat..."
      : "Ask about BTC, ETH, BNB, risk, compare, entries...";
  }

  if (sendBtn) sendBtn.disabled = locked;

  if (chatStatus) {
    chatStatus.textContent = locked ? "Locked" : "Unlocked";
    chatStatus.classList.toggle("locked", locked);
    chatStatus.classList.toggle("unlocked", !locked);
  }

  text("loginState", locked ? "Owner-only analysis" : "Logged in");
}

function renderAll(data) {
  renderOverview(data.overview);
  renderSummaryFromCoinFocus(data.coinFocus);
  renderCoin("btc", data.btc);
  renderCoin("eth", data.eth);
  renderCoin("bnb", data.bnb);
  renderCoinFocus(data.coinFocus);
  renderWhales(data.whales);
  renderWhaleSummary(data.whaleSummary);
  renderStablecoinFlows(data.stablecoinFlows);
  renderAlerts(data.alerts);
  hideRawPanel();
}
async function loadDashboard() {
  const [overview, btc, eth, bnb, coinFocus, whales, whaleSummary, stablecoinFlows, alerts] =
    await Promise.all([
      getJsonWithRetry(`${API_BASE}/api/overview?v=1000`),
      getJsonWithRetry(`${API_BASE}/api/coin/btc?v=1000`),
      getJsonWithRetry(`${API_BASE}/api/coin/eth?v=1000`),
      getJsonWithRetry(`${API_BASE}/api/coin/bnb?v=1000`),
      getJsonWithRetry(`${API_BASE}/api/coin-focus?limit=12&v=1000`),
      getJsonWithRetry(`${API_BASE}/api/whales-mixed?limit=20&v=1000`),
      getJsonWithRetry(`${API_BASE}/api/whales-summary?v=1000`),
      getJsonWithRetry(`${API_BASE}/api/stablecoin-flows?v=1000`),
      getJsonWithRetry(`${API_BASE}/api/alerts?v=1000`)
    ]);

  const data = {
    overview,
    btc,
    eth,
    bnb,
    coinFocus,
    whales,
    whaleSummary,
    stablecoinFlows,
    alerts
  };

  lastGoodData = data;
  renderAll(data);
}

async function refreshDashboard() {
  try {
    await loadDashboard();
  } catch (err) {
    console.error("refresh error:", err);

    if (lastGoodData) {
      renderAll(lastGoodData);
      text("systemStatus", "LIVE");
      setColor("systemStatus", "live");
    } else {
      text("systemStatus", "ERROR");
      setColor("systemStatus", "error");
    }
  }
}

async function handleLogin() {
  const username = el("username")?.value || "";
  const password = el("password")?.value || "";

  try {
    await postJson(`${API_BASE}/api/login`, { username, password });
    isLoggedIn = true;
    setChatLockedState(false);
    addChatMessage("ai", "Login successful. AI chat unlocked.");
  } catch (err) {
    isLoggedIn = false;
    setChatLockedState(true);
    addChatMessage("ai", `Login failed: ${err.message}`);
  }
}

async function handleSendChat(customQuestion = "") {
  if (!isLoggedIn) return;

  const chatInput = el("chatInput");
  const question = String(customQuestion || chatInput?.value || "").trim();
  if (!question) return;

  addChatMessage("user", question);
  if (chatInput && !customQuestion) chatInput.value = "";

  try {
    const payload = {
      question,
      snapshot: JSON.stringify({
        overview: lastGoodData?.overview || null,
        coins: {
          btc: lastGoodData?.btc || null,
          eth: lastGoodData?.eth || null,
          bnb: lastGoodData?.bnb || null
        },
        whales: lastGoodData?.whales || [],
        coinFocus: lastGoodData?.coinFocus || [],
        alerts: lastGoodData?.alerts || []
      })
    };

    const res = await postJson(`${API_BASE}/api/chat`, payload);
    addChatMessage("ai", res?.reply || "No reply");
  } catch (err) {
    addChatMessage("ai", `Chat error: ${err.message}`);
  }
}

function bindChat() {
  const loginBtn = el("loginBtn");
  const sendBtn = el("sendChatBtn");
  const askAnalyzeBTC = el("askAnalyzeBTC");
  const askCompareCoins = el("askCompareCoins");
  const askRisk = el("askRisk");
  const chatInput = el("chatInput");

  if (loginBtn) loginBtn.onclick = handleLogin;
  if (sendBtn) sendBtn.onclick = () => handleSendChat();

  if (askAnalyzeBTC) {
    askAnalyzeBTC.onclick = () => handleSendChat("Analyze BTC setup now");
  }

  if (askCompareCoins) {
    askCompareCoins.onclick = () => handleSendChat("Compare BTC ETH and BNB now");
  }

  if (askRisk) {
    askRisk.onclick = () => handleSendChat("What is the current market risk");
  }

  if (chatInput) {
    chatInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        handleSendChat();
      }
    });
  }

  setChatLockedState(true);
}

async function startDashboard() {
  if (started) return;
  started = true;

  bindTabs();
  bindChat();
  hideRawPanel();

  await refreshDashboard();

  refreshTimer = setInterval(refreshDashboard, 30000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startDashboard, { once: true });
} else {
  startDashboard();
}
