window.TitanRenderAlerts = (() => {
  const { escapeHtml, shortText } = window.TitanFormatters;

  function getAlertClass(type) {
    const t = String(type || "system").toLowerCase();

    if (t === "opportunity") return "alert-opportunity";
    if (t === "risk") return "alert-risk";
    if (t === "caution") return "alert-caution";
    if (t === "liquidation") return "alert-liquidation";
    if (t === "positioning") return "alert-positioning";
    if (t === "flow") return "alert-flow";
    if (t === "macro") return "alert-macro";
    return "alert-system";
  }

  function getAlertLabel(type) {
    const t = String(type || "system").toLowerCase();

    if (t === "opportunity") return "OPPORTUNITY";
    if (t === "risk") return "RISK";
    if (t === "caution") return "CAUTION";
    if (t === "liquidation") return "LIQUIDATION";
    if (t === "positioning") return "POSITIONING";
    if (t === "flow") return "FLOW";
    if (t === "macro") return "MACRO";
    return "SYSTEM";
  }

  function renderAlerts(elements, snapshot) {
    if (!elements.alertsGrid) return;

    const items = Array.isArray(snapshot?.alerts) ? snapshot.alerts : [];

    if (!items.length) {
      elements.alertsGrid.innerHTML = `
        <div class="stat-card">
          <span>No alerts</span>
          <strong>--</strong>
        </div>
      `;
      return;
    }

    const html = items
      .slice(0, 14)
      .map((item) => {
        const type = String(item.type || "system").toLowerCase();
        const cardClass = getAlertClass(type);
        const label = getAlertLabel(type);
        const title = shortText(item.title || "--", 90);
        const detail = shortText(item.detail || "", 180);

        return `
          <article class="alert-card ${escapeHtml(cardClass)}">
            <div class="alert-card-top">
              <span class="alert-type">${escapeHtml(label)}</span>
              <strong>${escapeHtml(item.symbol || "--")}</strong>
            </div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(detail)}</p>
          </article>
        `;
      })
      .join("");

    elements.alertsGrid.innerHTML = html;
  }

  return {
    renderAlerts
  };
})();
