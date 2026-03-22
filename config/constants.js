const CACHE_TTL_MS = 30 * 1000;
const WHALES_TTL_MS = 45 * 1000;

const DEFAULT_WHALE_PAGE_SIZE = 20;
const MAX_WHALE_PAGE_SIZE = 200;
const DEFAULT_COIN_LIMIT = 12;

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const COIN_UNIVERSE = [
  { symbol: "BTC", key: "btc", className: "major", chain: "btc", fallbackPrice: 69000 },
  { symbol: "ETH", key: "eth", className: "major", chain: "eth", fallbackPrice: 2100 },
  { symbol: "BNB", key: "bnb", className: "major", chain: "bsc", fallbackPrice: 630 },
  { symbol: "SOL", key: "sol", className: "largecap", chain: "sol", fallbackPrice: 140 },
  { symbol: "XRP", key: "xrp", className: "largecap", chain: "xrp", fallbackPrice: 0.61 },
  { symbol: "DOGE", key: "doge", className: "largecap", chain: "doge", fallbackPrice: 0.12 },
  { symbol: "ADA", key: "ada", className: "largecap", chain: "ada", fallbackPrice: 0.72 },
  { symbol: "LINK", key: "link", className: "largecap", chain: "eth", fallbackPrice: 18.4 },
  { symbol: "AVAX", key: "avax", className: "largecap", chain: "avax", fallbackPrice: 39.5 },
  { symbol: "TON", key: "ton", className: "largecap", chain: "ton", fallbackPrice: 5.1 },
  { symbol: "PEPE", key: "pepe", className: "meme", chain: "eth", fallbackPrice: 0.0000124 },
  { symbol: "WIF", key: "wif", className: "meme", chain: "sol", fallbackPrice: 1.84 },
  { symbol: "BONK", key: "bonk", className: "meme", chain: "sol", fallbackPrice: 0.0000286 },
  { symbol: "FLOKI", key: "floki", className: "meme", chain: "eth", fallbackPrice: 0.0001732 },
  { symbol: "SHIB", key: "shib", className: "meme", chain: "eth", fallbackPrice: 0.0000264 }
];

const WHALE_MULTIPLIER_MAP = {
  BTC: 6,
  ETH: 6,
  BNB: 5,
  SOL: 5,
  XRP: 4,
  DOGE: 4,
  PEPE: 5,
  WIF: 4,
  BONK: 4,
  FLOKI: 4,
  SHIB: 4
};

const RUNTIME_CACHE = {
  overview: {
    live: null,
    lastGood: null,
    updatedAt: 0
  },
  coins: {},
  whales: {
    allRows: null,
    summary: null,
    stablecoinFlows: null,
    mixedFeed: null,
    updatedAt: 0
  },
  coinFocus: {
    list: null,
    updatedAt: 0
  },
  alerts: {
    list: null,
    updatedAt: 0
  }
};

module.exports = {
  CACHE_TTL_MS,
  WHALES_TTL_MS,
  DEFAULT_WHALE_PAGE_SIZE,
  MAX_WHALE_PAGE_SIZE,
  DEFAULT_COIN_LIMIT,
  DEEPSEEK_MODEL,
  COIN_UNIVERSE,
  WHALE_MULTIPLIER_MAP,
  RUNTIME_CACHE
};
