window.TitanFormatters = (() => {
  function formatMaybe(value, fallback = "--") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatUsdCompact(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  }

  function formatPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";

    const abs = Math.abs(n);

    if (abs >= 1000) return `$${n.toFixed(2)}`;
    if (abs >= 1) return `$${n.toFixed(2)}`;
    if (abs >= 0.1) return `$${n.toFixed(4)}`;
    if (abs >= 0.01) return `$${n.toFixed(5)}`;
    if (abs >= 0.001) return `$${n.toFixed(6)}`;
    if (abs >= 0.0001) return `$${n.toFixed(7)}`;
    if (abs >= 0.00001) return `$${n.toFixed(8)}`;
    return `$${n.toExponential(4)}`;
  }

  function formatPercent(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
  }

  function getSignalClass(signal) {
    const s = String(signal || "").toUpperCase();
    if (s.includes("LONG")) return "signal-long";
    if (s.includes("SHORT")) return "signal-short";
    return "signal-wait";
  }

  function getSignedClass(value) {
    const text = String(value || "");
    if (text.startsWith("+")) return "pos";
    if (text.startsWith("-")) return "neg";
    return "flat";
  }

  function getBiasClass(value) {
    const text = String(value || "").toLowerCase();
    if (
      text.includes("bull") ||
      text.includes("buy") ||
      text.includes("risk-on") ||
      text.includes("constructive")
    ) {
      return "pos";
    }

    if (
      text.includes("bear") ||
      text.includes("sell") ||
      text.includes("risk-off") ||
      text.includes("panic") ||
      text.includes("defensive")
    ) {
      return "neg";
    }

    return "flat";
  }

  return {
    formatMaybe,
    escapeHtml,
    toNum,
    formatUsdCompact,
    formatPrice,
    formatPercent,
    getSignalClass,
    getSignedClass,
    getBiasClass
  };
})();
