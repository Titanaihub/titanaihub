window.TitanHelpers = {
  qs(id) {
    return document.getElementById(id);
  },

  formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  },

  formatPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  },

  setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  setSignal(el, value) {
    if (!el) return;
    const signal = String(value || "WAIT").toUpperCase();
    el.textContent = signal;
    el.classList.remove("buy", "sell", "neutral");
    if (signal === "BUY" || signal === "LONG") el.classList.add("buy");
    else if (signal === "SELL" || signal === "SHORT") el.classList.add("sell");
    else el.classList.add("neutral");
  },

  appendChatMessage(role, text) {
    const box = document.getElementById("chatMessages");
    if (!box) return;
    const div = document.createElement("div");
    div.className = `chat-message ${role}`;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
};
