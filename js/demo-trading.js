window.TitanDemoTrading = (() => {
  const { apiGet, apiPost } = window.TitanApi;

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function fmtUsd(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    const sign = x < 0 ? "-" : "";
    return `${sign}$${Math.abs(x).toFixed(2)}`;
  }

  function syncAuth(elements, appState) {
    const ok = Boolean(appState.loggedIn && appState.authToken);
    if (elements.demoRunDecision) elements.demoRunDecision.disabled = !ok;
    const d = appState.demoLastDecision;
    const canExec =
      ok &&
      d &&
      ["OPEN_LONG", "OPEN_SHORT"].includes(String(d.action || "").toUpperCase());
    if (elements.demoExecute) elements.demoExecute.disabled = !canExec;
  }

  function renderAccount(elements, payload) {
    const mount = elements.demoAccountMount;
    if (!mount) return;

    if (!payload) {
      mount.innerHTML = `<div class="stat-card"><span>Futures account</span><strong>Loading...</strong></div>`;
      return;
    }

    if (payload.needsKeys) {
      mount.innerHTML = `
        <div class="stat-card">
          <span>Connection</span>
          <strong>Set BINANCE_TESTNET_API_KEY / BINANCE_TESTNET_API_SECRET on the server</strong>
        </div>`;
      return;
    }

    if (!payload.ok) {
      const msg =
        payload.message ||
        (payload.snapshot && !payload.snapshot.ok && payload.snapshot.message) ||
        "Unable to load account data";
      mount.innerHTML = `
        <div class="stat-card">
          <span>Futures account</span>
          <strong>${escapeHtml(msg)}</strong>
        </div>`;
      return;
    }

    const snap = payload.snapshot || {};
    if (!snap.ok) {
      mount.innerHTML = `
        <div class="stat-card">
          <span>Account</span>
          <strong>${escapeHtml(snap.message || snap.error || "Error")}</strong>
        </div>`;
      return;
    }

    const te = payload.tradingEnabled
      ? "Execution: active · Testnet"
      : "Execution: view-only · enable BINANCE_TESTNET_TRADING_ENABLED on server";
    const usdt = snap.usdt || {};
    const avail = usdt.availableBalance ?? usdt.available ?? usdt.balance;
    const wallet = usdt.walletBalance ?? usdt.balance;

    const posRows = (snap.positions || [])
      .filter((p) => Math.abs(Number(p.positionAmt || 0)) > 1e-12)
      .map(
        (p) => `
      <tr>
        <td>${escapeHtml(p.symbol)}</td>
        <td>${escapeHtml(p.positionSide || (Number(p.positionAmt) >= 0 ? "LONG" : "SHORT"))}</td>
        <td>${escapeHtml(p.positionAmt)}</td>
        <td>${escapeHtml(p.entryPrice)}</td>
        <td>${escapeHtml(p.markPrice)}</td>
        <td class="${Number(p.unRealizedProfit) >= 0 ? "pos" : "neg"}">${fmtUsd(p.unRealizedProfit)}</td>
      </tr>`
      )
      .join("");

    const ooRows = (snap.openOrders || [])
      .map(
        (o) => `
      <tr>
        <td>${escapeHtml(o.symbol)}</td>
        <td>${escapeHtml(o.side)}</td>
        <td>${escapeHtml(o.type)}</td>
        <td>${escapeHtml(o.status)}</td>
        <td>${escapeHtml(o.origQty)}</td>
        <td>${escapeHtml(o.price || "Market")}</td>
      </tr>`
      )
      .join("");

    const ordRows = (snap.recentOrders || [])
      .slice(0, 25)
      .map(
        (o) => `
      <tr>
        <td>${escapeHtml(o.symbol)}</td>
        <td>${escapeHtml(o.side)}</td>
        <td>${escapeHtml(o.type)}</td>
        <td>${escapeHtml(o.status)}</td>
        <td>${escapeHtml(o.executedQty)} / ${escapeHtml(o.origQty)}</td>
        <td>${escapeHtml(o.avgPrice || o.price || "--")}</td>
        <td>${o.updateTime ? new Date(o.updateTime).toISOString().slice(0, 19).replace("T", " ") : "--"}</td>
      </tr>`
      )
      .join("");

    const pnlRows = (snap.realizedPnlRows || [])
      .slice(0, 15)
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.symbol || "--")}</td>
        <td>${escapeHtml(r.incomeType || "REALIZED_PNL")}</td>
        <td class="${Number(r.income) >= 0 ? "pos" : "neg"}">${fmtUsd(r.income)}</td>
        <td>${r.time ? new Date(r.time).toISOString().slice(0, 19).replace("T", " ") : "--"}</td>
      </tr>`
      )
      .join("");

    mount.innerHTML = `
      <div class="demo-trading-summary">
        <div class="stat-card"><span>Status</span><strong>${escapeHtml(te)}</strong></div>
        <div class="stat-card"><span>USDT available</span><strong>${fmtUsd(avail)}</strong></div>
        <div class="stat-card"><span>Wallet (USDT)</span><strong>${fmtUsd(wallet)}</strong></div>
        <div class="stat-card"><span>Unrealized PnL</span><strong class="${Number(snap.unrealizedTotal) >= 0 ? "pos" : "neg"}">${fmtUsd(snap.unrealizedTotal)}</strong></div>
        <div class="stat-card"><span>Realized PnL (recent)</span><strong class="${Number(snap.realizedRecentSum) >= 0 ? "pos" : "neg"}">${fmtUsd(snap.realizedRecentSum)}</strong></div>
      </div>
      <h3 class="demo-trading-sub">Open positions</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Symbol</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Unrealized PnL</th>
            </tr>
          </thead>
          <tbody>${posRows || `<tr><td colspan="6">No open positions</td></tr>`}</tbody>
        </table>
      </div>
      <h3 class="demo-trading-sub">Open orders</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Symbol</th><th>Side</th><th>Type</th><th>Status</th><th>Qty</th><th>Price</th>
            </tr>
          </thead>
          <tbody>${ooRows || `<tr><td colspan="6">No open orders</td></tr>`}</tbody>
        </table>
      </div>
      <h3 class="demo-trading-sub">Order history</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Symbol</th><th>Side</th><th>Type</th><th>Status</th><th>Filled</th><th>Avg</th><th>Updated</th>
            </tr>
          </thead>
          <tbody>${ordRows || `<tr><td colspan="7">No recent orders</td></tr>`}</tbody>
        </table>
      </div>
      <h3 class="demo-trading-sub">Realized PnL (income)</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Symbol</th><th>Type</th><th>Amount</th><th>Time</th>
            </tr>
          </thead>
          <tbody>${pnlRows || `<tr><td colspan="4">No realized rows</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }

  async function loadAccount(elements, appState) {
    if (!appState.loggedIn || !appState.authToken) {
      if (elements.demoAccountMount) {
        elements.demoAccountMount.innerHTML = `<div class="stat-card"><span>Futures account</span><strong>Sign in as owner to load positions and balances</strong></div>`;
      }
      return;
    }
    try {
      const data = await apiGet("/demo/account", {
        headers: { Authorization: `Bearer ${appState.authToken}` }
      });
      if (elements.demoTradingStatus) {
        elements.demoTradingStatus.textContent = data.tradingEnabled
          ? "Execution: active · Testnet"
          : "Execution: view-only · orders disabled";
      }
      renderAccount(elements, data);
    } catch (err) {
      if (elements.demoAccountMount) {
        elements.demoAccountMount.innerHTML = `<div class="stat-card"><span>Error</span><strong>${escapeHtml(
          err.message || "Failed"
        )}</strong></div>`;
      }
    }
  }

  async function runDecision(elements, appState) {
    if (!appState.authToken) return;
    if (elements.demoTradingStatus) {
      elements.demoTradingStatus.textContent = "Fetching AI signal...";
    }
    try {
      const data = await apiPost(
        "/demo/decision",
        {},
        { Authorization: `Bearer ${appState.authToken}` }
      );
      appState.demoLastDecision = data.decision || null;
      if (elements.demoDecisionPreview) {
        elements.demoDecisionPreview.textContent = JSON.stringify(data.decision || {}, null, 2);
      }
      if (elements.demoTradingStatus) {
        elements.demoTradingStatus.textContent = `Signal: ${data.source || "?"} — ${data.decision?.action || "--"}`;
      }
    } catch (err) {
      appState.demoLastDecision = null;
      if (elements.demoDecisionPreview) {
        elements.demoDecisionPreview.textContent = err.message || "Failed";
      }
      if (elements.demoTradingStatus) {
        elements.demoTradingStatus.textContent = "Signal request failed";
      }
    }
    syncAuth(elements, appState);
  }

  async function executeDecision(elements, appState) {
    if (!appState.authToken || !appState.demoLastDecision) return;
    if (elements.demoTradingStatus) {
      elements.demoTradingStatus.textContent = "Submitting order...";
    }
    try {
      await apiPost(
        "/demo/execute-testnet",
        { decision: appState.demoLastDecision },
        { Authorization: `Bearer ${appState.authToken}` }
      );
      if (elements.demoTradingStatus) {
        elements.demoTradingStatus.textContent = "Order submitted. Refreshing...";
      }
    } catch (err) {
      if (elements.demoTradingStatus) {
        elements.demoTradingStatus.textContent = err.message || "Order failed";
      }
    }
    await loadAccount(elements, appState);
  }

  function bindEvents(elements, appState) {
    if (!appState.demoLastDecision) {
      appState.demoLastDecision = null;
    }

    if (elements.demoRunDecision) {
      elements.demoRunDecision.addEventListener("click", () => runDecision(elements, appState));
    }
    if (elements.demoExecute) {
      elements.demoExecute.addEventListener("click", () => executeDecision(elements, appState));
    }
    syncAuth(elements, appState);
  }

  function onLoginStateChange(elements, appState) {
    syncAuth(elements, appState);
    loadAccount(elements, appState);
  }

  return {
    bindEvents,
    loadAccount,
    syncAuth,
    onLoginStateChange
  };
})();
