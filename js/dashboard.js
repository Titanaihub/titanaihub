(function () {
  const API_BASE = window.location.origin;

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${url}`);
    }
    return res.json();
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";

    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  }

  function formatPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  }

  function shortAddress(addr) {
    const s = String(addr || "");
    if (!s) return "--";
    if (s.length <= 18) return s;
    return `${s.slice(0, 10)}...${s.slice(-6)}`;
  }

  function setSignal(prefix, signal) {
    const el = byId(`${prefix}Signal`);
    if (!el) return;

    const s = String(signal || "WAIT").toUpperCase();
    el.textContent = s;
    el.classList.remove("signal-long", "signal-short", "signal-wait");

    if (s.includes("LONG")) {
      el.classList.add("signal-long");
    } else if (s.includes("SHORT")) {
      el.classList.add("signal-short");
    } else {
      el.classList.add("signal-wait");
    }
  }

  function setStatusColor() {
    const el = byId("systemStatus");
    if (!el) return;

    const value = String(el.textContent || "").trim().toUpperCase();
    el.classList.remove("live-status", "error-status");

    if (value === "LIVE") {
      el.classList.add("live-status");
    } else if (value === "ERROR") {
      el.classList.add("error-status");
    }
  }

  function setBiasColor(id, value) {
    const el = byId(id);
    if (!el) return;

    const text = String(value || "").toLowerCase();
    el.classList.remove("bullish-text", "bearish-text", "neutral-text");

    if (text.includes("bullish") || text.includes("long")) {
      el.classList.add("bullish-text");
    } else if (text.includes("bearish") || text.includes("short")) {
      el.classList.add("bearish-text");
    } else {
      el.classList.add("neutral-text");
    }
  }

  function setLevelColor(id, label, value, signal) {
    const el = byId(id);
    if (!el) return;

    const sig = String(signal || "").toUpperCase();
    const lowerLabel = String(label || "").toLowerCase();

    el.classList.remove("bullish-text", "bearish-text", "neutral-text");

    if (lowerLabel.includes("tp")) {
      if (sig.includes("LONG")) el.classList.add("bullish-text");
      else if (sig.includes("SHORT")) el.classList.add("bearish-text");
      else el.classList.add("neutral-text");
    } else if (lowerLabel.includes("sl")) {
      if (sig.includes("LONG")) el.classList.add("bearish-text");
      else if (sig.includes("SHORT")) el.classList.add("bullish-text");
      else el.classList.add("neutral-text");
    } else {
      const n = Number(value);
      if (Number.isFinite(n)) {
        el.classList.add("neutral-text");
      }
    }
  }

  function renderOverview(data) {
    setText("systemStatus", data.status || "LIVE");
    setText("lastUpdated", data.lastUpdated || "--");
    setText("globalBias", data.marketBias || "--");
    setText("totalMarketCap", formatMoney(data.totalMarketCap));
    setText("totalVolume24h", formatMoney(data.totalVolume24h));

    setText(
      "btcDominance",
      Number.isFinite(Number(data.btcDominance))
        ? `${Number(data.btcDominance).toFixed(1)}%`
        : "--"
    );

    setText(
      "fearGreed",
      Number.isFinite(Number(data.fearGreed))
        ? String(Math.round(Number(data.fearGreed)))
        : "--"
    );

    setText("topSetup", "BTC / LIVE");
    setText("summaryConfidence", "72%");

    let riskLevel = "Medium";
    if (data.marketBias === "Risk-Off") riskLevel = "High";
    if (data.marketBias === "Risk-On") riskLevel = "Low";
    setText("riskLevel", riskLevel);

    setStatusColor();
    setBiasColor("globalBias", data.marketBias || "--");
  }

  function renderCoin(prefix, coin) {
    const signal = String(coin.signal || "WAIT").toUpperCase();

    setText(`${prefix}Price`, formatMoney(coin.price));
    setText(`${prefix}5m`, formatPercent(coin.change5m));
    setText(`${prefix}15m`, formatPercent(coin.change15m));
    setText(`${prefix}1h`, formatPercent(coin.change1h));
    setText(`${prefix}4h`, formatPercent(coin.change4h));

    setText(
      `${prefix}Funding`,
      Number.isFinite(Number(coin.funding))
        ? `${Number(coin.funding).toFixed(3)}%`
        : "--"
    );

    setText(`${prefix}OI`, formatMoney(coin.oi));
    setText(`${prefix}Bias`, coin.bias || "--");
    setText(`${prefix}Entry`, formatMoney(coin.entry));
    setText(`${prefix}SL`, formatMoney(coin.sl));
    setText(`${prefix}TP`, formatMoney(coin.tp));

    setSignal(prefix, signal);
    setBiasColor(`${prefix}Bias`, coin.bias || "--");
    setLevelColor(`${prefix}SL`, "sl", coin.sl, signal);
    setLevelColor(`${prefix}TP`, "tp", coin.tp, signal);
  }

  function renderWhales(rows) {
    const tbody = byId("whaleTableBody");
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No whale data</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((row) => {
        const action = String(row.action || "--");
        const actionClass = action.toLowerCase().includes("long")
          ? "whale-long"
          : action.toLowerCase().includes("short")
          ? "whale-short"
          : "";

        const fullAddress = row.address || "--";
        const displayAddress = shortAddress(fullAddress);
        const href = row.explorerUrl || "#";
        const safeHref = href === "#" ? "#" : href;

        return `
          <tr>
            <td class="whale-address-cell">
              <a
                class="whale-address-link"
                href="${safeHref}"
                target="_blank"
                rel="noopener noreferrer"
                title="${fullAddress}"
              >${displayAddress}</a>
            </td>
            <td>${row.symbol || "--"}</td>
            <td class="${actionClass}">${action}</td>
            <td>${row.position || "--"}</td>
            <td>${row.price || "--"}</td>
            <td>${row.time || "--"}</td>
          </tr>
        `;
      })
      .join("");
  }

  function setRawPanelHidden() {
    const rawPanel = byId("rawPanel");
    if (rawPanel) {
      rawPanel.style.display = "none";
    }
  }

  function renderError(message) {
    setText("systemStatus", "ERROR");
    setText("lastUpdated", "--");
    setText("globalBias", "--");
    setText("totalMarketCap", "--");
    setText("totalVolume24h", "--");
    setText("btcDominance", "--");
    setText("fearGreed", "--");

    ["btc", "eth", "bnb"].forEach((prefix) => {
      setText(`${prefix}Price`, "--");
      setText(`${prefix}5m`, "--");
      setText(`${prefix}15m`, "--");
      setText(`${prefix}1h`, "--");
      setText(`${prefix}4h`, "--");
      setText(`${prefix}Funding`, "--");
      setText(`${prefix}OI`, "--");
      setText(`${prefix}Bias`, "--");
      setText(`${prefix}Entry`, "--");
      setText(`${prefix}SL`, "--");
      setText(`${prefix}TP`, "--");
      setSignal(prefix, "WAIT");
    });

    const tbody = byId("whaleTableBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6">Load error: ${message}</td></tr>`;
    }

    setStatusColor();
  }

  function bindTopTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    const sectionMap = {
      Overview: "overviewSection",
      Coins: "coinsSection",
      Whales: "whalesSection",
      "AI Chat": "aiChatPanel"
    };

    buttons.forEach((btn) => {
      btn.addEventListener("click", function () {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const label = String(btn.textContent || "").trim();
        const targetId = sectionMap[label];
        if (!targetId) return;

        const target = byId(targetId);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  async function loadDashboard() {
    try {
      const [overview, btc, eth, bnb, whales] = await Promise.all([
        getJson(`${API_BASE}/api/overview?v=200`),
        getJson(`${API_BASE}/api/coin/btc?v=200`),
        getJson(`${API_BASE}/api/coin/eth?v=200`),
        getJson(`${API_BASE}/api/coin/bnb?v=200`),
        getJson(`${API_BASE}/api/whales?v=200`)
      ]);

      renderOverview(overview || {});
      renderCoin("btc", btc || {});
      renderCoin("eth", eth || {});
      renderCoin("bnb", bnb || {});
      renderWhales(Array.isArray(whales) ? whales : []);
      setRawPanelHidden();
    } catch (err) {
      console.error("dashboard load failed:", err);
      renderError(err.message || "Unknown error");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindTopTabs();
    loadDashboard();
    setInterval(loadDashboard, 60000);
  });
})();
