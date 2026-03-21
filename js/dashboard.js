window.TitanDashboard = {
  el(id) {
    return document.getElementById(id);
  },

  setText(id, value) {
    const node = this.el(id);
    if (node) node.textContent = value ?? "--";
  },

  formatCompactNumber(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";

    const abs = Math.abs(num);

    if (abs >= 1e12) return `$${(num / 1e12).toFixed(digits)}T`;
    if (abs >= 1e9) return `$${(num / 1e9).toFixed(digits)}B`;
    if (abs >= 1e6) return `$${(num / 1e6).toFixed(digits)}M`;
    if (abs >= 1e3) return `$${(num / 1e3).toFixed(digits)}K`;

    return `$${num.toFixed(digits)}`;
  },

  formatNumber(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return num.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  },

  formatPercent(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    const sign = num > 0 ? "+" : "";
    return `${sign}${num.toFixed(digits)}%`;
  },

  formatPlainPercent(value, digits = 1) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return `${num.toFixed(digits)}%`;
  },

  formatFunding(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return `${num.toFixed(3)}%`;
  },

  formatOI(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return this.formatCompactNumber(num, 2);
  },

  formatPrice(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";

    if (num >= 1000) return this.formatCompactNumber(num, 2);
    if (num >= 100) return `$${num.toFixed(2)}`;
    if (num >= 1) return `$${num.toFixed(2)}`;
    return `$${num.toFixed(4)}`;
  },

  normalizeSignal(signal) {
    const text = String(signal || "WAIT").toUpperCase();

    if (text.includes("LONG") || text === "BUY") {
      return { text, cls: "long" };
    }

    if (text.includes("SHORT") || text === "SELL") {
      return { text, cls: "short" };
    }

    return { text, cls: "neutral" };
  },

  renderOverview(overview = {}) {
    this.setText("systemStatus", overview.status || "LIVE");
    this.setText("lastUpdated", overview.lastUpdate || "--");
    this.setText("globalBias", overview.marketBias || "--");

    this.setText("totalMarketCap", this.formatCompactNumber(overview.totalMarketCap, 2));
    this.setText("totalVolume24h", this.formatCompactNumber(overview.totalVolume24h, 2));
    this.setText("btcDominance", this.formatPlainPercent(overview.btcDominance, 1));
    this.setText("fearGreed", Number.isFinite(Number(overview.fearGreed)) ? String(overview.fearGreed) : "--");

    this.setText("topSetup", `BTC / ${String(overview.topSetupSignal || "WAIT").toUpperCase()}`);
    this.setText("summaryConfidence", overview.summaryConfidence ? `${overview.summaryConfidence}%` : "64%");
    this.setText("riskLevel", overview.riskLevel || "Medium");
  },

  renderCoin(symbol, coin = {}) {
    const key = String(symbol).toLowerCase();
    const upper = key.toUpperCase();

    const signalNode = this.el(`${key}Signal`);
    const signal = this.normalizeSignal(coin.signal);

    if (signalNode) {
      signalNode.textContent = signal.text;
      signalNode.className = `signal ${signal.cls}`;
    }

    this.setText(`${key}Price`, this.formatPrice(coin.price));
    this.setText(`${key}5m`, this.formatPercent(coin.change5m, 2));
    this.setText(`${key}15m`, this.formatPercent(coin.change15m, 2));
    this.setText(`${key}1h`, this.formatPercent(coin.change1h, 2));
    this.setText(`${key}4h`, this.formatPercent(coin.change4h, 2));

    this.setText(`${key}Funding`, this.formatFunding(coin.funding));
    this.setText(`${key}OI`, this.formatOI(coin.oi));
    this.setText(`${key}Bias`, coin.bias || "--");
    this.setText(`${key}Entry`, Number.isFinite(Number(coin.entry)) ? this.formatNumber(coin.entry, 0) : "--");
    this.setText(`${key}SL`, Number.isFinite(Number(coin.sl)) ? this.formatNumber(coin.sl, 0) : "--");
    this.setText(`${key}TP`, Number.isFinite(Number(coin.tp)) ? this.formatNumber(coin.tp, 0) : "--");

    const card = this.el(`coin-${key}`);
    if (card) {
      card.setAttribute("data-symbol", upper);
    }
  },

  renderWhales(rows = []) {
    const body = this.el("whaleTableBody");
    if (!body) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      body.innerHTML = `<tr><td colspan="6">No whale activity available.</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map((row) => {
        const action = String(row.action || "--");
        return `
          <tr>
            <td>${row.address || "--"}</td>
            <td>${row.symbol || "--"}</td>
            <td>${action}</td>
            <td>${row.position || "--"}</td>
            <td>${row.price || "--"}</td>
            <td>${row.time || "--"}</td>
          </tr>
        `;
      })
      .join("");
  },

  renderRawSnapshot(snapshot = {}) {
    const raw = this.el("rawSnapshot");
    if (!raw) return;

    try {
      raw.textContent = JSON.stringify(snapshot, null, 2);
    } catch {
      raw.textContent = "Unable to render raw snapshot.";
    }
  }
};
