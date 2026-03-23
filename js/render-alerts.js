window.TitanRenderAlerts = (() => {
  const { escapeHtml } = window.TitanFormatters;

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
      .map((item) => {
        const type = String(item.type || "system").toLowerCase();
        const cardClass = getAlertClass(type);

        return `
          <article class="alert-card ${escapeHtml(cardClass)}">
            <div class="alert-card-top">
              <span class="alert-type">${escapeHtml(type.toUpperCase())}</span>
              <strong>${escapeHtml(item.symbol || "--")}</strong>
            </div>
            <h3>${escapeHtml(item.title || "--")}</h3>
            <p>${escapeHtml(item.detail || "")}</p>
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
