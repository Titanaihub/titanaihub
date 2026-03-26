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

  /** Binance one-way mode sends positionSide BOTH; derive LONG/SHORT from positionAmt sign. */
  function futuresPositionSide(p) {
    const amt = Number(p.positionAmt || 0);
    const ps = String(p.positionSide || "").toUpperCase();
    if (ps === "LONG" || ps === "SHORT") return ps;
    return amt >= 0 ? "LONG" : "SHORT";
  }

  /** Long → Buy (green), Short → Sell (red); uses global `.buy` / `.sell` from styles.css */
  function futuresSideBuySellHtml(p) {
    const s = futuresPositionSide(p);
    const cls = s === "LONG" ? "buy" : "sell";
    const label = s === "LONG" ? "Buy" : "Sell";
    return `<span class="${cls}">${label}</span>`;
  }

  function bindDemoTradingAccountTabs(mount) {
    const root = mount.querySelector(".demo-trading-account-tabs");
    if (!root) return;
    const buttons = root.querySelectorAll("button[data-demo-tab]");
    const panels = mount.querySelectorAll("[data-demo-tab-panel]");

    function activate(tabId) {
      buttons.forEach((b) => {
        const on = b.getAttribute("data-demo-tab") === tabId;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      panels.forEach((p) => {
        p.hidden = p.getAttribute("data-demo-tab-panel") !== tabId;
      });
    }

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => activate(btn.getAttribute("data-demo-tab")));
    });
  }

  function updatePlaceOrderHint(elements, appState) {
    const el = elements.demoPlaceOrderHint;
    if (!el) return;
    const ok = Boolean(appState.loggedIn && appState.authToken);
    if (!ok) {
      el.textContent = "";
      return;
    }
    const d = appState.demoLastDecision;
    const action = d ? String(d.action || "").toUpperCase() : "";
    if (!d) {
      el.textContent =
        "Place order stays off until you run Get AI signal. It only turns on when the signal action is OPEN_LONG or OPEN_SHORT (not WAIT).";
      return;
    }
    if (["OPEN_LONG", "OPEN_SHORT"].includes(action)) {
      el.textContent = "You can place the order — signal allows a market entry on Testnet.";
      return;
    }
    el.textContent = `Place order is off because the signal is ${action || "WAIT"}. Wait for OPEN_LONG or OPEN_SHORT, or run Get AI signal again later.`;
  }

  function syncAuth(elements, appState) {
    const ok = Boolean(appState.loggedIn && appState.authToken);
    if (elements.demoRunDecision) elements.demoRunDecision.disabled = !ok;
    const d = appState.demoLastDecision;
    const actionStr = d ? String(d.action || "").toUpperCase() : "";
    const canExec =
      ok && d && ["OPEN_LONG", "OPEN_SHORT"].includes(actionStr);
    if (elements.demoExecute) {
      elements.demoExecute.disabled = !canExec;
      elements.demoExecute.title = canExec
        ? "Submit a market order on Binance Futures Testnet"
        : "Only enabled when the latest AI signal action is OPEN_LONG or OPEN_SHORT";
    }

    if (elements.demoRunDecision) {
      elements.demoRunDecision.classList.toggle("btn-primary", !canExec);
      elements.demoRunDecision.classList.toggle("btn-secondary", !!canExec);
    }
    if (elements.demoExecute) {
      elements.demoExecute.classList.toggle("btn-primary", !!canExec);
      elements.demoExecute.classList.toggle("btn-secondary", !canExec);
    }

    updatePlaceOrderHint(elements, appState);
  }

  function formatAutoStatus(data) {
    if (!data || data.ok === false) return "";
    const bits = [];
    if (!data.autoFeatureEnabled) {
      return "Auto mode blocked on server (DEMO_AUTO_TRADING_ENABLED=false).";
    }
    if (!data.tradingEnabled) {
      bits.push("Enable BINANCE_TESTNET_TRADING_ENABLED for auto orders.");
    }
    if (data.running) {
      bits.push(
        `Auto: ON · every ${Math.round(data.intervalMs / 60000)} min · cycles ${data.ticks ?? 0}`
      );
      if (data.tickInProgress) {
        bits.push(
          "Cycle in progress (loading snapshot + AI — first cycle often 30–90s, then this clears)"
        );
      }
      if (data.lastTickAt) {
        bits.push(`Last cycle ${data.lastTickAt.replace("T", " ").slice(0, 19)} UTC`);
      }
      if (data.lastDecision?.decision) {
        const d = data.lastDecision.decision;
        bits.push(
          `Last AI ${d.action} ${d.symbol || ""} (${data.lastDecision.source}) · min conf ${data.minConfidence ?? "?"}`
        );
      }
      if (data.lastExecute?.skipped) {
        bits.push(`Execution: skipped (${data.lastExecute.reason})`);
      } else if (data.lastExecute?.ok === true) {
        bits.push("Execution: order sent");
      } else if (data.lastExecute?.ok === false) {
        bits.push(`Execution error: ${data.lastExecute.error || "?"}`);
      }
    } else {
      bits.push(
        "Auto: OFF — Start once: server scans all Coin Focus symbols each cycle and places orders when signal & confidence allow (no extra clicks)."
      );
    }
    if (data.lastError) {
      bits.push(`Note: ${data.lastError}`);
    }
    const te = data.tradeEnv;
    if (te && !te.aggressiveOnWait) {
      bits.push(
        "Aggressive rules: OFF (set DEMO_AGGRESSIVE_ON_WAIT=true on server when AI always says WAIT)"
      );
    } else if (te && te.aggressiveOnWait) {
      bits.push(`Aggressive rules: ON (min setup ${te.aggressiveMinSetupScore})`);
    }
    return bits.join(" · ");
  }

  function renderDecisionLog(elements, data) {
    const pre = elements.demoDecisionLog;
    if (!pre) return;
    if (!data || data.ok === false) {
      pre.textContent = "--";
      return;
    }
    const payload = {
      tradeEnv: data.tradeEnv || null,
      recentCycles: data.decisionLog || []
    };
    pre.textContent = JSON.stringify(payload, null, 2);
  }

  function syncAutoUi(elements, appState, data) {
    const ok = Boolean(appState.loggedIn && appState.authToken);
    if (elements.demoAutoIntervalMs) {
      elements.demoAutoIntervalMs.disabled = !ok;
    }
    const canStart =
      ok && data && data.autoFeatureEnabled !== false && data.tradingEnabled === true;
    if (elements.demoAutoStart) {
      elements.demoAutoStart.disabled = !canStart || Boolean(data && data.running);
      if (data && data.running) {
        elements.demoAutoStart.classList.add("btn-trading-online");
        elements.demoAutoStart.title = "Auto trading is on (online)";
      } else {
        elements.demoAutoStart.classList.remove("btn-trading-online");
        elements.demoAutoStart.title = "";
      }
    }
    if (elements.demoAutoStop) {
      elements.demoAutoStop.disabled = !ok || !data || !data.running;
    }
  }

  async function loadAutoStatus(elements, appState) {
    if (!appState.loggedIn || !appState.authToken) {
      if (elements.demoAutoStatusLine) elements.demoAutoStatusLine.textContent = "";
      renderDecisionLog(elements, null);
      if (elements.demoRunDecision) {
        elements.demoRunDecision.classList.remove("btn-trading-online");
        elements.demoRunDecision.title = "";
      }
      if (elements.demoAutoStart) {
        elements.demoAutoStart.classList.remove("btn-trading-online");
        elements.demoAutoStart.title = "";
      }
      syncAutoUi(elements, appState, null);
      return;
    }
    try {
      const data = await apiGet("/demo/auto-trading/status", {
        headers: { Authorization: `Bearer ${appState.authToken}` }
      });
      if (elements.demoAutoStatusLine) {
        elements.demoAutoStatusLine.textContent = formatAutoStatus(data);
      }
      renderDecisionLog(elements, data);
      syncAutoUi(elements, appState, data);
    } catch (err) {
      if (elements.demoAutoStatusLine) {
        elements.demoAutoStatusLine.textContent = err.message || "Auto status failed";
      }
      renderDecisionLog(elements, null);
      syncAutoUi(elements, appState, null);
    }
  }

  async function startAutoTrading(elements, appState) {
    if (!appState.authToken) return;
    const intervalMs = elements.demoAutoIntervalMs
      ? Number(elements.demoAutoIntervalMs.value)
      : 300000;
    try {
      await apiPost(
        "/demo/auto-trading/start",
        { intervalMs: Number.isFinite(intervalMs) ? intervalMs : 300000 },
        { Authorization: `Bearer ${appState.authToken}` }
      );
    } catch (err) {
      if (elements.demoAutoStatusLine) {
        elements.demoAutoStatusLine.textContent = err.message || "Start failed";
      }
    }
    await loadAccount(elements, appState);
    [2500, 6000, 12000].forEach((ms) => {
      setTimeout(() => loadAutoStatus(elements, appState).catch(() => {}), ms);
    });
  }

  async function stopAutoTrading(elements, appState) {
    if (!appState.authToken) return;
    try {
      await apiPost(
        "/demo/auto-trading/stop",
        {},
        { Authorization: `Bearer ${appState.authToken}` }
      );
    } catch (err) {
      if (elements.demoAutoStatusLine) {
        elements.demoAutoStatusLine.textContent = err.message || "Stop failed";
      }
    }
    await loadAccount(elements, appState);
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

    const openPosList = (snap.positions || []).filter(
      (p) => Math.abs(Number(p.positionAmt || 0)) > 1e-12
    );
    const posRows = openPosList
      .map(
        (p) => `
      <tr>
        <td>${escapeHtml(p.symbol)}</td>
        <td>${futuresSideBuySellHtml(p)}</td>
        <td>${escapeHtml(p.positionAmt)}</td>
        <td>${escapeHtml(p.entryPrice)}</td>
        <td>${escapeHtml(p.markPrice)}</td>
        <td class="${Number(p.unRealizedProfit) >= 0 ? "pos" : "neg"}">${fmtUsd(p.unRealizedProfit)}</td>
      </tr>`
      )
      .join("");

    const unrealizedTotal = Number(snap.unrealizedTotal);
    const unrealizedFootClass =
      !Number.isFinite(unrealizedTotal) ? "" : unrealizedTotal >= 0 ? "pos" : "neg";

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

    const realizedSum = Number(snap.realizedRecentSum);
    const historyPnlClass =
      !Number.isFinite(realizedSum) ? "" : realizedSum >= 0 ? "pos" : "neg";
    const historyPnlWord = !Number.isFinite(realizedSum)
      ? "—"
      : Math.abs(realizedSum) < 1e-8
        ? "Break-even"
        : realizedSum > 0
          ? "Net profit"
          : "Net loss";

    mount.innerHTML = `
      <div class="demo-trading-summary">
        <div class="stat-card"><span>Status</span><strong>${escapeHtml(te)}</strong></div>
        <div class="stat-card"><span>USDT available</span><strong>${fmtUsd(avail)}</strong></div>
        <div class="stat-card"><span>Wallet (USDT)</span><strong>${fmtUsd(wallet)}</strong></div>
        <div class="stat-card"><span>Unrealized PnL</span><strong class="${Number(snap.unrealizedTotal) >= 0 ? "pos" : "neg"}">${fmtUsd(snap.unrealizedTotal)}</strong></div>
        <div class="stat-card"><span>Realized PnL (recent)</span><strong class="${Number(snap.realizedRecentSum) >= 0 ? "pos" : "neg"}">${fmtUsd(snap.realizedRecentSum)}</strong></div>
      </div>
      <div class="demo-trading-account-tabs top-tabs demo-trading-two-tabs" role="tablist" aria-label="Futures account tables">
        <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-demo-tab="positions">Positions</button>
        <button type="button" class="tab-btn" role="tab" aria-selected="false" data-demo-tab="orderHistory">History</button>
      </div>
      <div class="demo-trading-tab-panel" role="tabpanel" data-demo-tab-panel="positions">
        <p class="demo-trading-tab-hint">Open positions — trades not yet closed.</p>
        <div class="table-wrap">
          <table class="data-table demo-trading-pos-table">
            <thead>
              <tr>
                <th>Symbol</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Unrealized PnL</th>
              </tr>
            </thead>
            <tbody>${
              openPosList.length
                ? posRows
                : `<tr><td colspan="6">No open positions</td></tr>`
            }</tbody>
            <tfoot>
              <tr class="demo-trading-pos-tfoot">
                <td colspan="5">Total unrealized PnL (open)</td>
                <td class="${unrealizedFootClass}"><strong>${fmtUsd(snap.unrealizedTotal)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div class="demo-trading-tab-panel" role="tabpanel" data-demo-tab-panel="orderHistory" hidden>
        <p class="demo-trading-tab-hint">Closed trades — history and realized P&amp;L.</p>
        <h4 class="demo-trading-sub demo-trading-history-section-title">Recent fills</h4>
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
        <h4 class="demo-trading-sub demo-trading-history-section-title">Realized PnL (income detail)</h4>
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
        <div class="demo-trading-history-footer">
          <div class="stat-card demo-trading-history-pnl">
            <span>Total realized P&amp;L (closed trades, recent)</span>
            <strong class="${historyPnlClass}">${fmtUsd(snap.realizedRecentSum)}</strong>
            <span class="demo-trading-history-pnl-label">${escapeHtml(historyPnlWord)}</span>
          </div>
        </div>
      </div>
    `;
    bindDemoTradingAccountTabs(mount);
  }

  async function loadAccount(elements, appState) {
    if (!appState.loggedIn || !appState.authToken) {
      if (elements.demoAccountMount) {
        elements.demoAccountMount.innerHTML = `<div class="stat-card"><span>Futures account</span><strong>Sign in as owner to load positions and balances</strong></div>`;
      }
      await loadAutoStatus(elements, appState);
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
    await loadAutoStatus(elements, appState);
  }

  async function runDecision(elements, appState) {
    if (!appState.authToken) return;
    if (elements.demoRunDecision) {
      elements.demoRunDecision.classList.remove("btn-trading-online");
      elements.demoRunDecision.title = "";
    }
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
        const out = data.tradeEnv
          ? { tradeEnv: data.tradeEnv, decision: data.decision || {} }
          : data.decision || {};
        elements.demoDecisionPreview.textContent = JSON.stringify(out, null, 2);
      }
      if (elements.demoTradingStatus) {
        elements.demoTradingStatus.textContent = `Signal: ${data.source || "?"} — ${data.decision?.action || "--"}`;
      }
      if (elements.demoRunDecision) {
        elements.demoRunDecision.classList.add("btn-trading-online");
        elements.demoRunDecision.title = "Signal loaded — online (click to refresh)";
      }
    } catch (err) {
      appState.demoLastDecision = null;
      if (elements.demoRunDecision) {
        elements.demoRunDecision.classList.remove("btn-trading-online");
      }
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
    if (elements.demoAutoStart) {
      elements.demoAutoStart.addEventListener("click", () => startAutoTrading(elements, appState));
    }
    if (elements.demoAutoStop) {
      elements.demoAutoStop.addEventListener("click", () => stopAutoTrading(elements, appState));
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
    loadAutoStatus,
    syncAuth,
    onLoginStateChange
  };
})();
