function renderOverview(data) {
  setText("systemStatus", data.status || "LIVE");
  setText("lastUpdated", data.lastUpdated || "--");
  setText("globalBias", data.marketBias || "--");

  setText("totalMarketCap", formatMoney(data.totalMarketCap));
  setText("totalVolume24h", formatMoney(data.totalVolume24h));
  setText(
    "btcDominance",
    Number.isFinite(Number(data.btcDominance)) ? `${Number(data.btcDominance).toFixed(1)}%` : "--"
  );
  setText(
    "fearGreed",
    Number.isFinite(Number(data.fearGreed)) ? String(data.fearGreed) : "--"
  );

  setText("topSetup", "BTC / LIVE");
  setText("summaryConfidence", "72%");
  setText("riskLevel", data.marketBias === "Risk-Off" ? "High" : data.marketBias === "Risk-On" ? "Low" : "Medium");
}

function renderCoin(prefix, coin) {
  setText(`${prefix}Price`, formatMoney(coin.price));
  setText(`${prefix}5m`, formatPercent(coin.change5m));
  setText(`${prefix}15m`, formatPercent(coin.change15m));
  setText(`${prefix}1h`, formatPercent(coin.change1h));
  setText(`${prefix}4h`, formatPercent(coin.change4h));

  setText(
    `${prefix}Funding`,
    Number.isFinite(Number(coin.funding)) ? `${Number(coin.funding).toFixed(3)}%` : "--"
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
      const actionClass =
        action.toLowerCase().includes("long")
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
  try {
    let overview = loadMockOverviewData();
    let coins = loadMockCoinData();
    let whales = loadMockWhaleData();

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
      const whaleRows = await fetchJson(`${API_BASE}/api/whales?v=2`);
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
