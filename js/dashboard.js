window.TitanDashboard = {
  renderOverview(data) {
    const H = window.TitanHelpers;
    H.setText("systemStatus", data.status || "LIVE");
    H.setText("lastUpdated", data.lastUpdated || "--");
    H.setText("globalBias", data.marketBias || "--");
    H.setText("totalMarketCap", H.formatMoney(data.totalMarketCap));
    H.setText("totalVolume24h", H.formatMoney(data.totalVolume24h));
    H.setText("btcDominance", `${data.btcDominance}%`);
    H.setText("fearGreed", String(data.fearGreed));
    H.setText("topSetup", "BTC / WAIT");
    H.setText("summaryConfidence", "64%");
    H.setText("riskLevel", "Medium");
  },

  renderCoin(prefix, coin) {
    const H = window.TitanHelpers;
    H.setText(`${prefix}Price`, H.formatMoney(coin.price));
    H.setText(`${prefix}5m`, H.formatPercent(coin.change5m));
    H.setText(`${prefix}15m`, H.formatPercent(coin.change15m));
    H.setText(`${prefix}1h`, H.formatPercent(coin.change1h));
    H.setText(`${prefix}4h`, H.formatPercent(coin.change4h));
    H.setText(`${prefix}Funding`, `${coin.funding}%`);
    H.setText(`${prefix}OI`, H.formatMoney(coin.oi));
    H.setText(`${prefix}Bias`, coin.bias || "--");
    H.setText(`${prefix}Entry`, H.formatMoney(coin.entry));
    H.setText(`${prefix}SL`, H.formatMoney(coin.sl));
    H.setText(`${prefix}TP`, H.formatMoney(coin.tp));
    H.setSignal(document.getElementById(`${prefix}Signal`), coin.signal);
  },

  renderWhales(rows) {
    const tbody = document.getElementById("whaleTableBody");
    if (!tbody) return;
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
  },

  renderRawSnapshot(data) {
    const pre = document.getElementById("rawSnapshot");
    if (pre) pre.textContent = JSON.stringify(data, null, 2);
  }
};
