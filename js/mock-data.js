function loadMockOverviewData() {
  return {
    status: "LIVE",
    lastUpdated: new Date().toLocaleString(),
    marketBias: "Sideway",
    totalMarketCap: 2960000000000,
    totalVolume24h: 102800000000,
    btcDominance: 56.5,
    fearGreed: 71
  };
}

function loadMockCoinData() {
  return {
    btc: {
      price: 70909,
      signal: "WAIT",
      change5m: -0.08,
      change15m: 0.12,
      change1h: -0.21,
      change4h: 0.84,
      funding: 0.008,
      oi: 105367612816,
      bias: "Sideway",
      entry: 70650,
      sl: 69980,
      tp: 72150
    },
    eth: {
      price: 2158.14,
      signal: "WAIT",
      change5m: 0.05,
      change15m: -0.11,
      change1h: 0.34,
      change4h: 1.02,
      funding: 0.006,
      oi: 28760000000,
      bias: "Neutral",
      entry: 2142,
      sl: 2108,
      tp: 2205
    },
    bnb: {
      price: 645.44,
      signal: "WAIT",
      change5m: 0.02,
      change15m: 0.09,
      change1h: -0.14,
      change4h: 0.67,
      funding: 0.004,
      oi: 6800000000,
      bias: "Neutral",
      entry: 642,
      sl: 631,
      tp: 658
    }
  };
}

function loadMockWhaleData() {
  return [
    { address: "0xcab5...6e", symbol: "ETH", action: "Open Long", position: "$6.47M", price: "$2157.93", time: "18:14" },
    { address: "0xec32...82", symbol: "BTC", action: "Open Long", position: "$15.56M", price: "$70775.6", time: "18:11" },
    { address: "0xcb84...cd", symbol: "SOL", action: "Close Short", position: "$1.01M", price: "$89.56", time: "18:08" },
    { address: "0xe84f...64", symbol: "HYPE", action: "Close Long", position: "$1.19M", price: "$39.42", time: "18:07" },
    { address: "0x7cb0...20", symbol: "BTC", action: "Open Short", position: "$1.11M", price: "$70215.3", time: "18:05" }
  ];
}

if (typeof window !== "undefined") {
  window.loadMockOverviewData = loadMockOverviewData;
  window.loadMockCoinData = loadMockCoinData;
  window.loadMockWhaleData = loadMockWhaleData;
}

if (typeof global !== "undefined") {
  global.loadMockOverviewData = loadMockOverviewData;
  global.loadMockCoinData = loadMockCoinData;
  global.loadMockWhaleData = loadMockWhaleData;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    loadMockOverviewData,
    loadMockCoinData,
    loadMockWhaleData
  };
}
