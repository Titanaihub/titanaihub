window.TitanFormatters = (() => {
  function toNum(value, fallback = NaN) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

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

  function formatPrice(value) {
    const n = toNum(value);
    if (!Number.isFinite(n)) return "--";

    const abs = Math.abs(n);

    if (abs >= 1000) return `$${n.toFixed(2)}`;
    if (abs >= 100) return `$${n.toFixed(2)}`;
    if (abs >= 1) return `$${n.toFixed(3)}`;
    if (abs >= 0.01) return `$${n.toFixed(4)}`;
    if (abs >= 0.0001) return `$${n.toFixed(6)}`;
    return `$${n.toFixed(8)}`;
  }

  function formatUsdCompact(value) {
    const n = toNum(value);
    if (!Number.isFinite(n)) return "--";

    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  }

  function formatPercent(value, digits = 2) {
    const n = toNum(value);
    if (!Number.isFinite(n)) return "--";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(digits)}%`;
  }

  function formatSignedNumber(value, digits = 2) {
    const n = toNum(value);
    if (!Number.isFinite(n)) return "--";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(digits)}`;
  }

  function formatRatio(value, digits = 3) {
    const n = toNum(value);
    if (!Number.isFinite(n)) return "--";
    return n.toFixed(digits);
  }

  function shortText(value, maxLength = 140) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
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
      text.includes("long") ||
      text.includes("risk-on") ||
      text.includes("support") ||
      text.includes("constructive") ||
      text.includes("bid")
    ) {
      return "pos";
    }

    if (
      text.includes("bear") ||
      text.includes("sell") ||
      text.includes("short") ||
      text.includes("risk-off") ||
      text.includes("ask pressure") ||
      text.includes("defensive") ||
      text.includes("discount")
    ) {
      return "neg";
    }

    return "flat";
  }

  return {
    toNum,
    formatMaybe,
    escapeHtml,
    formatPrice,
    formatUsdCompact,
    formatPercent,
    formatSignedNumber,
    formatRatio,
    shortText,
    getSignalClass,
    getSignedClass,
    getBiasClass
  };
})();
