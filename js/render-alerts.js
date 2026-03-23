window.TitanRenderAlerts = (() => {
  const { escapeHtml } = window.TitanFormatters;

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

        return `
          <article class="alert-card alert-${escapeHtml(type)}">
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
