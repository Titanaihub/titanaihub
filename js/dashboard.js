(function () {
  const API_BASE = window.location.origin;

  function qs(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = qs(id);
    if (el) el.textContent = value;
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
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

  function setSignal(el, signal) {
    if (!el) return;
    const s = String(signal || "WAIT").toUpperCase();
    el.textContent = s;

    el.classList.remove("signal-long", "signal-short", "signal-wait");

    if (s.includes("LONG")) el.classList.add("signal-long");
    else if (s.includes("SHORT")) el.classList.add("signal-short");
    else el.classList.add("signal-wait");
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
      Number.isFinite(Number(data.fearGreed)) ? String(data.fearGreed) : "--"
    );

    setText("topSetup", "BTC / LIVE");
    setText("summaryConfidence", "72%");
    setText(
      "riskLevel",
      data.marketBias === "Risk-Off"
        ? "High"
        : data.marketBias === "Risk-On"
        ? "Low"
        : "Medium"
    );
  }

  function renderCoin(prefix, coin) {
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

    setSignal(qs(`${prefix}Signal`), coin.signal);
  }

  function renderWhales(rows) {
    const tbody = qs("whaleTableBody");
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

        return `
          <tr>
            <td class="whale-address">${row.address || "--"}</td>
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

  function renderRawSnapshot(data) {
    const pre = qs("rawSnapshot");
    if (!pre) return;
    pre.textContent = JSON.stringify(data, null, 2);
  }

  async function loadDashboard() {
    const raw = qs("rawSnapshot");
    if (raw) raw.textContent = "Loading...";

    try {
      const [overview, btc, eth, bnb, whales] = await Promise.all([
        fetchJson(`${API_BASE}/api/overview?v=5`),
        fetchJson(`${API_BASE}/api/coin/btc?v=5`),
        fetchJson(`${API_BASE}/api/coin/eth?v=5`),
        fetchJson(`${API_BASE}/api/coin/bnb?v=5`),
        fetchJson(`${API_BASE}/api/whales?v=5`)
      ]);

      renderOverview(overview || {});
      renderCoin("btc", btc || {});
      renderCoin("eth", eth || {});
      renderCoin("bnb", bnb || {});
      renderWhales(Array.isArray(whales) ? whales : []);

      renderRawSnapshot({
        overview,
        coins: { btc, eth, bnb },
        whales
      });
    } catch (err) {
      console.error("dashboard load failed:", err);

      setText("systemStatus", "ERROR");
      setText("lastUpdated", "--");
      setText("globalBias", "--");

      const tbody = qs("whaleTableBody");
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6">Load error</td></tr>`;
      }

      if (raw) raw.textContent = `Dashboard load error: ${err.message}`;
    }
  }

  window.loadDashboard = loadDashboard;

  document.addEventListener("DOMContentLoaded", loadDashboard);
})();
