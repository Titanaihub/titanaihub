const API_BASE = "https://titan-ai-api.onrender.com";

let started = false;
let refreshTimer = null;
let lastGoodData = null;

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
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
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
    "signal-wait"
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

  text("topSetup", "BTC / LIVE");
  text("summaryConfidence", "72%");

  let risk = "Medium";
  if (data.marketBias === "Risk-Off") risk = "High";
  if (data.marketBias === "Risk-On") risk = "Low";
  text("riskLevel", risk);

  setColor("systemStatus", "live");

  const bias = String(data.marketBias || "").toLowerCase();
  if (bias.includes("risk-off") || bias.includes("bear")) setColor("globalBias", "bear");
  else if (bias.includes("risk-on") || bias.includes("bull")) setColor("globalBias", "bull");
  else setColor("globalBias", "neutral");

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

function renderWhales(rows) {
  const tbody = el("whaleTableBody");
  if (!tbody) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">No whale data</td></tr>`;
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
              title="${row.address || "--"}"
            >${shortAddr(row.address)}</a>
          </td>
          <td>${row.symbol || "--"}</td>
          <td class="${cls}">${action}</td>
          <td>${row.position || "--"}</td>
          <td>${row.price || "--"}</td>
          <td>${row.time || "--"}</td>
        </tr>
      `;
    })
    .join("");
}

function hideRawPanel() {
  const rawPanel = el("rawPanel");
  if (rawPanel) rawPanel.style.display = "none";

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (String(btn.textContent || "").trim().toLowerCase() === "raw") {
      btn.style.display = "none";
    }
  });
}

function bindTabs() {
  const map = {
    overview: "overviewSection",
    coins: "coinsSection",
    whales: "whalesSection",
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

function renderAll(data) {
  renderOverview(data.overview);
  renderCoin("btc", data.btc);
  renderCoin("eth", data.eth);
  renderCoin("bnb", data.bnb);
  renderWhales(data.whales);
  hideRawPanel();
}

async function loadDashboard() {
  const [overview, btc, eth, bnb, whales] = await Promise.all([
    getJsonWithRetry(`${API_BASE}/api/overview`),
    getJsonWithRetry(`${API_BASE}/api/coin/btc`),
    getJsonWithRetry(`${API_BASE}/api/coin/eth`),
    getJsonWithRetry(`${API_BASE}/api/coin/bnb`),
    getJsonWithRetry(`${API_BASE}/api/whales`)
  ]);

  const data = { overview, btc, eth, bnb, whales };
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

async function startDashboard() {
  if (started) return;
  started = true;

  bindTabs();
  hideRawPanel();

  await refreshDashboard();

  refreshTimer = setInterval(refreshDashboard, 30000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startDashboard, { once: true });
} else {
  startDashboard();
}
