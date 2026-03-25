window.TitanRenderCoinFocus = (() => {
  const {
    escapeHtml,
    formatMaybe,
    formatPrice,
    formatPercent,
    formatUsdCompact,
    shortText,
    getSignalClass,
    getSignedClass,
    getBiasClass
  } = window.TitanFormatters;

  function setText(node, value) {
    if (!node) return;
    node.textContent = formatMaybe(value);
  }

  function semanticClass(value = "") {
  const v = String(value || "").toLowerCase().trim();

  if (
    v.includes("buy") ||
    v.includes("long") ||
    v.includes("bullish") ||
    v.includes("take profit") ||
    v === "tp" ||
    v.startsWith("+")
  ) {
    return "pos";
  }

  if (
    v.includes("sell") ||
    v.includes("short") ||
    v.includes("bearish") ||
    v.includes("stop loss") ||
    v === "sl" ||
    v.startsWith("-")
  ) {
    return "neg";
  }

  if (
    v.includes("wait") ||
    v.includes("neutral") ||
    v.includes("balanced")
  ) {
    return "flat";
  }

  return "";
}

function buildMetricBox(label, value, valueClass = "") {
  const autoLabelClass = semanticClass(label);
  const autoValueClass = valueClass || semanticClass(value);

  return `
    <div class="metric-box">
      <span class="${escapeHtml(autoLabelClass)}">${escapeHtml(label)}</span>
      <strong class="${escapeHtml(autoValueClass)}">${escapeHtml(formatMaybe(value))}</strong>
    </div>
  `;
}

  function normalizeDisplayPrice(value) {
    const n = Number(value);
    if (Number.isFinite(n)) return formatPrice(n);
    return formatMaybe(value);
  }

  function normalizeDisplayPercent(value) {
    const n = Number(value);
    if (Number.isFinite(n)) return formatPercent(n);
    return formatMaybe(value);
  }

  function normalizeFunding(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return formatMaybe(value);

    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(6)}`;
  }

  function normalizeOi(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return formatMaybe(value);

    return formatUsdCompact(n);
  }

  function buildRiskFlags(flags) {
    const list = Array.isArray(flags) ? flags.filter(Boolean) : [];
    if (!list.length) return "None";
    return list.slice(0, 2).join(" • ");
  }

  function shortenTradeability(value) {
    const text = String(value || "");
    if (!text) return "--";
    if (text === "Breakout Watch") return "Breakout";
    if (text === "Low Tradeability") return "Low";
    if (text === "Fragile / Sweep Risk") return "Sweep Risk";
    return text;
  }

  function shortenLiq(value) {
    const text = String(value || "");
    if (!text) return "--";
    if (text === "Balanced Liquidation Pressure") return "Balanced";
    if (text === "Short Liquidation Risk Above") return "Short Risk";
    if (text === "Long Liquidation Risk Below") return "Long Risk";
    return text;
  }

  function shortenVol(value) {
    const text = String(value || "");
    if (!text) return "--";
    if (text === "Compressed") return "Compressed";
    if (text === "Extreme") return "Extreme";
    if (text === "Normal") return "Normal";
    if (text === "Elevated") return "Elevated";
    return text;
  }

  function shortenFlow(item) {
    const pressure = String(item.flowPressure || "");
    const crowd = String(item.flowCrowding || "");

    if (!pressure && !crowd) return "--";
    if (pressure && crowd) return `${pressure} / ${crowd}`;
    return pressure || crowd || "--";
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
    setText(m5Node, normalizeDisplayPercent(data.change5m));
    setText(m15Node, normalizeDisplayPercent(data.change15m));
    setText(h1Node, normalizeDisplayPercent(data.change1h));
    setText(h4Node, normalizeDisplayPercent(data.change4h));
    setText(fundingNode, normalizeFunding(data.funding));
    setText(oiNode, normalizeOi(data.oi));
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

if (fundingNode) {
  fundingNode.classList.remove("pos", "neg", "flat");
  fundingNode.classList.add(getSignedClass(fundingNode.textContent));
}

if (entryNode) {
  entryNode.classList.remove("pos", "neg", "flat");
  entryNode.classList.add("flat");
}

if (slNode) {
  slNode.classList.remove("pos", "neg", "flat");
  slNode.classList.add("neg");
}

if (tpNode) {
  tpNode.classList.remove("pos", "neg", "flat");
  tpNode.classList.add("pos");
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
        const c5Value = normalizeDisplayPercent(item.change5m);
        const c1Value = normalizeDisplayPercent(item.change1h);
        const c5Class = getSignedClass(c5Value);
        const c1Class = getSignedClass(c1Value);
        const biasClass = getBiasClass(item.bias);
        const actionClass = getBiasClass(item.recommendedAction || item.setupDirection || "");
        const directionClass = semanticClass(`${item.recommendedAction || ""} ${item.setupDirection || ""} ${item.signal || ""}`);
        const tierClass =
        String(item.executionTier || "").includes("No Trade")
        ? "neg"
        : String(item.executionTier || "").includes("Tier 1") ||
        String(item.executionTier || "").includes("Tier 2")
        ? "pos"
    : "flat";

        const noTradeNote = item.noTradeReason
          ? `<div class="coin-focus-warning">No Trade: ${escapeHtml(item.noTradeReason)}</div>`
          : "";

        return `
          <article class="coin-focus-card">
            <div class="coin-focus-card-top">
             <div class="coin-focus-card-heading">
              <h3 class="${escapeHtml(directionClass)}">${escapeHtml(item.symbol)}</h3>
              <div class="coin-focus-subtitle ${escapeHtml(directionClass)}">${escapeHtml(item.setupDirection || "Watchlist")}</div>
            </div>

              <div class="coin-focus-price-wrap">
                <div class="coin-focus-price">${escapeHtml(normalizeDisplayPrice(item.price || "--"))}</div>
                <div class="coin-focus-tag">${escapeHtml(item.model || "real-data-flow-core")}</div>
              </div>
            </div>

            <div class="coin-focus-badges">
              <span class="signal-badge ${escapeHtml(signalClass)}">${escapeHtml(item.signal || "WAIT")}</span>
              <span class="mini-badge ${escapeHtml(getBiasClass(item.marketRegime || ""))}">${escapeHtml(item.marketRegime || "--")}</span>
              <span class="mini-badge ${escapeHtml(tierClass)}">${escapeHtml(item.executionTier || "No Trade")}</span>
            </div>

            <div class="coin-focus-grid-inner">
              ${buildMetricBox("Setup", item.finalSetupScore)}
              ${buildMetricBox("Decision", item.decisionScore)}
              ${buildMetricBox("Micro", item.microstructureScore)}
              ${buildMetricBox("Risk", item.riskScore)}

              ${buildMetricBox("Action", item.recommendedAction || "Wait", actionClass)}
              ${buildMetricBox("Tradeability", shortenTradeability(item.tradeabilityState || "--"))}
              ${buildMetricBox("Trend", item.trendState || "--")}
              ${buildMetricBox("Bias", item.bias || "--", biasClass)}

              ${buildMetricBox("Flow", shortenFlow(item))}
              ${buildMetricBox("Book", item.orderBookState || "--")}
              ${buildMetricBox("Vol", shortenVol(item.volatilityState || "--"))}
              ${buildMetricBox("Liq", shortenLiq(item.liquidationState || "--"))}

              ${buildMetricBox("5m", c5Value, c5Class)}
              ${buildMetricBox("1h", c1Value, c1Class)}
              ${buildMetricBox("Entry", normalizeDisplayPrice(item.entry))}
              ${buildMetricBox("SL", normalizeDisplayPrice(item.sl), "neg")}
              ${buildMetricBox("TP", normalizeDisplayPrice(item.tp), "pos")}
              ${buildMetricBox("OI", normalizeOi(item.oi))}
            </div>

            ${noTradeNote}

            <div class="coin-focus-note">
              <strong>Flags:</strong> ${escapeHtml(buildRiskFlags(item.riskFlags))}
            </div>

            <div class="coin-focus-note">
              ${escapeHtml(shortText(item.explanation || "", 240))}
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
