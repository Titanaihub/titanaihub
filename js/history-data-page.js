(() => {
  const elements = {
    historySourceSelect: document.getElementById("historySourceSelect"),
    historySymbolSelect: document.getElementById("historySymbolSelect"),
    historyGoldTfSelect: document.getElementById("historyGoldTfSelect"),
    historyDaysSelect: document.getElementById("historyDaysSelect"),
    historyRefreshBtn: document.getElementById("historyRefreshBtn"),
    historyDataStatus: document.getElementById("historyDataStatus"),
    historyDataTableBody: document.getElementById("historyDataTableBody")
  };

  const state = {
    payload: null
  };

  function fmtMoneyLikeCsv(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    return x.toLocaleString("en-US", { maximumFractionDigits: 8 });
  }

  function fmtVolLikeCsv(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    if (Math.abs(x) >= 1_000_000_000) return `${(x / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(x) >= 1_000_000) return `${(x / 1_000_000).toFixed(2)}M`;
    if (Math.abs(x) >= 1_000) return `${(x / 1_000).toFixed(2)}K`;
    return x.toFixed(2);
  }

  function fmtPct(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "--";
    return `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;
  }

  function fmtDeltaPct(base, target) {
    const b = Number(base);
    const t = Number(target);
    if (!Number.isFinite(b) || !Number.isFinite(t) || b === 0) return "--";
    const pct = ((t - b) / b) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  }

  function fmtRangePct(low, high) {
    const l = Number(low);
    const h = Number(high);
    if (!Number.isFinite(l) || !Number.isFinite(h) || l <= 0) return "--";
    const pct = ((h - l) / l) * 100;
    return `${pct.toFixed(2)}%`;
  }

  function getOwnerAuthHeader() {
    try {
      const raw = localStorage.getItem("titan_hub_auth_v1");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const token = parsed?.token || "";
      if (!token) return {};
      return { Authorization: `Bearer ${token}` };
    } catch (_) {
      return {};
    }
  }

  function barsPerDay(timeframe) {
    const tf = String(timeframe || "M5").toUpperCase();
    if (tf === "M1") return 1440;
    if (tf === "M5") return 288;
    if (tf === "H1") return 24;
    if (tf === "H4") return 6;
    return 1;
  }

  function normalizeGoldRows(rows, symbol) {
    const list = Array.isArray(rows) ? rows : [];
    const out = [];
    let prevClose = null;
    for (const r of list) {
      const close = Number(r.close);
      const open = Number(r.open);
      const high = Number(r.high);
      const low = Number(r.low);
      const volume = Number(r.volume || 0);
      const changePct = Number.isFinite(prevClose) && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : 0;
      out.push({
        symbol,
        date: String(r.time || "--"),
        price: close,
        open,
        high,
        low,
        volume,
        changePct
      });
      prevClose = close;
    }
    return out;
  }

  function render() {
    const body = elements.historyDataTableBody;
    if (!body) return;

    const rows = Array.isArray(state.payload?.rows) ? state.payload.rows : [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="11">No history rows</td></tr>`;
    } else {
      body.innerHTML = rows
        .slice(0, 2000)
        .map((r) => {
          const change = Number(r.changePct);
          const cls = !Number.isFinite(change) ? "" : change >= 0 ? "pos" : "neg";
          const openHigh = fmtDeltaPct(r.open, r.high);
          const openLow = fmtDeltaPct(r.open, r.low);
          const rangePct = fmtRangePct(r.low, r.high);
          return `<tr>
            <td>${String(r.symbol || "--")}</td>
            <td>${String(r.date || "--")}</td>
            <td>${fmtMoneyLikeCsv(r.price)}</td>
            <td>${fmtMoneyLikeCsv(r.open)}</td>
            <td>${fmtMoneyLikeCsv(r.high)}</td>
            <td>${fmtMoneyLikeCsv(r.low)}</td>
            <td>${fmtVolLikeCsv(r.volume)}</td>
            <td class="${cls}">${fmtPct(r.changePct)}</td>
            <td class="pos">${openHigh}</td>
            <td class="neg">${openLow}</td>
            <td>${rangePct}</td>
          </tr>`;
        })
        .join("");
    }

    if (elements.historyDataStatus) {
      const errCount = Array.isArray(state.payload?.errors) ? state.payload.errors.length : 0;
      const symText = String(elements.historySymbolSelect?.value || "--");
      const approxNote = state.payload?.approximate ? " · mode: long-range (approx OHLC)" : "";
      const firstErr =
        errCount && state.payload?.errors?.[0]?.message
          ? ` · ${String(state.payload.errors[0].message).slice(0, 90)}`
          : "";
      const sourceText = String(state.payload?.source || "binance");
      elements.historyDataStatus.textContent = `${sourceText}: ${symText} · rows ${rows.length}${errCount ? ` · errors ${errCount}` : ""}${approxNote}${firstErr}`;
    }
  }

  async function loadHistory() {
    const source = String(elements.historySourceSelect?.value || "binance").toLowerCase();
    const selectedSymbol = String(elements.historySymbolSelect?.value || "BTC").toUpperCase();
    const symbol = source === "mt4gold" ? "XAUUSD" : selectedSymbol;
    const days = Number(elements.historyDaysSelect?.value || 30);
    if (elements.historyDataStatus) {
      elements.historyDataStatus.textContent =
        source === "mt4gold"
          ? "Loading MT4 Gold history..."
          : `Loading ${source === "binance" ? "Binance" : "CoinGecko"} history...`;
    }

    try {
      const { apiGet } = window.TitanApi;
      if (source === "mt4gold") {
        const timeframe = String(elements.historyGoldTfSelect?.value || "M5").toUpperCase();
        const limit = Math.max(80, Math.min(10000, days * barsPerDay(timeframe)));
        const qs = new URLSearchParams({
          symbol,
          timeframe,
          limit: String(limit)
        });
        const headers = getOwnerAuthHeader();
        const out = await apiGet(`/mt4/gold/history-rows?${qs.toString()}`, { headers });
        state.payload = {
          ok: true,
          source: `mt4-gold:${timeframe}`,
          rows: normalizeGoldRows(out.rows || [], symbol),
          errors: []
        };
      } else {
        const qs = new URLSearchParams({
          source,
          symbols: symbol,
          days: String(days),
          perCoin: String(Math.max(30, days))
        });
        state.payload = await apiGet(`/market-history?${qs.toString()}`);
      }
    } catch (err) {
      state.payload = {
        ok: false,
        symbols: [symbol],
        rows: [],
        errors: [{ symbol: "*", message: err.message || "failed" }]
      };
      if (elements.historyDataStatus) {
        elements.historyDataStatus.textContent = `History load failed: ${err.message || "unknown error"}`;
      }
    }

    render();
  }

  function bind() {
    if (elements.historyRefreshBtn) {
      elements.historyRefreshBtn.addEventListener("click", () => {
        loadHistory().catch(() => {});
      });
    }
    if (elements.historyDaysSelect) {
      elements.historyDaysSelect.addEventListener("change", () => {
        loadHistory().catch(() => {});
      });
    }
    if (elements.historyGoldTfSelect) {
      elements.historyGoldTfSelect.addEventListener("change", () => {
        loadHistory().catch(() => {});
      });
    }
    if (elements.historySymbolSelect) {
      elements.historySymbolSelect.addEventListener("change", () => {
        loadHistory().catch(() => {});
      });
    }
    if (elements.historySourceSelect) {
      elements.historySourceSelect.addEventListener("change", () => {
        const isGold = String(elements.historySourceSelect.value || "").toLowerCase() === "mt4gold";
        if (elements.historySymbolSelect) {
          elements.historySymbolSelect.value = isGold ? "XAUUSD" : "BTC";
          elements.historySymbolSelect.disabled = isGold;
        }
        loadHistory().catch(() => {});
      });
    }
  }

  bind();
  loadHistory().catch(() => {});
})();
