const {
  WHALES_TTL_MS,
  MAX_WHALE_PAGE_SIZE,
  COIN_UNIVERSE,
  WHALE_MULTIPLIER_MAP,
  RUNTIME_CACHE
} = require("../config/constants.js");
const { getAllStableCoins } = require("./coin-service.js");
const { formatUsd, formatPrice, hhmmss } = require("../utils/formatters.js");
const {
  isFresh,
  now,
  sum,
  average
} = require("../utils/helpers.js");

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

function formatAveragePrice(values) {
  const avg = average(values);
  if (!Number.isFinite(Number(avg))) return "--";
  return formatPrice(avg);
}

function getWhaleBlueprint() {
  return [
    {
      symbol: "BTC",
      chain: "btc",
      whales: [
        {
          address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 12800000,
          entryOffsetPct: 0.002,
          tpOffsetPct: 0.018,
          slOffsetPct: 0.01,
          hasPending: true,
          pendingType: "Buy Limit",
          pendingPriceOffsetPct: -0.004
        },
        {
          address: "bc1q8q9v4y9pyuv2g5n3yx0d7m0w8k3mz7n2s8aj7a",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 8400000,
          entryOffsetPct: -0.001,
          tpOffsetPct: 0.022,
          slOffsetPct: 0.012,
          hasPending: false
        },
        {
          address: "bc1q6hjw6e8h4de0m4g3s8j3mggsntk7f5mdpkd6ep",
          side: "SHORT",
          status: "OPEN",
          sizeUsd: 3900000,
          entryOffsetPct: 0.003,
          tpOffsetPct: -0.016,
          slOffsetPct: 0.009,
          hasPending: true,
          pendingType: "Sell Limit",
          pendingPriceOffsetPct: 0.006
        },
        {
          address: "bc1q7l0m4rf7r6u4k7xq2q9w0k9t8m3q0z2m5p9fkl",
          side: "LONG",
          status: "CLOSED",
          sizeUsd: 2100000,
          entryOffsetPct: -0.004,
          exitOffsetPct: 0.008,
          tpOffsetPct: 0.015,
          slOffsetPct: 0.01,
          hasPending: false
        }
      ]
    },
    {
      symbol: "ETH",
      chain: "eth",
      whales: [
        {
          address: "0x8ba1f109551bd432803012645ac136ddd64dba72",
          side: "SHORT",
          status: "OPEN",
          sizeUsd: 8400000,
          entryOffsetPct: 0.0025,
          tpOffsetPct: -0.025,
          slOffsetPct: 0.012,
          hasPending: true,
          pendingType: "Sell Limit",
          pendingPriceOffsetPct: 0.005
        },
        {
          address: "0x53d284357ec70ce289d6d64134dfac8e511c8a3d",
          side: "SHORT",
          status: "OPEN",
          sizeUsd: 5100000,
          entryOffsetPct: 0.001,
          tpOffsetPct: -0.019,
          slOffsetPct: 0.01,
          hasPending: false
        },
        {
          address: "0xf977814e90da44bfa03b6295a0616a897441acec",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 2700000,
          entryOffsetPct: -0.003,
          tpOffsetPct: 0.016,
          slOffsetPct: 0.009,
          hasPending: true,
          pendingType: "Buy Limit",
          pendingPriceOffsetPct: -0.006
        },
        {
          address: "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0",
          side: "LONG",
          status: "CLOSED",
          sizeUsd: 1900000,
          entryOffsetPct: -0.005,
          exitOffsetPct: 0.007,
          tpOffsetPct: 0.014,
          slOffsetPct: 0.011,
          hasPending: false
        }
      ]
    },
    {
      symbol: "BNB",
      chain: "bsc",
      whales: [
        {
          address: "bnb1grpf0955h0yk6l2v3arh9p7hk0j2v8w5x9k3m4",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 4200000,
          entryOffsetPct: -0.0015,
          tpOffsetPct: 0.03,
          slOffsetPct: 0.015,
          hasPending: true,
          pendingType: "Buy Limit",
          pendingPriceOffsetPct: -0.005
        },
        {
          address: "bnb1vr0s9mjk6g0rf4d0n6x6ec7n0m58m7g8c6g5w3",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 3100000,
          entryOffsetPct: -0.0025,
          tpOffsetPct: 0.024,
          slOffsetPct: 0.013,
          hasPending: false
        },
        {
          address: "bnb1x4n2l5u4p8w7f6m0s9r8c7d2v3k1y7m0q2r6a1",
          side: "SHORT",
          status: "OPEN",
          sizeUsd: 1800000,
          entryOffsetPct: 0.003,
          tpOffsetPct: -0.018,
          slOffsetPct: 0.01,
          hasPending: true,
          pendingType: "Sell Limit",
          pendingPriceOffsetPct: 0.006
        }
      ]
    },
    {
      symbol: "SOL",
      chain: "sol",
      whales: [
        {
          address: "7dHbWXad2mZ4n6F7s7Q7iLwQ4n8r6nR7h5y3nJ8x2pAf",
          side: "SHORT",
          status: "OPEN",
          sizeUsd: 3900000,
          entryOffsetPct: 0.004,
          tpOffsetPct: -0.02,
          slOffsetPct: 0.011,
          hasPending: true,
          pendingType: "Sell Limit",
          pendingPriceOffsetPct: 0.007
        },
        {
          address: "9xQeWvG816bUx9EP8jHmaT23yvVMuFez7R8v2DqQYQwV",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 2100000,
          entryOffsetPct: -0.003,
          tpOffsetPct: 0.017,
          slOffsetPct: 0.01,
          hasPending: false
        }
      ]
    },
    {
      symbol: "XRP",
      chain: "xrp",
      whales: [
        {
          address: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 2750000,
          entryOffsetPct: -0.002,
          tpOffsetPct: 0.018,
          slOffsetPct: 0.01,
          hasPending: true,
          pendingType: "Buy Limit",
          pendingPriceOffsetPct: -0.004
        }
      ]
    },
    {
      symbol: "DOGE",
      chain: "doge",
      whales: [
        {
          address: "D8BqR7M6b5YkV3n2QmZxL9fT6sR4uW1pNx",
          side: "SHORT",
          status: "OPEN",
          sizeUsd: 1950000,
          entryOffsetPct: 0.005,
          tpOffsetPct: -0.022,
          slOffsetPct: 0.012,
          hasPending: true,
          pendingType: "Sell Limit",
          pendingPriceOffsetPct: 0.008
        }
      ]
    },
    {
      symbol: "PEPE",
      chain: "eth",
      whales: [
        {
          address: "0x6a3f4c9b1d62f1d1e7a61e3cf4d7a8e5f91b4d32",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 1320000,
          entryOffsetPct: -0.004,
          tpOffsetPct: 0.025,
          slOffsetPct: 0.013,
          hasPending: true,
          pendingType: "Scale Buy",
          pendingPriceOffsetPct: -0.007
        }
      ]
    },
    {
      symbol: "WIF",
      chain: "sol",
      whales: [
        {
          address: "9xQeWvG816bUx9EP8jHmaT23yvVMuFez7R8v2DqQYQwV",
          side: "SHORT",
          status: "OPEN",
          sizeUsd: 1180000,
          entryOffsetPct: 0.005,
          tpOffsetPct: -0.023,
          slOffsetPct: 0.012,
          hasPending: true,
          pendingType: "Sell Limit",
          pendingPriceOffsetPct: 0.008
        }
      ]
    },
    {
      symbol: "BONK",
      chain: "sol",
      whales: [
        {
          address: "5PjDJaGfSPtWJ8p2w9jRr5n3eWg2Yq7mT9z4L6s8VkQx",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 960000,
          entryOffsetPct: -0.006,
          tpOffsetPct: 0.028,
          slOffsetPct: 0.014,
          hasPending: true,
          pendingType: "Scale Buy",
          pendingPriceOffsetPct: -0.009
        }
      ]
    },
    {
      symbol: "FLOKI",
      chain: "eth",
      whales: [
        {
          address: "0x2a3f9e7d1b6a3c8f4e1d7a2b9c5d8e6f7a1b2c3d",
          side: "SHORT",
          status: "OPEN",
          sizeUsd: 880000,
          entryOffsetPct: 0.004,
          tpOffsetPct: -0.019,
          slOffsetPct: 0.01,
          hasPending: false
        }
      ]
    },
    {
      symbol: "SHIB",
      chain: "eth",
      whales: [
        {
          address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce",
          side: "LONG",
          status: "OPEN",
          sizeUsd: 1440000,
          entryOffsetPct: -0.005,
          tpOffsetPct: 0.024,
          slOffsetPct: 0.012,
          hasPending: true,
          pendingType: "Buy Limit",
          pendingPriceOffsetPct: -0.008
        }
      ]
    }
  ];
}

