function now() {
  return Date.now();
}

function isFresh(timestamp, ttl) {
  return Number(timestamp) > 0 && now() - Number(timestamp) < ttl;
}

function hasThai(text) {
  return /[ก-๙]/.test(String(text || ""));
}

function detectReplyLanguage(text) {
  return hasThai(text) ? "th" : "en";
}

function fmt(v) {
  return v ?? "--";
}

function sanitizeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function average(nums) {
  const clean = nums.filter((v) => Number.isFinite(Number(v))).map(Number);
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function sum(nums) {
  return nums
    .filter((v) => Number.isFinite(Number(v)))
    .map(Number)
    .reduce((a, b) => a + b, 0);
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

module.exports = {
  now,
  isFresh,
  hasThai,
  detectReplyLanguage,
  fmt,
  sanitizeInt,
  clamp,
  average,
  sum,
  normalizeSymbol
};
