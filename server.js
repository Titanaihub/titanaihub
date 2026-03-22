const express = require("express");
const cors = require("cors");
const path = require("path");
const https = require("https");

const {
  loadMockOverviewData,
  loadMockCoinData,
  loadMockWhaleData
} = require("./js/mock-data.js");

const {
  getRealOverview,
  getRealCoin
} = require("./js/real-data.js");

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const CACHE_TTL_MS = 30 * 1000;
const WHALES_TTL_MS = 45 * 1000;

const runtimeCache = {
  overview: {
    live: null,
    lastGood: null,
    updatedAt: 0
  },
  coins: {
    btc: { live: null, lastGood: null, updatedAt: 0 },
    eth: { live: null, lastGood: null, updatedAt: 0 },
    bnb: { live: null, lastGood: null, updatedAt: 0 }
  },
  whales: {
    rows: null,
    summary: null,
    stablecoinFlows: null,
    updatedAt: 0
  }
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

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

function isValidOverview(data) {
  return Boolean(
    data &&
      Number(data.totalMarketCap) > 0 &&
      Number(data.totalVolume24h) > 0 &&
      Number(data.btcDominance) > 0 &&
      Number(data.fearGreed) >= 0 &&
      typeof data.marketBias === "string" &&
      data.marketBias.length > 0
  );
}

function isValidCoin(data) {
  return Boolean(
    data &&
      Number(data.price) > 0 &&
      typeof data.signal === "string" &&
      data.signal.length > 0 &&
      Number.isFinite(Number(data.entry)) &&
      Number.isFinite(Number(data.sl)) &&
      Number.isFinite(Number(data.tp)) &&
      typeof data.bias === "string"
  );
}

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

function average(nums) {
  const clean = nums.filter((v) => Number.isFinite(Number(v))).map(Number);
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function formatAveragePrice(values) {
  const avg = average(values);
  if (!Number.isFinite(Number(avg))) return "--";
  return formatPrice(avg);
}

function getExplorerUrl(chain, address) {
  const safe = encodeURIComponent(address || "");
  switch (chain) {
    case "btc":
      return `https://www.blockchain.com/explorer/addresses/btc/${safe}`;
    case "eth":
      return `https://etherscan.io/address/${safe}`;
    case "bsc":
      return `https://bscscan.com/address/${safe}`;
    case "sol":
      return `https://solscan.io/account/${safe}`;
    case "xrp":
      return `https://xrpscan.com/account/${safe}`;
    case "doge":
      return `https://blockchair.com/dogecoin/address/${safe}`;
    default:
      return `https://etherscan.io/address/${safe}`;
  }
}

function hhmmss() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
function coinBriefEN(symbol, coin) {
  return `${symbol}: signal ${fmt(coin.signal)}, bias ${fmt(coin.bias)}, entry ${fmt(
    coin.entry
  )}, stop loss ${fmt(coin.sl)}, take profit ${fmt(coin.tp)}.`;
}

function coinBriefTH(symbol, coin) {
  return `${symbol}: สัญญาณ ${fmt(coin.signal)}, มุมมอง ${fmt(coin.bias)}, จุดเข้า ${fmt(
    coin.entry
  )}, stop loss ${fmt(coin.sl)}, take profit ${fmt(coin.tp)}.`;
}

function coinTradeViewEN(symbol, coin) {
  return `${symbol} looks ${String(coin.bias || "neutral").toLowerCase()}. Current signal is ${fmt(
    coin.signal
  )}. Suggested structure: entry near ${fmt(coin.entry)}, stop loss near ${fmt(
    coin.sl
  )}, and take profit near ${fmt(coin.tp)}. Funding is ${fmt(
    coin.funding
  )}% and open interest is ${fmt(coin.oi)}.`;
}

function coinTradeViewTH(symbol, coin) {
  return `${symbol} ตอนนี้มีมุมมองแบบ ${fmt(
    coin.bias
  )}. สัญญาณปัจจุบันคือ ${fmt(
    coin.signal
  )}. โครงสร้างเทรดที่แนะนำคือ เข้าใกล้ ${fmt(
    coin.entry
  )}, ตั้ง stop loss แถว ${fmt(coin.sl)}, และ take profit แถว ${fmt(
    coin.tp
  )}. Funding อยู่ที่ ${fmt(coin.funding)}% และ open interest อยู่ที่ ${fmt(coin.oi)}.`;
}

function compareReplyEN(btc, eth, bnb) {
  return (
    `Comparison now: ${coinBriefEN("BTC", btc)} ${coinBriefEN("ETH", eth)} ${coinBriefEN(
      "BNB",
      bnb
    )} ` +
    `BTC remains the main reference asset, ETH is the secondary setup, and BNB is the calmer watchlist asset.`
  );
}

function compareReplyTH(btc, eth, bnb) {
  return (
    `สรุปเปรียบเทียบตอนนี้: ${coinBriefTH("BTC", btc)} ${coinBriefTH("ETH", eth)} ${coinBriefTH(
      "BNB",
      bnb
    )} ` +
    `BTC ยังเป็นเหรียญอ้างอิงหลักของตลาด, ETH เป็นตัวเลือกอันดับสอง, และ BNB เป็นเหรียญที่นิ่งกว่าเหมาะกับการเฝ้าดูเพิ่ม.`
  );
}

function riskReplyEN(overview) {
  return (
    `Current risk view: market bias is ${fmt(overview.marketBias)}. ` +
    `BTC dominance is ${fmt(overview.btcDominance)}% and fear & greed is ${fmt(
      overview.fearGreed
    )}. ` +
    `That means chasing is not ideal right now. Use smaller size, respect stop loss strictly, and avoid overtrading while the market stays ${String(
      overview.marketBias || "mixed"
    ).toLowerCase()}.`
  );
}

function riskReplyTH(overview) {
  return (
    `มุมมองความเสี่ยงตอนนี้: ภาพรวมตลาดเป็น ${fmt(overview.marketBias)}. ` +
    `BTC Dominance อยู่ที่ ${fmt(overview.btcDominance)}% และ Fear & Greed อยู่ที่ ${fmt(
      overview.fearGreed
    )}. ` +
    `แปลว่าไม่ควรไล่ราคาแรงในตอนนี้ ควรลดขนาดไม้ ใช้ stop loss ให้ชัด และหลีกเลี่ยงการเข้าเทรดถี่เกินไปในช่วงที่ตลาดยัง ${fmt(
      overview.marketBias
    )}.`
  );
}

function entryMapEN(btc, eth, bnb) {
  return (
    `Current trade map: ` +
    `BTC entry ${fmt(btc.entry)}, SL ${fmt(btc.sl)}, TP ${fmt(btc.tp)}; ` +
    `ETH entry ${fmt(eth.entry)}, SL ${fmt(eth.sl)}, TP ${fmt(eth.tp)}; ` +
    `BNB entry ${fmt(bnb.entry)}, SL ${fmt(bnb.sl)}, TP ${fmt(bnb.tp)}.`
  );
}

function entryMapTH(btc, eth, bnb) {
  return (
    `แผนจุดเข้า ณ ตอนนี้: ` +
    `BTC เข้า ${fmt(btc.entry)}, SL ${fmt(btc.sl)}, TP ${fmt(btc.tp)}; ` +
    `ETH เข้า ${fmt(eth.entry)}, SL ${fmt(eth.sl)}, TP ${fmt(eth.tp)}; ` +
    `BNB เข้า ${fmt(bnb.entry)}, SL ${fmt(bnb.sl)}, TP ${fmt(bnb.tp)}.`
  );
}

function buildFallbackReply(question, overview, btc, eth, bnb) {
  const qRaw = String(question || "").trim();
  const q = qRaw.toLowerCase();
  const lang = detectReplyLanguage(qRaw);
  const isThai = lang === "th";

  let reply = isThai
    ? `ภาพรวมตลาดตอนนี้เป็น ${fmt(overview.marketBias)}. BTC Dominance อยู่ที่ ${fmt(
        overview.btcDominance
      )}% และ Fear & Greed อยู่ที่ ${fmt(
        overview.fearGreed
      )}. ควรบริหารความเสี่ยงและรอจังหวะที่ชัดขึ้น.`
    : `Market is ${String(overview.marketBias || "mixed").toLowerCase()}. BTC dominance is ${fmt(
        overview.btcDominance
      )}% and fear & greed is ${fmt(
        overview.fearGreed
      )}. Best approach is controlled risk until cleaner confirmation appears.`;

  if (q.includes("compare") || q.includes("เทียบ") || q.includes("เปรียบเทียบ")) {
    reply = isThai ? compareReplyTH(btc, eth, bnb) : compareReplyEN(btc, eth, bnb);
  } else if (q.includes("risk") || q.includes("ความเสี่ยง") || q.includes("เสี่ยง")) {
    reply = isThai ? riskReplyTH(overview) : riskReplyEN(overview);
  } else if (
    q.includes("entry") ||
    q.includes("sl") ||
    q.includes("tp") ||
    q.includes("stop") ||
    q.includes("take profit") ||
    q.includes("จุดเข้า") ||
    q.includes("ตัดขาดทุน") ||
    q.includes("ทำกำไร")
  ) {
    reply = isThai ? entryMapTH(btc, eth, bnb) : entryMapEN(btc, eth, bnb);
  } else if (q.includes("btc")) {
    reply = isThai ? coinTradeViewTH("BTC", btc) : coinTradeViewEN("BTC", btc);
  } else if (q.includes("eth")) {
    reply = isThai ? coinTradeViewTH("ETH", eth) : coinTradeViewEN("ETH", eth);
  } else if (q.includes("bnb")) {
    reply = isThai ? coinTradeViewTH("BNB", bnb) : coinTradeViewEN("BNB", bnb);
  }

  return reply;
}
async function getStableOverview() {
  if (isFresh(runtimeCache.overview.updatedAt, CACHE_TTL_MS) && runtimeCache.overview.live) {
    return runtimeCache.overview.live;
  }

  try {
    const data = await getRealOverview();

    if (isValidOverview(data)) {
      runtimeCache.overview.live = data;
      runtimeCache.overview.lastGood = data;
      runtimeCache.overview.updatedAt = now();
      return data;
    }
  } catch (err) {
    console.error("getStableOverview live failed:", err.message);
  }

  if (runtimeCache.overview.lastGood) {
    return runtimeCache.overview.lastGood;
  }

  const mock = loadMockOverviewData();
  runtimeCache.overview.live = mock;
  runtimeCache.overview.lastGood = mock;
  runtimeCache.overview.updatedAt = now();
  return mock;
}

async function getStableCoin(symbol) {
  const key = String(symbol || "").toLowerCase();
  const mockCoins = loadMockCoinData();
  const bucket = runtimeCache.coins[key];

  if (!bucket) {
    return mockCoins[key] || {};
  }

  if (isFresh(bucket.updatedAt, CACHE_TTL_MS) && bucket.live) {
    return bucket.live;
  }

  try {
    const data = await getRealCoin(key);

    if (isValidCoin(data)) {
      bucket.live = data;
      bucket.lastGood = data;
      bucket.updatedAt = now();
      return data;
    }
  } catch (err) {
    console.error(`getStableCoin live failed ${key}:`, err.message);
  }

  if (bucket.lastGood) {
    return bucket.lastGood;
  }

  const mock = mockCoins[key] || {};
  bucket.live = mock;
  bucket.lastGood = mock;
  bucket.updatedAt = now();
  return mock;
}

function getWhaleBlueprint() {
  return [
    {
      symbol: "BTC",
      chain: "btc",
      whales: [
        { address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", side: "LONG", status: "OPEN", sizeUsd: 12800000, entryOffsetPct: 0.0020, tpOffsetPct: 0.0180, slOffsetPct: 0.0100, hasPending: true, pendingType: "Buy Limit", pendingPriceOffsetPct: -0.0040 },
        { address: "bc1q8q9v4y9pyuv2g5n3yx0d7m0w8k3mz7n2s8aj7a", side: "LONG", status: "OPEN", sizeUsd: 8400000, entryOffsetPct: -0.0010, tpOffsetPct: 0.0220, slOffsetPct: 0.0120, hasPending: false },
        { address: "bc1q6hjw6e8h4de0m4g3s8j3mggsntk7f5mdpkd6ep", side: "SHORT", status: "OPEN", sizeUsd: 3900000, entryOffsetPct: 0.0030, tpOffsetPct: -0.0160, slOffsetPct: 0.0090, hasPending: true, pendingType: "Sell Limit", pendingPriceOffsetPct: 0.0060 },
        { address: "bc1q7l0m4rf7r6u4k7xq2q9w0k9t8m3q0z2m5p9fkl", side: "LONG", status: "CLOSED", sizeUsd: 2100000, entryOffsetPct: -0.0040, exitOffsetPct: 0.0080, tpOffsetPct: 0.0150, slOffsetPct: 0.0100, hasPending: false }
      ]
    },
    {
      symbol: "ETH",
      chain: "eth",
      whales: [
        { address: "0x8ba1f109551bd432803012645ac136ddd64dba72", side: "SHORT", status: "OPEN", sizeUsd: 8400000, entryOffsetPct: 0.0025, tpOffsetPct: -0.0250, slOffsetPct: 0.0120, hasPending: true, pendingType: "Sell Limit", pendingPriceOffsetPct: 0.0050 },
        { address: "0x53d284357ec70ce289d6d64134dfac8e511c8a3d", side: "SHORT", status: "OPEN", sizeUsd: 5100000, entryOffsetPct: 0.0010, tpOffsetPct: -0.0190, slOffsetPct: 0.0100, hasPending: false },
        { address: "0xf977814e90da44bfa03b6295a0616a897441acec", side: "LONG", status: "OPEN", sizeUsd: 2700000, entryOffsetPct: -0.0030, tpOffsetPct: 0.0160, slOffsetPct: 0.0090, hasPending: true, pendingType: "Buy Limit", pendingPriceOffsetPct: -0.0060 },
        { address: "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0", side: "CLOSED_LONG", status: "CLOSED", sizeUsd: 1900000, entryOffsetPct: -0.0050, exitOffsetPct: 0.0070, tpOffsetPct: 0.0140, slOffsetPct: 0.0110, hasPending: false }
      ]
    },
    {
      symbol: "BNB",
      chain: "bsc",
      whales: [
        { address: "bnb1grpf0955h0yk6l2v3arh9p7hk0j2v8w5x9k3m4", side: "LONG", status: "OPEN", sizeUsd: 4200000, entryOffsetPct: -0.0015, tpOffsetPct: 0.0300, slOffsetPct: 0.0150, hasPending: true, pendingType: "Buy Limit", pendingPriceOffsetPct: -0.0050 },
        { address: "bnb1vr0s9mjk6g0rf4d0n6x6ec7n0m58m7g8c6g5w3", side: "LONG", status: "OPEN", sizeUsd: 3100000, entryOffsetPct: -0.0025, tpOffsetPct: 0.0240, slOffsetPct: 0.0130, hasPending: false },
        { address: "bnb1x4n2l5u4p8w7f6m0s9r8c7d2v3k1y7m0q2r6a1", side: "SHORT", status: "OPEN", sizeUsd: 1800000, entryOffsetPct: 0.0030, tpOffsetPct: -0.0180, slOffsetPct: 0.0100, hasPending: true, pendingType: "Sell Limit", pendingPriceOffsetPct: 0.0060 }
      ]
    },
    {
      symbol: "SOL",
      chain: "sol",
      whales: [
        { address: "7dHbWXad2mZ4n6F7s7Q7iLwQ4n8r6nR7h5y3nJ8x2pAf", side: "SHORT", status: "OPEN", sizeUsd: 3900000, entryOffsetPct: 0.0040, tpOffsetPct: -0.0200, slOffsetPct: 0.0110, hasPending: true, pendingType: "Sell Limit", pendingPriceOffsetPct: 0.0070 },
        { address: "9xQeWvG816bUx9EP8jHmaT23yvVMuFez7R8v2DqQYQwV", side: "LONG", status: "OPEN", sizeUsd: 2100000, entryOffsetPct: -0.0030, tpOffsetPct: 0.0170, slOffsetPct: 0.0100, hasPending: false }
      ]
    },
    {
      symbol: "XRP",
      chain: "xrp",
      whales: [
        { address: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh", side: "LONG", status: "OPEN", sizeUsd: 2750000, entryOffsetPct: -0.0020, tpOffsetPct: 0.0180, slOffsetPct: 0.0100, hasPending: true, pendingType: "Buy Limit", pendingPriceOffsetPct: -0.0040 }
      ]
    },
    {
      symbol: "DOGE",
      chain: "doge",
      whales: [
        { address: "D8BqR7M6b5YkV3n2QmZxL9fT6sR4uW1pNx", side: "SHORT", status: "OPEN", sizeUsd: 1950000, entryOffsetPct: 0.0050, tpOffsetPct: -0.0220, slOffsetPct: 0.0120, hasPending: true, pendingType: "Sell Limit", pendingPriceOffsetPct: 0.0080 }
      ]
    },
    {
      symbol: "PEPE",
      chain: "eth",
      whales: [
        { address: "0x6a3f4c9b1d62f1d1e7a61e3cf4d7a8e5f91b4d32", side: "LONG", status: "OPEN", sizeUsd: 1320000, entryOffsetPct: -0.0040, tpOffsetPct: 0.0250, slOffsetPct: 0.0130, hasPending: true, pendingType: "Scale Buy", pendingPriceOffsetPct: -0.0070 }
      ]
    },
    {
      symbol: "WIF",
      chain: "sol",
      whales: [
        { address: "9xQeWvG816bUx9EP8jHmaT23yvVMuFez7R8v2DqQYQwV", side: "SHORT", status: "OPEN", sizeUsd: 1180000, entryOffsetPct: 0.0050, tpOffsetPct: -0.0230, slOffsetPct: 0.0120, hasPending: true, pendingType: "Sell Limit", pendingPriceOffsetPct: 0.0080 }
      ]
    },
    {
      symbol: "BONK",
      chain: "sol",
      whales: [
        { address: "5PjDJaGfSPtWJ8p2w9jRr5n3eWg2Yq7mT9z4L6s8VkQx", side: "LONG", status: "OPEN", sizeUsd: 960000, entryOffsetPct: -0.0060, tpOffsetPct: 0.0280, slOffsetPct: 0.0140, hasPending: true, pendingType: "Scale Buy", pendingPriceOffsetPct: -0.0090 }
      ]
    },
    {
      symbol: "FLOKI",
      chain: "eth",
      whales: [
        { address: "0x2a3f9e7d1b6a3c8f4e1d7a2b9c5d8e6f7a1b2c3d", side: "SHORT", status: "OPEN", sizeUsd: 880000, entryOffsetPct: 0.0040, tpOffsetPct: -0.0190, slOffsetPct: 0.0100, hasPending: false }
      ]
    },
    {
      symbol: "SHIB",
      chain: "eth",
      whales: [
        { address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", side: "LONG", status: "OPEN", sizeUsd: 1440000, entryOffsetPct: -0.0050, tpOffsetPct: 0.0240, slOffsetPct: 0.0120, hasPending: true, pendingType: "Buy Limit", pendingPriceOffsetPct: -0.0080 }
      ]
    }
  ];
}
async function buildWhalePackage() {
  if (isFresh(runtimeCache.whales.updatedAt, WHALES_TTL_MS) && runtimeCache.whales.rows) {
    return {
      rows: runtimeCache.whales.rows,
      summary: runtimeCache.whales.summary,
      stablecoinFlows: runtimeCache.whales.stablecoinFlows
    };
  }

  const [btc, eth, bnb] = await Promise.all([
    getStableCoin("btc"),
    getStableCoin("eth"),
    getStableCoin("bnb")
  ]);

  const priceMap = {
    BTC: Number(btc.price) || 69100,
    ETH: Number(eth.price) || 2110,
    BNB: Number(bnb.price) || 633.5,
    SOL: 139.8,
    XRP: 0.61,
    DOGE: 0.12,
    PEPE: 0.0000124,
    WIF: 1.84,
    BONK: 0.0000286,
    FLOKI: 0.0001732,
    SHIB: 0.0000264
  };

  const blueprints = getWhaleBlueprint();
  const rows = [];
  const summary = [];

  for (const group of blueprints) {
    const basePrice = priceMap[group.symbol] || 1;

    const localRows = group.whales.map((w, idx) => {
      const sideRaw = String(w.side || "LONG").toUpperCase();
      const cleanSide = sideRaw.includes("SHORT") ? "SHORT" : "LONG";
      const status = String(w.status || "OPEN").toUpperCase();

      const entry = basePrice * (1 + Number(w.entryOffsetPct || 0));
      const exit =
        status === "CLOSED"
          ? basePrice * (1 + Number(w.exitOffsetPct || 0))
          : null;

      const tp =
        cleanSide === "LONG"
          ? entry * (1 + Math.abs(Number(w.tpOffsetPct || 0.015)))
          : entry * (1 - Math.abs(Number(w.tpOffsetPct || -0.015)));

      const sl =
        cleanSide === "LONG"
          ? entry * (1 - Math.abs(Number(w.slOffsetPct || 0.01)))
          : entry * (1 + Math.abs(Number(w.slOffsetPct || 0.01)));

      const pendingPrice = w.hasPending
        ? entry * (1 + Number(w.pendingPriceOffsetPct || 0))
        : null;

      const action =
        status === "CLOSED"
          ? cleanSide === "LONG"
            ? "Close Long"
            : "Close Short"
          : cleanSide === "LONG"
          ? "Open Long"
          : "Open Short";

      return {
        address: w.address,
        symbol: group.symbol,
        action,
        side: cleanSide,
        status,
        position: formatUsd(w.sizeUsd),
        sizeUsd: w.sizeUsd,
        price: formatPrice(basePrice),
        entry: formatPrice(entry),
        entryValue: Number(entry.toFixed(12)),
        exit: exit ? formatPrice(exit) : "--",
        exitValue: exit ? Number(exit.toFixed(12)) : null,
        tp: formatPrice(tp),
        tpValue: Number(tp.toFixed(12)),
        sl: formatPrice(sl),
        slValue: Number(sl.toFixed(12)),
        hasPending: Boolean(w.hasPending),
        pendingType: w.pendingType || "--",
        pendingPrice: pendingPrice ? formatPrice(pendingPrice) : "--",
        pendingPriceValue: pendingPrice ? Number(pendingPrice.toFixed(12)) : null,
        time: hhmmss(),
        chain: group.chain,
        explorerUrl: getExplorerUrl(group.chain, w.address),
        whaleId: `${group.symbol}-${idx + 1}`
      };
    });

    rows.push(...localRows);

    const longRows = localRows.filter((r) => r.side === "LONG" && r.status === "OPEN");
    const shortRows = localRows.filter((r) => r.side === "SHORT" && r.status === "OPEN");

    const longSize = longRows.reduce((sum, r) => sum + Number(r.sizeUsd || 0), 0);
    const shortSize = shortRows.reduce((sum, r) => sum + Number(r.sizeUsd || 0), 0);

    let netBias = "Mixed";
    if (longSize > shortSize * 1.1) netBias = "Long Dominant";
    else if (shortSize > longSize * 1.1) netBias = "Short Dominant";

    summary.push({
      symbol: group.symbol,
      whaleCount: localRows.length,
      openLongCount: longRows.length,
      openShortCount: shortRows.length,
      openLongUsd: formatUsd(longSize),
      openShortUsd: formatUsd(shortSize),
      avgLongEntry: longRows.length ? formatAveragePrice(longRows.map((r) => r.entryValue)) : "--",
      avgShortEntry: shortRows.length ? formatAveragePrice(shortRows.map((r) => r.entryValue)) : "--",
      avgTp: formatAveragePrice(localRows.map((r) => r.tpValue)),
      avgSl: formatAveragePrice(localRows.map((r) => r.slValue)),
      avgExit: formatAveragePrice(localRows.map((r) => r.exitValue)),
      pendingOrders: localRows.filter((r) => r.hasPending).length,
      netBias
    });
  }

  const stablecoinFlows = [
    {
      symbol: "USDT",
      exchangeInflow: "$148.00M",
      exchangeOutflow: "$92.00M",
      netFlow: "$56.00M",
      interpretation: "More stablecoin on exchanges, supports future buy-side activity"
    },
    {
      symbol: "USDC",
      exchangeInflow: "$64.00M",
      exchangeOutflow: "$71.00M",
      netFlow: "-$7.00M",
      interpretation: "Slightly defensive flow, some capital moving off exchange"
    },
    {
      symbol: "DAI",
      exchangeInflow: "$11.00M",
      exchangeOutflow: "$8.00M",
      netFlow: "$3.00M",
      interpretation: "Neutral to mildly constructive"
    }
  ];

  runtimeCache.whales.rows = rows;
  runtimeCache.whales.summary = summary;
  runtimeCache.whales.stablecoinFlows = stablecoinFlows;
  runtimeCache.whales.updatedAt = now();

  return {
    rows,
    summary,
    stablecoinFlows
  };
}

function getLegacyWhaleRows(rows) {
  return rows.map((r) => ({
    address: r.address,
    symbol: r.symbol,
    action: r.action,
    position: r.position,
    price: r.price,
    time: r.time,
    chain: r.chain,
    explorerUrl: r.explorerUrl,
    entry: r.entry,
    exit: r.exit,
    tp: r.tp,
    sl: r.sl,
    status: r.status,
    side: r.side,
    pendingType: r.pendingType,
    pendingPrice: r.pendingPrice
  }));
}
function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        }
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          const status = res.statusCode || 500;

          try {
            const json = JSON.parse(data || "{}");
            if (status >= 200 && status < 300) {
              resolve(json);
            } else {
              reject(new Error(json?.error?.message || `DeepSeek HTTP ${status}`));
            }
          } catch (err) {
            reject(new Error(`Invalid JSON response from DeepSeek: ${err.message}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function buildSystemPrompt(language) {
  if (language === "th") {
    return [
      "คุณคือผู้ช่วยวิเคราะห์ตลาดคริปโตของ Titan AI Hub",
      "ตอบเป็นภาษาไทยเท่านั้น",
      "ห้ามตอบภาษาอังกฤษ ยกเว้นชื่อเหรียญ คำว่า LONG, SHORT, entry, stop loss, take profit",
      "ถ้าผู้ใช้ถามเป็นภาษาไทย ต้องตอบไทยทั้งหมด",
      "ตอบสั้น กระชับ อ่านง่าย",
      "ใช้ข้อมูล snapshot ที่ให้มาเท่านั้น",
      "ห้ามแต่งตัวเลขเพิ่ม",
      "ถ้าผู้ใช้ถามเรื่องเทรด ให้สรุปเป็น:",
      "1) มุมมอง",
      "2) ความเสี่ยง",
      "3) จุดเข้า/SL/TP ถ้ามี",
      "ถ้าข้อมูลไม่พอให้พูดตรง ๆ"
    ].join("\n");
  }

  return [
    "You are Titan AI Hub crypto market assistant.",
    "Reply in English only.",
    "If the user asks in English, do not answer in Thai.",
    "Be concise and easy to read.",
    "Use only the snapshot data provided.",
    "Do not invent numbers.",
    "If the user asks for trading analysis, summarize:",
    "1) bias",
    "2) risk",
    "3) entry/SL/TP if available",
    "If data is insufficient, say so clearly."
  ].join("\n");
}

async function callDeepSeekChat({ question, overview, btc, eth, bnb, whales }) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const language = detectReplyLanguage(question);
  const systemPrompt = buildSystemPrompt(language);

  const snapshotText = JSON.stringify(
    {
      overview,
      coins: { btc, eth, bnb },
      whales
    },
    null,
    2
  );

  const userPrompt =
    language === "th"
      ? `คำถามผู้ใช้:
${question}

ข้อมูลตลาด:
${snapshotText}

กรุณาตอบเป็นภาษาไทยเท่านั้น`
      : `User question:
${question}

Market snapshot:
${snapshotText}

Reply in English only.`;

  const payload = {
    model: DEEPSEEK_MODEL,
    stream: false,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  const json = await postJson("https://api.deepseek.com/chat/completions", payload, {
    Authorization: `Bearer ${DEEPSEEK_API_KEY}`
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned empty content");
  }

  return String(content).trim();
}
app.get("/api/overview", async (req, res) => {
  try {
    const data = await getStableOverview();
    return res.json(data);
  } catch (err) {
    console.error("overview route fallback:", err.message);
    return res.json(loadMockOverviewData());
  }
});

app.get("/api/coin/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").toLowerCase();

  try {
    const data = await getStableCoin(symbol);
    return res.json(data);
  } catch (err) {
    console.error(`coin route fallback ${symbol}:`, err.message);
    const mockCoins = loadMockCoinData();
    return res.json(mockCoins[symbol] || {});
  }
});

app.get("/api/whales", async (req, res) => {
  try {
    const pkg = await buildWhalePackage();
    return res.json(getLegacyWhaleRows(pkg.rows));
  } catch (err) {
    console.error("whales route fallback:", err.message);
    return res.json(loadMockWhaleData());
  }
});

app.get("/api/whales-summary", async (req, res) => {
  try {
    const pkg = await buildWhalePackage();
    return res.json(pkg.summary);
  } catch (err) {
    console.error("whales-summary route fallback:", err.message);
    return res.json([]);
  }
});

app.get("/api/stablecoin-flows", async (req, res) => {
  try {
    const pkg = await buildWhalePackage();
    return res.json(pkg.stablecoinFlows);
  } catch (err) {
    console.error("stablecoin-flows route fallback:", err.message);
    return res.json([]);
  }
});

app.get("/api/debug-version", (req, res) => {
  res.json({
    version: "WEB-WHALE-SUMMARY-V2",
    model: DEEPSEEK_MODEL || "--",
    deepseekEnabled: Boolean(DEEPSEEK_API_KEY)
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username === "admin" && password === "1234") {
    return res.json({
      ok: true,
      success: true,
      message: "Login successful"
    });
  }

  return res.status(401).json({
    ok: false,
    success: false,
    message: "Invalid username or password"
  });
});

app.post("/api/chat", async (req, res) => {
  const { question, snapshot } = req.body || {};
  const qRaw = String(question || "").trim();

  let parsed = null;
  try {
    parsed = snapshot ? JSON.parse(snapshot) : null;
  } catch (_) {
    parsed = null;
  }

  let overview = parsed?.overview || null;
  let coins = parsed?.coins || {};
  let whales = parsed?.whales || [];

  if (!overview) {
    overview = await getStableOverview();
  }

  let btc = coins.btc || null;
  let eth = coins.eth || null;
  let bnb = coins.bnb || null;

  if (!btc) btc = await getStableCoin("btc");
  if (!eth) eth = await getStableCoin("eth");
  if (!bnb) bnb = await getStableCoin("bnb");

  if (!Array.isArray(whales) || whales.length === 0) {
    const pkg = await buildWhalePackage();
    whales = pkg.rows;
  }

  try {
    const reply = await callDeepSeekChat({
      question: qRaw,
      overview,
      btc,
      eth,
      bnb,
      whales
    });

    return res.json({
      ok: true,
      source: "deepseek",
      language: detectReplyLanguage(qRaw),
      reply
    });
  } catch (err) {
    console.error("deepseek fallback:", err.message);

    const reply = buildFallbackReply(qRaw, overview, btc, eth, bnb);

    return res.json({
      ok: true,
      source: "fallback",
      language: detectReplyLanguage(qRaw),
      reply
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Titan AI Hub server running on port ${PORT}`);
});
