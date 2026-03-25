window.TitanRenderRealFlow = (() => {
  const {
    escapeHtml,
    formatMaybe,
    getBiasClass
  } = window.TitanFormatters;

  function buildMetricBox(label, value, valueClass = "") {
    return `
      <div class="metric-box">
        <span>${escapeHtml(label)}</span>
        <strong class="${escapeHtml(valueClass)}">${escapeHtml(formatMaybe(value))}</strong>
      </div>
    `;
  }

  function getFlowTextClass(value) {
    const text = String(value || "").toLowerCase().trim();
    if (!text) return "flow-flat";
    if (
      text.includes("buy") ||
      text.includes("long") ||
      text.startsWith("+")
    ) {
      return "flow-pos";
    }
    if (
      text.includes("sell") ||
      text.includes("short") ||
      text.startsWith("-")
    ) {
      return "flow-neg";
    }
    return "flow-flat";
  }

  function renderFlowFeed(elements, snapshot) {
    if (!elements.whaleTableBody) return;

    const rows = Array.isArray(snapshot?.whales) ? snapshot.whales : [];

    if (!rows.length) {
      elements.whaleTableBody.innerHTML = `
        <tr>
          <td colspan="13">No real flow feed available</td>
        </tr>
      `;
      return;
    }

    const html = rows
      .map((row) => {
        const pressureClass = getFlowTextClass(row.pressureState || "");
        const crowdingClass = getFlowTextClass(row.crowdingState || "");
        const oiClass = getFlowTextClass(row.oiPressureState || "");
        const basisClass = getFlowTextClass(row.basisState || "");
        const oiChangeClass = getFlowTextClass(row.openInterestChangePct || "");
        const premiumClass = getFlowTextClass(row.premiumPct || "");

        return `
          <tr>
            <td>${escapeHtml(row.symbol || "--")}</td>
            <td class="futures-symbol">${escapeHtml(row.futuresSymbol || "--")}</td>
            <td class="${escapeHtml(pressureClass)}">${escapeHtml(row.pressureState || "--")}</td>
            <td class="${escapeHtml(crowdingClass)}">${escapeHtml(row.crowdingState || "--")}</td>
            <td class="${escapeHtml(oiClass)}">${escapeHtml(row.oiPressureState || "--")}</td>
            <td class="${escapeHtml(basisClass)}">${escapeHtml(row.basisState || "--")}</td>
            <td>${escapeHtml(row.globalLongShortRatio || "--")}</td>
            <td>${escapeHtml(row.topAccountLongShortRatio || "--")}</td>
            <td>${escapeHtml(row.topPositionLongShortRatio || "--")}</td>
            <td>${escapeHtml(row.takerBuySellRatio || "--")}</td>
            <td>${escapeHtml(row.openInterestValue || "--")}</td>
            <td class="${escapeHtml(oiChangeClass)}">${escapeHtml(row.openInterestChangePct || "--")}</td>
            <td class="${escapeHtml(premiumClass)}">${escapeHtml(row.premiumPct || "--")}</td>
          </tr>
        `;
      })
      .join("");

    elements.whaleTableBody.innerHTML = html;
  }

  function renderPositioningSummary(elements, snapshot) {
    if (!elements.whaleSummaryGrid) return;

    const items = Array.isArray(snapshot?.whaleSummary) ? snapshot.whaleSummary : [];

    if (!items.length) {
      elements.whaleSummaryGrid.innerHTML = `
        <div class="stat-card">
          <span>Positioning summary unavailable</span>
          <strong>--</strong>
        </div>
      `;
      return;
    }

    const html = items
      .map((item) => {
        const biasClass = getBiasClass(item.directionalBias || "");
        const symbolClass =
          getFlowTextClass(
            `${item.directionalBias || ""} ${item.pressureState || ""} ${item.crowdingState || ""}`
          ) || "flow-flat";

        return `
          <article class="summary-card">
            <div class="summary-card-top">
              <h3 class="${escapeHtml(symbolClass)}">${escapeHtml(item.symbol || "--")}</h3>
              <strong class="${escapeHtml(biasClass)}">${escapeHtml(item.directionalBias || "--")}</strong>
            </div>

            <div class="summary-card-grid">
              ${buildMetricBox("Composite", item.compositeScore)}
              ${buildMetricBox("Pressure", item.pressureState, getFlowTextClass(item.pressureState))}
              ${buildMetricBox("Crowding", item.crowdingState, getFlowTextClass(item.crowdingState))}
              ${buildMetricBox("OI State", item.oiPressureState, getFlowTextClass(item.oiPressureState))}
              ${buildMetricBox("Basis", item.basisState, getFlowTextClass(item.basisState))}
              ${buildMetricBox("Global L/S", item.globalLongShortRatio)}
              ${buildMetricBox("Top Acct L/S", item.topAccountLongShortRatio)}
              ${buildMetricBox("Top Pos L/S", item.topPositionLongShortRatio)}
              ${buildMetricBox("Taker Ratio", item.takerBuySellRatio)}
              ${buildMetricBox("OI Value", item.openInterestValue)}
              ${buildMetricBox("OI Change", item.openInterestChangePct, getFlowTextClass(item.openInterestChangePct))}
              ${buildMetricBox("Premium", item.premiumPct, getFlowTextClass(item.premiumPct))}
            </div>
          </article>
        `;
      })
      .join("");

    elements.whaleSummaryGrid.innerHTML = html;
  }

  function renderLiquiditySummary(elements, snapshot) {
    if (!elements.stablecoinFlowGrid) return;

    const coins = Array.isArray(snapshot?.coinFocus) ? snapshot.coinFocus : [];
    const stableFlows = snapshot?.stablecoinFlows || null;

    const regime = !stableFlows || Array.isArray(stableFlows) ? "--" : stableFlows?.summaryState || "--";
    const stateClass = getBiasClass(regime);

    if (!coins.length) {
      elements.stablecoinFlowGrid.innerHTML = `
        <article class="summary-card">
          <div class="summary-card-top">
            <h3>Liquidity Summary</h3>
            <strong class="${escapeHtml(stateClass)}">${escapeHtml(regime)}</strong>
          </div>
          <div class="table-wrap">
            <div class="stat-card">
              <span>No liquidity rows available</span>
              <strong>--</strong>
            </div>
          </div>
        </article>
      `;
      return;
    }

    const rowsHtml = coins
      .slice(0, 15)
      .map((coin) => {
        const signal = coin.signal || "WAIT";
        const sideClass = getFlowTextClass(
          `${coin.signal || ""} ${coin.recommendedAction || ""} ${coin.setupDirection || ""}`
        );

        const pressureClass = getBiasClass(coin.flowPressure || "");
        const crowdingClass = getBiasClass(coin.flowCrowding || "");
        const oiClass = getBiasClass(coin.flowOIState || "");
        const basisClass = getBiasClass(coin.flowBasisState || "");
        // Sweep risk uses liquidationState per your request.
        const sweepClass = getBiasClass(coin.liquidationState || "");
        const slClass = sideClass === "flow-neg" ? "flow-neg" : "";
        const tpClass = sideClass === "flow-pos" ? "flow-pos" : "";

        return `
          <tr>
            <td>${escapeHtml(coin.symbol || "--")}</td>
            <td>${escapeHtml(signal)}</td>
            <td class="${escapeHtml(pressureClass)}">${escapeHtml(coin.flowPressure || "--")}</td>
            <td class="${escapeHtml(crowdingClass)}">${escapeHtml(coin.flowCrowding || "--")}</td>
            <td class="${escapeHtml(oiClass)}">${escapeHtml(coin.flowOIState || "--")}</td>
            <td class="${escapeHtml(basisClass)}">${escapeHtml(coin.flowBasisState || "--")}</td>
            <td class="${escapeHtml(sweepClass)}">${escapeHtml(coin.liquidationState || "--")}</td>
            <td>${escapeHtml(coin.entry || "--")}</td>
            <td class="${escapeHtml(slClass)}">${escapeHtml(coin.sl || "--")}</td>
            <td class="${escapeHtml(tpClass)}">${escapeHtml(coin.tp || "--")}</td>
            <td>${escapeHtml(coin.recommendedAction || coin.executionTier || "--")}</td>
          </tr>
        `;
      })
      .join("");

    elements.stablecoinFlowGrid.innerHTML = `
      <article class="summary-card">
        <div class="summary-card-top">
          <h3>Liquidity Summary</h3>
          <strong class="${escapeHtml(stateClass)}">${escapeHtml(regime)}</strong>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Signal</th>
                <th>Pressure</th>
                <th>Crowding</th>
                <th>OI State</th>
                <th>Basis</th>
                <th>Sweep risk</th>
                <th>Entry</th>
                <th>SL</th>
                <th>TP</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  return {
    renderFlowFeed,
    renderPositioningSummary,
    renderLiquiditySummary
  };
})();
