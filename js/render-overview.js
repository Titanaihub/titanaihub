window.TitanRenderOverview = (() => {
const {
formatMaybe,
formatUsdCompact,
getBiasClass,
escapeHtml
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

function renderLiquiditySummary(elements, snapshot) {
const mount = elements.liquiditySummary;
if (!mount) return;

const items = Array.isArray(snapshot?.coinFocus) ? snapshot.coinFocus : [];  

if (!items.length) {  
  mount.innerHTML = `  
    <div class="liquidity-summary-wrap">  
      <div class="liquidity-summary-top">  
        <div>  
          <h3>Liquidity Summary</h3>  
          <p>No liquidity summary available</p>  
        </div>  
      </div>  
    </div>  
  `;  
  return;  
}  

const buyPressureCount = items.filter((x) =>  
  String(x.flowPressure || "").toLowerCase().includes("buy")  
).length;  

const sellPressureCount = items.filter((x) =>  
  String(x.flowPressure || "").toLowerCase().includes("sell")  
).length;  

const balancedCount = items.length - buyPressureCount - sellPressureCount;  

const longCrowdedCount = items.filter((x) =>  
  String(x.flowCrowding || "").toLowerCase().includes("long")  
).length;  

const shortCrowdedCount = items.filter((x) =>  
  String(x.flowCrowding || "").toLowerCase().includes("short")  
).length;  

const richPremiumCount = items.filter((x) =>  
  String(x.basisState || x.premiumState || "").toLowerCase().includes("rich")  
).length;  

const discountCount = items.filter((x) =>  
  String(x.basisState || x.premiumState || "").toLowerCase().includes("discount")  
).length;  

const marketRegime =  
  buyPressureCount > sellPressureCount  
    ? "Risk-On"  
    : sellPressureCount > buyPressureCount  
    ? "Risk-Off"  
    : "Balanced";  

const marketRegimeClass =  
  marketRegime === "Risk-On" ? "pos" : marketRegime === "Risk-Off" ? "neg" : "flat";  

function classifyPressure(text = "") {  
  const v = String(text).toLowerCase();  
  if (v.includes("buy")) return "pos";  
  if (v.includes("sell")) return "neg";  
  return "flat";  
}  

function classifyCrowding(text = "") {  
  const v = String(text).toLowerCase();  
  if (v.includes("long")) return "neg";  
  if (v.includes("short")) return "pos";  
  return "flat";  
}  

function classifyBasis(text = "") {  
  const v = String(text).toLowerCase();  
  if (v.includes("rich")) return "neg";  
  if (v.includes("discount")) return "pos";  
  return "flat";  
}  

function getSweepState(item) {  
  const v = String(item.liquidationState || "").toLowerCase();  

  if (v.includes("long liquidation risk below")) {  
    return { label: "Sweep Below", className: "neg" };  
  }  

  if (v.includes("short liquidation risk above")) {  
    return { label: "Sweep Above", className: "pos" };  
  }  

  if (v.includes("balanced")) {  
    return { label: "Balanced", className: "flat" };  
  }  

  return { label: "--", className: "flat" };  
}  

function getAction(item) {  
  const signal = String(item.signal || "").toLowerCase();  
  const crowd = String(item.flowCrowding || "").toLowerCase();  
  const pressure = String(item.flowPressure || "").toLowerCase();  

  if (signal.includes("long") && crowd.includes("long")) {  
    return { label: "Wait Pullback", className: "neg" };  
  }  

  if (signal.includes("short") && crowd.includes("short")) {  
    return { label: "Watch Squeeze", className: "pos" };  
  }  

  if (pressure.includes("buy") && crowd.includes("short")) {  
    return { label: "Long Bias", className: "pos" };  
  }  

  if (pressure.includes("sell") && crowd.includes("long")) {  
    return { label: "Short Bias", className: "neg" };  
  }  

  return { label: "Wait", className: "flat" };  
}  

const ranked = [...items]  
  .sort((a, b) => Number(b.finalSetupScore || 0) - Number(a.finalSetupScore || 0))  
  .slice(0, 8);  

const rowsHtml = ranked  
  .map((item) => {  
    const pressureClass = classifyPressure(item.flowPressure || "");  
    const crowdingClass = classifyCrowding(item.flowCrowding || "");  
    const basisClass = classifyBasis(item.basisState || item.premiumState || "");  
    const sweep = getSweepState(item);  
    const action = getAction(item);  

    return `  
      <tr>  
        <td><strong>${escapeHtml(item.symbol || "--")}</strong></td>  
        <td class="${pressureClass}">${escapeHtml(item.flowPressure || "--")}</td>  
        <td class="${crowdingClass}">${escapeHtml(item.flowCrowding || "--")}</td>  
        <td class="${basisClass}">${escapeHtml(item.basisState || item.premiumState || "--")}</td>  
        <td class="${sweep.className}">${escapeHtml(sweep.label)}</td>  
        <td class="${action.className}">${escapeHtml(action.label)}</td>  
      </tr>  
    `;  
  })  
  .join("");  

mount.innerHTML = `  
  <div class="liquidity-summary-wrap">  
    <div class="liquidity-summary-top">  
      <div>  
        <h3>Liquidity Summary</h3>  
        <p>Stop hunt / sweep risk / crowded side / price magnet across tracked coins</p>  
      </div>  
      <div class="liquidity-summary-regime ${marketRegimeClass}">  
        ${escapeHtml(marketRegime)}  
      </div>  
    </div>  

    <div class="liquidity-summary-grid">  
      <div class="liquidity-mini-card">  
        <span>Symbols</span>  
        <strong>${items.length}</strong>  
      </div>  
      <div class="liquidity-mini-card">  
        <span>Buy Pressure</span>  
        <strong class="pos">${buyPressureCount}</strong>  
      </div>  
      <div class="liquidity-mini-card">  
        <span>Sell Pressure</span>  
        <strong class="neg">${sellPressureCount}</strong>  
      </div>  
      <div class="liquidity-mini-card">  
        <span>Balanced</span>  
        <strong class="flat">${balancedCount}</strong>  
      </div>  
      <div class="liquidity-mini-card">  
        <span>Long Crowded</span>  
        <strong class="neg">${longCrowdedCount}</strong>  
      </div>  
      <div class="liquidity-mini-card">  
        <span>Short Crowded</span>  
        <strong class="pos">${shortCrowdedCount}</strong>  
      </div>  
      <div class="liquidity-mini-card">  
        <span>Rich Premium</span>  
        <strong class="neg">${richPremiumCount}</strong>  
      </div>  
      <div class="liquidity-mini-card">  
        <span>Discount</span>  
        <strong class="pos">${discountCount}</strong>  
      </div>  
    </div>  

    <div class="table-wrap liquidity-summary-table-wrap">  
      <table class="data-table liquidity-summary-table">  
        <thead>  
          <tr>  
            <th>Coin</th>  
            <th>Pressure</th>  
            <th>Crowding</th>  
            <th>Basis</th>  
            <th>Sweep Risk</th>  
            <th>Action</th>  
          </tr>  
        </thead>  
        <tbody>  
          ${rowsHtml}  
        </tbody>  
      </table>  
    </div>  
  </div>  
`;

}

return {
renderOverview,
renderSummary,
renderLiquiditySummary
};
})();