function expandWhaleBlueprint(baseBlueprints) {
  return baseBlueprints.map((group) => {
    const multiplier = WHALE_MULTIPLIER_MAP[group.symbol] || 3;
    const expanded = [];

    for (let i = 0; i < multiplier; i += 1) {
      for (let j = 0; j < group.whales.length; j += 1) {
        const base = group.whales[j];
        const factor = 1 + i * 0.08 + j * 0.015;
        const entryShift = (i % 2 === 0 ? -1 : 1) * 0.0006 * (j + 1);
        const tpShift = 1 + i * 0.03;
        const slShift = 1 + i * 0.02;

        expanded.push({
          address: base.address,
          side: base.side,
          status: base.status,
          sizeUsd: Math.round(base.sizeUsd * factor),
          entryOffsetPct: Number(base.entryOffsetPct || 0) + entryShift,
          exitOffsetPct: base.exitOffsetPct,
          tpOffsetPct: Number(base.tpOffsetPct || 0) * tpShift,
          slOffsetPct: Number(base.slOffsetPct || 0) * slShift,
          hasPending: base.hasPending,
          pendingType: base.pendingType,
          pendingPriceOffsetPct:
            typeof base.pendingPriceOffsetPct === "number"
              ? base.pendingPriceOffsetPct * (1 + i * 0.05)
              : base.pending
