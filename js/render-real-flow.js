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
        const pressureClass = getBiasClass(row.pressureState || "");
        const crowdingClass = getBiasClass(row.crowdingState || "");
        const oiClass = getBiasClass(row.oiPressureState || "");
        const basisClass = getBiasClass(row.basisState || "");

        return `
          <tr>
            <td>${escapeHtml(row.symbol || "--")}</td>
            <td>${escapeHtml(row.futuresSymbol || "--")}</td>
            <td class="${escapeHtml(pressureClass)}">${escapeHtml(row.pressureState || "--")}</td>
            <td class="${escapeHtml(crowdingClass)}">${escapeHtml(row.crowdingState || "--")}</td>
            <td class="${escapeHtml(oiClass)}">${escapeHtml(row.oiPressureState || "--")}</td>
            <td class="${escapeHtml(basisClass)}">${escapeHtml(row.basisState || "--")}</td>
            <td>${escapeHtml(row.globalLongShortRatio || "--")}</td>
            <td>${escapeHtml(row.topAccountLongShortRatio || "--")}</td>
            <td>${escapeHtml(row.topPositionLongShortRatio || "--")}</td>
            <td>${escapeHtml(row.takerBuySellRatio || "--")}</td>
            <td>${escapeHtml(row.openInterestValue || "--")}</td>
            <td>${escapeHtml(row.openInterestChangePct || "--")}</td>
            <td>${escapeHtml(row.premiumPct || "--")}</td>
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

        return `
          <article class="summary-card">
            <div class="summary-card-top">
              <h3>${escapeHtml(item.symbol || "--")}</h3>
              <strong class="${escapeHtml(biasClass)}">${escapeHtml(item.directionalBias || "--")}</strong>
            </div>

            <div class="summary-card-grid">
              ${buildMetricBox("Composite", item.compositeScore)}
              ${buildMetricBox("Pressure", item.pressureState)}
              ${buildMetricBox("Crowding", item.crowdingState)}
              ${buildMetricBox("OI State", item.oiPressureState)}
              ${buildMetricBox("Basis", item.basisState)}
              ${buildMetricBox("Global L/S", item.globalLongShortRatio)}
              ${buildMetricBox("Top Acct L/S", item.topAccountLongShortRatio)}
              ${buildMetricBox("Top Pos L/S", item.topPositionLongShortRatio)}
              ${buildMetricBox("Taker Ratio", item.takerBuySellRatio)}
              ${buildMetricBox("OI Value", item.openInterestValue)}
              ${buildMetricBox("OI Change", item.openInterestChangePct)}
              ${buildMetricBox("Premium", item.premiumPct)}
            </div>
          </article>
        `;
      })
      .join("");

    elements.whaleSummaryGrid.innerHTML = html;
  }

  function renderLiquiditySummary(elements, snapshot) {
    if (!elements.stablecoinFlowGrid) return;

    const item = snapshot?.stablecoinFlows || null;

    if (!item || Array.isArray(item)) {
      elements.stablecoinFlowGrid.innerHTML = `
        <div class="stat-card">
          <span>Liquidity summary unavailable</span>
          <strong>--</strong>
        </div>
      `;
      return;
    }

    const stateClass = getBiasClass(item.summaryState || "");

    elements.stablecoinFlowGrid.innerHTML = `
      <article class="summary-card">
        <div class="summary-card-top">
          <h3>Liquidity Summary</h3>
          <strong class="${escapeHtml(stateClass)}">${escapeHtml(item.summaryState || "--")}</strong>
        </div>

        <div class="summary-card-grid">
          ${buildMetricBox("Symbols", item.totalSymbols)}
          ${buildMetricBox("Buy Pressure", item.buyPressureCount)}
          ${buildMetricBox("Sell Pressure", item.sellPressureCount)}
          ${buildMetricBox("Balanced", item.balancedCount)}
          ${buildMetricBox("Long Crowded", item.longCrowdedCount)}
          ${buildMetricBox("Short Crowded", item.shortCrowdedCount)}
          ${buildMetricBox("Rich Premium", item.richPremiumCount)}
          ${buildMetricBox("Discount", item.discountCount)}
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
