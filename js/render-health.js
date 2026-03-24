window.TitanRenderHealth = (() => {
  const { escapeHtml, formatMaybe } = window.TitanFormatters;

  function classifyStatus(ok, empty = false) {
    if (ok) return { label: "OK", className: "health-ok" };
    if (empty) return { label: "EMPTY", className: "health-warn" };
    return { label: "FAIL", className: "health-bad" };
  }

  function buildHealthCard(title, description, ok, empty, meta = {}) {
    const status = classifyStatus(ok, empty);

    return `
      <article class="health-card ${status.className}">
        <div class="health-card-top">
          <h3>${escapeHtml(title)}</h3>
          <span class="health-badge ${status.className}">${escapeHtml(status.label)}</span>
        </div>

        <p>${escapeHtml(description)}</p>

        <div class="health-meta">
          <div class="health-meta-box">
            <span>Status</span>
            <strong>${escapeHtml(status.label)}</strong>
          </div>
          <div class="health-meta-box">
            <span>Items</span>
            <strong>${escapeHtml(formatMaybe(meta.items, "--"))}</strong>
          </div>
          <div class="health-meta-box">
            <span>Source</span>
            <strong>${escapeHtml(formatMaybe(meta.source, "--"))}</strong>
          </div>
          <div class="health-meta-box">
            <span>Note</span>
            <strong>${escapeHtml(formatMaybe(meta.note, "--"))}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function renderHealth(elements, snapshot) {
    if (!elements.healthGrid) return;

    const overview = snapshot?.overview || null;
    const coins = snapshot?.coins || {};
    const coinFocus = Array.isArray(snapshot?.coinFocus) ? snapshot.coinFocus : [];
    const whales = Array.isArray(snapshot?.whales) ? snapshot.whales : [];
    const whaleSummary = Array.isArray(snapshot?.whaleSummary) ? snapshot.whaleSummary : [];
    const liquidity = snapshot?.stablecoinFlows || null;
    const alerts = Array.isArray(snapshot?.alerts) ? snapshot.alerts : [];
    const deepAnalysis = snapshot?.deepAnalysis || null;

    const checks = [
      {
        title: "Overview API",
        description: "Market overview, dominance, fear & greed, market bias",
        ok: Boolean(overview),
        empty: false,
        meta: {
          items: overview ? "1" : "0",
          source: "/overview",
          note: overview?.lastUpdated || "--"
        }
      },
      {
        title: "BTC / ETH / BNB",
        description: "Major coin snapshot endpoints",
        ok: Boolean(coins.btc) || Boolean(coins.eth) || Boolean(coins.bnb),
        empty: false,
        meta: {
          items: [coins.btc, coins.eth, coins.bnb].filter(Boolean).length,
          source: "/coin/btc /coin/eth /coin/bnb",
          note: "snapshot"
        }
      },
      {
        title: "Coin Focus",
        description: "Advanced ranked setups for tracked assets",
        ok: coinFocus.length > 0,
        empty: coinFocus.length === 0,
        meta: {
          items: coinFocus.length,
          source: "/coin-focus",
          note: coinFocus.length ? "live" : "no live data"
        }
      },
      {
        title: "Deep Analysis",
        description: "Heavy analysis package for advanced market state",
        ok: Boolean(deepAnalysis),
        empty: false,
        meta: {
          items: deepAnalysis ? "1" : "0",
          source: "/analysis/deep",
          note: deepAnalysis?.mode || "--"
        }
      },
      {
        title: "Real Flow Feed",
        description: "Flow rows from deep analysis whales block",
        ok: whales.length > 0,
        empty: whales.length === 0,
        meta: {
          items: whales.length,
          source: "deepAnalysis.whales.mixedFeed",
          note: whales.length ? "live" : "empty"
        }
      },
      {
        title: "Positioning Summary",
        description: "Directional bias and pressure summary",
        ok: whaleSummary.length > 0,
        empty: whaleSummary.length === 0,
        meta: {
          items: whaleSummary.length,
          source: "deepAnalysis.whales.summary",
          note: whaleSummary.length ? "live" : "empty"
        }
      },
      {
        title: "Liquidity Summary",
        description: "Liquidity backdrop object availability",
        ok: Boolean(liquidity),
        empty: !liquidity,
        meta: {
          items: liquidity ? "1" : "0",
          source: "stablecoinFlows",
          note: liquidity?.marketLiquidityState || liquidity?.liquidityPressure || "empty"
        }
      },
      {
        title: "Alerts",
        description: "Rendered smart alerts feed",
        ok: alerts.length > 0,
        empty: alerts.length === 0,
        meta: {
          items: alerts.length,
          source: "/alerts",
          note: alerts.length ? "live" : "empty"
        }
      }
    ];

    const okCount = checks.filter((x) => x.ok).length;
    const issueCount = checks.length - okCount;
    const overall = issueCount === 0 ? "HEALTHY" : okCount > 0 ? "PARTIAL" : "DOWN";

    if (elements.healthOverallStatus) {
      elements.healthOverallStatus.textContent = overall;
      elements.healthOverallStatus.classList.remove("pos", "neg", "flat");
      elements.healthOverallStatus.classList.add(
        overall === "HEALTHY" ? "pos" : overall === "PARTIAL" ? "flat" : "neg"
      );
    }

    if (elements.healthLastChecked) {
      elements.healthLastChecked.textContent = new Date().toLocaleString();
    }

    if (elements.healthOkCount) {
      elements.healthOkCount.textContent = String(okCount);
      elements.healthOkCount.classList.remove("pos", "neg", "flat");
      elements.healthOkCount.classList.add("pos");
    }

    if (elements.healthIssueCount) {
      elements.healthIssueCount.textContent = String(issueCount);
      elements.healthIssueCount.classList.remove("pos", "neg", "flat");
      elements.healthIssueCount.classList.add(issueCount > 0 ? "neg" : "flat");
    }

    elements.healthGrid.innerHTML = checks
      .map((item) =>
        buildHealthCard(
          item.title,
          item.description,
          item.ok,
          item.empty,
          item.meta
        )
      )
      .join("");
  }

  return {
    renderHealth
  };
})();
