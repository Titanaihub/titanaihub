export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=minutely");
    const data = await r.json();

    if (!data.prices || data.prices.length < 20) {
      return res.status(200).json({
        ok: false,
        error: "not enough price data"
      });
    }

    const prices = data.prices.map(item => item[1]);
    const lastPrice = prices[prices.length - 1];

    const short = prices.slice(-5);
    const mid = prices.slice(-15);

    const shortAvg = short.reduce((a, b) => a + b, 0) / short.length;
    const midAvg = mid.reduce((a, b) => a + b, 0) / mid.length;

    let signal = "WAIT";
    let confidence = 70;
    let trend = "Sideway";

    if (shortAvg > midAvg * 1.001) {
      signal = "BUY";
      confidence = Math.min(95, Math.round(75 + ((shortAvg - midAvg) / midAvg) * 10000));
      trend = "Uptrend";
    } else if (shortAvg < midAvg * 0.999) {
      signal = "SELL";
      confidence = Math.min(95, Math.round(75 + ((midAvg - shortAvg) / midAvg) * 10000));
      trend = "Downtrend";
    }

    res.status(200).json({
      ok: true,
      price: Number(lastPrice.toFixed(2)),
      signal,
      confidence,
      trend,
      shortAvg: Number(shortAvg.toFixed(2)),
      midAvg: Number(midAvg.toFixed(2))
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
}
