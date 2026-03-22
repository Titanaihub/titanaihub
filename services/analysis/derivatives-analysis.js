const { clamp } = require("../../utils/helpers.js");

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function detectFundingState(funding) {
  const f = toNum(funding, 0);
  const abs = Math.abs(f);

  let state = "Neutral";
  let crowding = "Balanced";
  let extremeScore = 0;

  if (abs < 0.003) {
    state = "Neutral";
    crowding = "Balanced";
    extremeScore = 8;
  } else if (abs < 0.008) {
    state = f > 0 ? "Long Leaning" : "Short Leaning";
    crowding = f > 0 ? "Long Crowding Build" : "Short Crowding Build";
    extremeScore = 28;
  } else if (abs < 0.015) {
    state = f > 0 ? "Long Crowded" : "Short Crowded";
    crowding = f > 0 ? "Crowded Longs" : "Crowded Shorts";
    extremeScore = 56;
  } else {
    state = f > 0 ? "Extreme Long Crowding" : "Extreme Short Crowding";
    crowding = f > 0 ? "Overcrowded Longs" : "Overcrowded Shorts";
    extremeScore = 84;
  }

  return {
    funding: f,
    state,
    crowding,
    extremeScore
  };
}

function detectMomentumState(change5m, change15m, change1h, change4h) {
  const c5 = toNum(change5m, 0);
  const c15 = toNum(change15m, 0);
  const c1 = toNum(change1h, 0);
  const c4 = toNum(change4h, 0);

  const shortTerm = c5 * 0.35 + c15 * 0.65;
  const intraday = c15 * 0.3 + c1 * 0.7;
  const swing = c1 * 0.45 + c4 * 0.55;

  let state = "Balanced";
  if (shortTerm > 0 && intraday > 0 && swing > 0) state = "Bullish Expansion";
  else if (shortTerm < 0 && intraday < 0 && swing < 0) state = "Bearish Expansion";
  else if (shortTerm > 0 && swing < 0) state = "Short Cover Bounce";
  else if (shortTerm < 0 && swing > 0) state = "Pullback Inside Uptrend";
  else state = "Range / Rotation";

  const momentumScore = clamp(
    50 + shortTerm * 140 + intraday * 90 + swing * 50,
    0,
    100
  );

  return {
    shortTerm,
    intraday,
    swing,
    state,
    momentumScore: Math.round(momentumScore)
  };
}

function detectOiPriceRelationship({ price, entry, oi, change5m, change15m, change1h, change4h }) {
  const p = toNum(price, 0);
  const e = toNum(entry, p);
  const oiNum = toNum(oi, 0);
  const c5 = toNum(change5m, 0);
  const c15 = toNum(change15m, 0);
  const c1 = toNum(change1h, 0);
  const c4 = toNum(change4h, 0);

  const priceImpulse = c5 * 0.2 + c15 * 0.3 + c1 * 0.3 + c4 * 0.2;
  const distanceFromEntryPct = e > 0 ? ((p - e) / e) * 100 : 0;

  let oiState = "Flat OI";
  let derivativesBias = "Neutral";
  let squeezeRisk = "Balanced";
  let squeezeSide = "None";
  let divergenceScore = 18;

  if (oiNum <= 0) {
    oiState = "OI Not Available";
    derivativesBias = "Neutral";
    squeezeRisk = "Unknown";
    squeezeSide = "Unknown";
    divergenceScore = 24;
  } else if (priceImpulse > 0.12 && distanceFromEntryPct > 0.15) {
    oiState = "Trend Confirmation";
    derivativesBias = "Bullish Participation";
    squeezeRisk = "Low";
    squeezeSide = "None";
    divergenceScore = 20;
  } else if (priceImpulse < -0.12 && distanceFromEntryPct < -0.15) {
    oiState = "Aggressive Short Build";
    derivativesBias = "Bearish Participation";
    squeezeRisk = "Medium";
    squeezeSide = "Shorts Vulnerable If Reversed";
    divergenceScore = 42;
  } else if (priceImpulse > 0.08 && distanceFromEntryPct <= 0.1) {
    oiState = "Short Covering";
    derivativesBias = "Bullish But Fragile";
    squeezeRisk = "Medium";
    squeezeSide = "Short Squeeze";
    divergenceScore = 58;
  } else if (priceImpulse < -0.08 && distanceFromEntryPct >= -0.1) {
    oiState = "Long Flush / Deleveraging";
    derivativesBias = "Bearish But Exhaustion Possible";
    squeezeRisk = "Medium";
    squeezeSide = "Long Squeeze";
    divergenceScore = 61;
  } else {
    oiState = "Mixed Participation";
    derivativesBias = "Unclear";
    squeezeRisk = "Medium";
    squeezeSide = "Two-Way";
    divergenceScore = 46;
  }

  return {
    oiState,
    derivativesBias,
    squeezeRisk,
    squeezeSide,
    divergenceScore
  };
}

function buildDerivativesAnalysis(coin) {
  const fundingState = detectFundingState(coin?.funding);
  const momentumState = detectMomentumState(
    coin?.change5m,
    coin?.change15m,
    coin?.change1h,
    coin?.change4h
  );

  const oiPriceState = detectOiPriceRelationship({
    price: coin?.price,
    entry: coin?.entry,
    oi: coin?.oi,
    change5m: coin?.change5m,
    change15m: coin?.change15m,
    change1h: coin?.change1h,
    change4h: coin?.change4h
  });

  const trapRiskScore = clamp(
    fundingState.extremeScore * 0.35 +
      oiPriceState.divergenceScore * 0.45 +
      (momentumState.state === "Range / Rotation" ? 18 : 6),
    0,
    100
  );

  let trapRisk = "Low";
  if (trapRiskScore >= 70) trapRisk = "High";
  else if (trapRiskScore >= 45) trapRisk = "Medium";

  return {
    fundingState,
    momentumState,
    oiPriceState,
    trapRiskScore: Math.round(trapRiskScore),
    trapRisk
  };
}

module.exports = {
  detectFundingState,
  detectMomentumState,
  detectOiPriceRelationship,
  buildDerivativesAnalysis
};
