function buildAnalysisExplanation({
  symbol,
  marketState,
  derivativesAnalysis,
  whaleAnalysis,
  stablecoinAnalysis,
  setupScore
}) {
  const lines = [];

  lines.push(
    `${symbol} is in a ${marketState.regime} backdrop with ${marketState.conviction.toLowerCase()} market conditions.`
  );

  lines.push(
    `Momentum is ${String(derivativesAnalysis?.momentumState?.state || "balanced").toLowerCase()}, while derivatives positioning shows ${String(
      derivativesAnalysis?.oiPriceState?.oiState || "mixed participation"
    ).toLowerCase()}.`
  );

  lines.push(
    `Funding condition is ${String(
      derivativesAnalysis?.fundingState?.state || "neutral"
    ).toLowerCase()} and trap risk is ${String(
      derivativesAnalysis?.trapRisk || "medium"
    ).toLowerCase()}.`
  );

  lines.push(
    `Whale pressure is ${String(
      whaleAnalysis?.pressure?.pressureState || "balanced"
    ).toLowerCase()} with sponsor state ${String(
      whaleAnalysis?.sponsorState || "neutral"
    ).toLowerCase()}.`
  );

  lines.push(
    `Stablecoin liquidity is ${String(
      stablecoinAnalysis?.marketLiquidityState || "balanced"
    ).toLowerCase()} and overall liquidity pressure is ${String(
      stablecoinAnalysis?.liquidityPressure || "neutral"
    ).toLowerCase()}.`
  );

  lines.push(
    `Final read: ${setupScore.setupDirection}, trade quality ${setupScore.tradeQuality.toLowerCase()}, execution mode ${setupScore.executionMode.toLowerCase()}.`
  );

  return lines.join(" ");
}

function buildExecutionNotes({ coin, setupScore, derivativesAnalysis, whaleAnalysis }) {
  const notes = [];

  notes.push(`Signal: ${coin?.signal || "WAIT"}`);
  notes.push(`Bias: ${coin?.bias || "Sideway"}`);
  notes.push(`Entry: ${coin?.entry || "--"}`);
  notes.push(`SL: ${coin?.sl || "--"}`);
  notes.push(`TP: ${coin?.tp || "--"}`);

  if (derivativesAnalysis?.trapRisk === "High") {
    notes.push("High trap risk: avoid chasing breakout.");
  }

  if (String(derivativesAnalysis?.fundingState?.state || "").includes("Extreme")) {
    notes.push("Funding extreme: squeeze risk elevated.");
  }

  if (
    String(whaleAnalysis?.pressure?.directionalBias || "Neutral") === "Neutral"
  ) {
    notes.push("Whale sponsorship unclear.");
  }

  if (setupScore?.executionMode === "Wait Confirmation") {
    notes.push("Wait for stronger confirmation before execution.");
  }

  return notes;
}

module.exports = {
  buildAnalysisExplanation,
  buildExecutionNotes
};
