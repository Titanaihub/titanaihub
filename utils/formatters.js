function formatUsd(value) {
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

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function hhmmss() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

module.exports = {
  formatUsd,
  formatPrice,
  formatPercent,
  hhmmss
};
