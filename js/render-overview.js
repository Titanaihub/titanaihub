window.TitanRenderOverview = (() => {
  const {
    formatMaybe,
    formatUsdCompact,
    getBiasClass
  } = window.TitanFormatters;

  function setText(node, value) {
    if (!node) return;
    node.textContent = formatMaybe(value);
  }

  function renderOverview(elements, snapshot) {
    const overview = snapshot?.overview || {};

    setText(elements.systemStatus, overview.status || "LIVE");
    setText(elements.lastUpdated, overview.lastUpdated || "--");
    setText(elements.globalBias, overview.marketBias || "--");

    if (elements.globalBias) {
      elements.globalBias.classList.remove("pos", "neg", "flat");
      elements.globalBias.classList.add(getBiasClass(overview.marketBias || ""));
    }

    setText(elements.totalMarketCap, formatUsdCompact(overview.totalMarketCap));
    setText(elements.totalVolume24h, formatUsdCompact(overview.totalVolume24h));
    setText(
      elements.btcDominance,
      Number.isFinite(Number(overview.btcDominance))
        ? `${Number(overview.btcDominance).toFixed(1)}%`
        : "--"
    );
    setText(
      elements.fearGreed,
      Number.isFinite(Number(overview.fearGreed))
        ? `${Math.round(Number(overview.fearGreed))}`
        : "--"
    );
  }

  function renderSummary(elements, snapshot) {
    const coinFocus = Array.isArray(snapshot?.coinFocus) ? snapshot.coinFocus : [];

    if (!coinFocus.length) {
      setText(elements.topSetup, "--");
      setText(elements.summaryConfidence, "--");
      setText(elements.riskLevel, "--");
      return;
    }

    const best = coinFocus[0];

    setText(elements.topSetup, `${best.symbol} / ${best.setupDirection || "Watchlist"}`);
    setText(
      elements.summaryConfidence,
      Number.isFinite(Number(best.confidenceScore))
        ? `${Math.round(Number(best.confidenceScore))}%`
        : "--"
    );

    const riskScore = Number(best.riskScore || 0);
    let riskLabel = "Medium";
    if (riskScore >= 70) riskLabel = "High";
    else if (riskScore <= 35) riskLabel = "Low";

    setText(elements.riskLevel, riskLabel);
  }

  return {
    renderOverview,
    renderSummary
  };
})();
