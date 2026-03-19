const BASE_URL = "https://pro-api.coingecko.com/api/v3";

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoinGecko request failed: ${res.status} ${text}`);
  }

  return await res.json();
}

function withApiKey(url) {
  const key = process.env.COINGECKO_API_KEY;
  if (!key) {
    throw new Error("Missing COINGECKO_API_KEY");
  }
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}x_cg_pro_api_key=${encodeURIComponent(key)}`;
}

function buildTimeframe(prices, minutes) {
  const now = Date.now();
  const from = now - minutes * 60 * 1000;
  const slice = prices.filter(([ts]) => ts >= from);

  if (!slice.length) return null;

  const open = slice[0][1];
  const close = slice[slice.length - 1][1];
  const values = slice.map((x) => x[1]);
  const high = Math.max(...values);
  const low = Math.min(...values);

  return {
    open: Number(open.toFixed(2)),
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    close: Number(close.toFixed(2)),
    volume: 0
  };
}

function calcReturnPct(tf) {
  if (!tf || !tf.open) return 0;
  return Number((((tf.close - tf.open) / tf.open) * 100).toFixed(2));
}

function calcRangePct(tf) {
  if (!tf || !tf.open) return 0;
  return Number((((tf.high - tf.low) / tf.open) * 100).toFixed(2));
}

async function fetchCoinPrice(coinId) {
  const url = withApiKey(
    `${BASE_URL}/simple/price?ids=${coinId}&vs_currencies=usd&include_last_updated_at=true`
  );

  const data = await fetchJson(url);

  if (!data?.[coinId]?.usd) {
    throw new Error(`No price for ${coinId}`);
  }

  return {
    price: Number(data[coinId].usd),
    lastUpdatedAt: data[coinId].last_updated_at || null
  };
}

async function fetchCoinMarketData(coinId, symbol) {
  const [spot, chart] = await Promise.all([
    fetchCoinPrice(coinId),
    fetchJson(
      withApiKey(
        `${BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=1`
      )
    )
  ]);

  const prices = chart?.prices || [];

  if (!prices.length) {
    throw new Error(`No chart data for ${coinId}`);
  }

  const tf5m = buildTimeframe(prices, 5);
  const tf15m = buildTimeframe(prices, 15);
  const tf1h = buildTimeframe(prices, 60);
  const tf4h = buildTimeframe(prices, 240);

  return {
    ok: true,
    symbol,
    coinId,
    source: "coingecko",
    price: Number(spot.price.toFixed(2)),
    lastUpdatedAt: spot.lastUpdatedAt,
    timeframes: {
      "5m": tf5m,
      "15m": tf15m,
      "1h": tf1h,
      "4h": tf4h
    },
    stats: {
      return5m: calcReturnPct(tf5m),
      return15m: calcReturnPct(tf15m),
      return1h: calcReturnPct(tf1h),
      return4h: calcReturnPct(tf4h),
      range1hPct: calcRangePct(tf1h),
      range4hPct: calcRangePct(tf4h)
    }
  };
}

module.exports = {
  fetchCoinPrice,
  fetchCoinMarketData
};
