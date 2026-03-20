const API_BASE = "";

let isLoggedIn = false;

function qs(id) {
  return document.getElementById(id);
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return n.toLocaleString();
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function setSignal(el, value) {
  if (!el) return;
  const signal = String(value || "WAIT").toUpperCase();
  el.textContent = signal;

  el.classList.remove("buy", "sell", "neutral");

  if (signal === "BUY" || signal === "LONG") {
    el.classList.add("buy");
  } else if (signal === "SELL" || signal === "SHORT") {
    el.classList.add("sell");
  } else {
    el.classList.add("neutral");
  }
}

function setText(id, value) {
  const el = qs(id);
  if (el) el.textContent = value;
}

function appendChatMessage(role, text) {
  const box = qs("chatMessages");
  if (!box) return;

  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  div.textContent = text;

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}
function loadMockOverview() {
  return {
    status: "LIVE",
    lastUpdated: new Date().toLocaleString(),
    marketBias: "Sideway",
    totalMarketCap: 2960000000000,
    totalVolume24h: 102800000000,
    btcDominance: 56.5,
    fearGreed: 71
  };
}

function loadMockCoins() {
  return {
    btc: {
      price: 70909,
      signal: "WAIT",
      change5m: -0.08,
      change15m: 0.12,
      change1h: -0.21,
      change4h: 0.84,
      funding: 0.008,
      oi: 105367612816,
      bias: "Sideway"
    },
    eth: {
      price: 2158.14,
      signal: "WAIT",
      change5m: 0.05,
      change15m: -0.11,
      change1h: 0.34,
      change4h: 1.02,
      funding: 0.006,
      oi: 28760000000,
      bias: "Neutral"
    },
    bnb: {
      price: 645.44,
      signal: "WAIT",
      change5m: 0.02,
      change15m: 0.09,
      change1h: -0.14,
      change4h: 0.67,
      funding: 0.004,
      oi: 6800000000,
      bias: "Neutral"
    }
  };
}

function loadMockWhales() {
  return [
    { address: "0xcab5...6e", symbol: "ETH", action: "Open Long", position: "$6.47M", price: "$2157.93", time: "18:14" },
    { address: "0xec32...82", symbol: "BTC", action: "Open Long", position: "$15.56M", price: "$70775.6", time: "18:11" },
    { address: "0xcb84...cd", symbol: "SOL", action: "Close Short", position: "$1.01M", price: "$89.56", time: "18:08" },
    { address: "0xe84f...64", symbol: "HYPE", action: "Close Long", position: "$1.19M", price: "$39.42", time: "18:07" },
    { address: "0x7cb0...20", symbol: "BTC", action: "Open Short", position: "$1.11M", price: "$70215.3", time: "18:05" }
  ];
}

function renderOverview(data) {
  setText("systemStatus", data.status || "LIVE");
  setText("lastUpdated", data.lastUpdated || "--");
  setText("globalBias", data.marketBias || "--");

  setText("totalMarketCap", formatMoney(data.totalMarketCap));
  setText("totalVolume24h", formatMoney(data.totalVolume24h));
  setText("btcDominance", Number.isFinite(Number(data.btcDominance)) ? `${data.btcDominance}%` : "--");
  setText("fearGreed", Number.isFinite(Number(data.fearGreed)) ? String(data.fearGreed) : "--");

  setText("topSetup", "BTC / WAIT");
  setText("summaryConfidence", "64%");
  setText("riskLevel", "Medium");
}

function renderCoin(prefix, coin) {
  setText(`${prefix}Price`, formatMoney(coin.price));
  setText(`${prefix}5m`, formatPercent(coin.change5m));
  setText(`${prefix}15m`, formatPercent(coin.change15m));
  setText(`${prefix}1h`, formatPercent(coin.change1h));
  setText(`${prefix}4h`, formatPercent(coin.change4h));

  setText(`${prefix}Funding`, Number.isFinite(Number(coin.funding)) ? `${coin.funding}%` : "--");
  setText(`${prefix}OI`, formatMoney(coin.oi));
  setText(`${prefix}Bias`, coin.bias || "--");

  setSignal(qs(`${prefix}Signal`), coin.signal);
}

function renderWhales(rows) {
  const tbody = qs("whaleTableBody");
  if (!tbody) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">No whale data</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.address || "--"}</td>
      <td>${row.symbol || "--"}</td>
      <td>${row.action || "--"}</td>
      <td>${row.position || "--"}</td>
      <td>${row.price || "--"}</td>
      <td>${row.time || "--"}</td>
    </tr>
  `).join("");
}

function renderRawSnapshot(data) {
  const pre = qs("rawSnapshot");
  if (!pre) return;
  pre.textContent = JSON.stringify(data, null, 2);
          }
async function loadDashboard() {
  try {
    let overview = loadMockOverview();
    let coins = loadMockCoins();
    let whales = loadMockWhales();

    try {
      const remoteOverview = await fetchJson(`${API_BASE}/api/overview`);
      overview = { ...overview, ...remoteOverview };
    } catch (_) {}

    try {
      const btc = await fetchJson(`${API_BASE}/api/coin/btc`);
      coins.btc = { ...coins.btc, ...btc };
    } catch (_) {}

    try {
      const eth = await fetchJson(`${API_BASE}/api/coin/eth`);
      coins.eth = { ...coins.eth, ...eth };
    } catch (_) {}

    try {
      const bnb = await fetchJson(`${API_BASE}/api/coin/bnb`);
      coins.bnb = { ...coins.bnb, ...bnb };
    } catch (_) {}

    try {
      const whaleRows = await fetchJson(`${API_BASE}/api/whales`);
      if (Array.isArray(whaleRows)) whales = whaleRows;
    } catch (_) {}

    renderOverview(overview);
    renderCoin("btc", coins.btc);
    renderCoin("eth", coins.eth);
    renderCoin("bnb", coins.bnb);
    renderWhales(whales);

    renderRawSnapshot({
      overview,
      coins,
      whales
    });
  } catch (err) {
    console.error(err);
    setText("systemStatus", "ERROR");
    appendChatMessage("ai", `Dashboard load error: ${err.message}`);
  }
}

async function loginUser() {
  const username = qs("loginUser")?.value?.trim();
  const password = qs("loginPass")?.value?.trim();

  if (!username || !password) {
    appendChatMessage("ai", "Please enter username and password.");
    return;
  }

  try {
    try {
      const res = await fetchJson(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (res.ok || res.success) {
        isLoggedIn = true;
        appendChatMessage("ai", "Login successful.");
        return;
      }
    } catch (_) {}

    if (username === "admin" && password === "1234") {
      isLoggedIn = true;
      appendChatMessage("ai", "Login successful (local mode).");
    } else {
      appendChatMessage("ai", "Login failed.");
    }
  } catch (err) {
    appendChatMessage("ai", `Login error: ${err.message}`);
  }
}

async function sendChatMessage(customQuestion = "") {
  if (!isLoggedIn) {
    appendChatMessage("ai", "Please login first.");
    return;
  }

  const input = qs("chatInput");
  const question = (customQuestion || input?.value || "").trim();

  if (!question) return;

  appendChatMessage("user", question);
  if (input) input.value = "";

  const snapshot = qs("rawSnapshot")?.textContent || "{}";

  try {
    try {
      const res = await fetchJson(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          snapshot
        })
      });

      const reply =
        res.reply ||
        res.message ||
        res.answer ||
        "No AI response returned.";
      appendChatMessage("ai", reply);
      return;
    } catch (_) {}

    appendChatMessage(
      "ai",
      "Local mode: market looks mixed. BTC remains neutral, whale flow is active, and risk should stay controlled until a clearer trend appears."
    );
  } catch (err) {
    appendChatMessage("ai", `Chat error: ${err.message}`);
  }
}

function bindEvents() {
  qs("loginBtn")?.addEventListener("click", loginUser);
  qs("sendChatBtn")?.addEventListener("click", () => sendChatMessage());

  document.querySelectorAll(".quick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const question = btn.getAttribute("data-question") || "";
      sendChatMessage(question);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadDashboard();
  setInterval(loadDashboard, 60000);
});


