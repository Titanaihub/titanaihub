window.TitanRenderCoinFocus = (() => {
  const {
    escapeHtml,
    formatMaybe,
    formatPrice,
    getSignalClass,
    getSignedClass,
    getBiasClass
  } = window.TitanFormatters;

  function setText(node, value) {
    if (!node) return;
    node.textContent = formatMaybe(value);
  }

  function buildMetricBox(label, value, valueClass = "") {
    return `
      <div class="metric-box">
        <span>${escapeHtml(label)}</span>
        <strong class="${escapeHtml(valueClass)}">${escapeHtml(formatMaybe(value))}</strong>
      </div>
    `;
  }

  function normalizeDisplayPrice(value) {
    if (typeof value === "number") return formatPrice(value);
    const n = Number(value);
    if (Number.isFinite(n)) return formatPrice(n);
    return formatMaybe(value);
  }

  function renderSingleCoin(elements, prefix, data) {
    if (!data) return;

    const priceNode = elements[`${prefix}Price`];
    const signalNode = elements[`${prefix}Signal`];
    const m5Node = elements[`${prefix}5m`];
    const m15Node = elements[`${prefix}15m`];
    const h1Node = elements[`${prefix}1h`];
    const h4Node = elements[`${prefix}4h`];
    const fundingNode = elements[`${prefix}Funding`];
    const oiNode = elements[`${prefix}OI`];
    const biasNode = elements[`${prefix}Bias`];
    const entryNode = elements[`${prefix}Entry`];
    const slNode = elements[`${prefix}SL`];
    const tpNode = elements[`${prefix}TP`];

    setText(priceNode, normalizeDisplayPrice(data.priceFormatted || data.priceText || data.price));
    setText(signalNode, data.signal || "WAIT");
    setText(m5Node, formatMaybe(data.change5m || "--"));
    setText(m15Node, formatMaybe(data.change15m || "--"));
    setText(h1Node, formatMaybe(data.change1h || "--"));
    setText(h4Node, formatMaybe(data.change4h || "--"));
    setText(fundingNode, formatMaybe(data.funding || "--"));
    setText(oiNode, formatMaybe(data.oi || "--"));
    setText(biasNode, data.bias || "--");
    setText(entryNode, normalizeDisplayPrice(data.entry));
    setText(slNode, normalizeDisplayPrice(data.sl));
    setText(tpNode, normalizeDisplayPrice(data.tp));

    if (signalNode) {
      signalNode.className = `signal-badge ${getSignalClass(data.signal)}`;
    }

    [m5Node, m15Node, h1Node, h4Node].forEach((node) => {
      if (!node) return;
      node.classList.remove("pos", "neg", "flat");
      node.classList.add(getSignedClass(node.textContent));
    });

    if (biasNode) {
      biasNode.classList.remove("pos", "neg", "flat");
      biasNode.classList.add(getBiasClass(data.bias || ""));
    }
  }

  function renderCoinSnapshots(elements, snapshot) {
    const coins = snapshot?.coins || {};
    renderSingleCoin(elements, "btc", coins.btc || null);
    renderSingleCoin(elements, "eth", coins.eth || null);
    renderSingleCoin(elements, "bnb", coins.bnb || null);
  }

  function renderCoinFocus(elements, snapshot) {
    const items = Array.isArray(snapshot?.coinFocus) ? snapshot.coinFocus : [];
    const mount = elements.coinFocusGrid;

    if (!mount) return;

    if (!items.length) {
      mount.innerHTML = `
        <div class="stat-card">
          <span>No coin focus data</span>
          <strong>--</strong>
        </div>
      `;
      return;
    }

    const html = items
      .slice(0, 12)
      .map((item) => {
        const signalClass = getSignalClass(item.signal);
        const c5Class = getSignedClass(item.change5m);
        const c1Class = getSignedClass(item.change1h);
        const biasClass = getBiasClass(item.bias);
        const flowText = item.usesRealFlow
          ? `${formatMaybe(item.flowPressure)} / ${formatMaybe(item.flowCrowding)}`
          : "Disabled until real provider";

        return `
          <article class="coin-focus-card">
            <div class="coin-focus-card-top">
              <div>
                <h3>${escapeHtml(item.symbol)}</h3>
                <div class="coin-focus-subtitle">${escapeHtml(item.setupDirection || "Watchlist")}</div>
              </div>
              <div class="coin-focus-price-wrap">
                <div class="coin-focus-price">${escapeHtml(formatMaybe(item.price || "--"))}</div>
                <div class="coin-focus-tag">${escapeHtml(item.model || "real-data-flow-core")}</div>
              </div>
            </div>

            <div class="coin-focus-badges">
              <span class="signal-badge ${escapeHtml(signalClass)}">${escapeHtml(item.signal || "WAIT")}</span>
              <span class="mini-badge">${escapeHtml(item.marketRegime || "--")}</span>
              <span class="mini-badge">${escapeHtml(item.dataCompleteness || "--")} Data</span>
            </div>

            <div class="coin-focus-grid-inner">
              ${buildMetricBox("Setup Score", item.finalSetupScore)}
              ${buildMetricBox("Confidence", `${formatMaybe(item.confidenceScore, "--")}%`)}
              ${buildMetricBox("Risk", item.riskScore)}
              ${buildMetricBox("Liquidity", item.liquiditySignal)}
              ${buildMetricBox("Trend", item.trendState)}
              ${buildMetricBox("Bias", item.bias, biasClass)}
              ${buildMetricBox("Funding State", item.fundingState)}
              ${buildMetricBox("Derivatives", item.derivativesState)}
              ${buildMetricBox("5m", item.change5m, c5Class)}
              ${buildMetricBox("1h", item.change1h, c1Class)}
              ${buildMetricBox("Entry", item.entry)}
              ${buildMetricBox("SL", item.sl)}
              ${buildMetricBox("TP", item.tp)}
              ${buildMetricBox("OI", item.oi)}
              ${buildMetricBox("Execution", item.executionMode)}
              ${buildMetricBox("Flow", flowText)}
            </div>

            <div class="coin-focus-note">
              ${escapeHtml(item.explanation || "")}
            </div>
          </article>
        `;
      })
      .join("");

    mount.innerHTML = html;
  }

  return {
    renderSingleCoin,
    renderCoinSnapshots,
    renderCoinFocus
  };
})();
