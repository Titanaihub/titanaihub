export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1");
    const data = await r.json();

    const prices = data.prices.map(p => p[1]);

    const short = prices.slice(-5);
    const mid = prices.slice(-15);

    const shortAvg = short.reduce((a,b)=>a+b,0)/short.length;
    const midAvg = mid.reduce((a,b)=>a+b,0)/mid.length;

    let signal = "WAIT";
    let confidence = 70;

    if (shortAvg > midAvg * 1.002) {
      signal = "BUY";
      confidence = 85;
    } else if (shortAvg < midAvg * 0.998) {
      signal = "SELL";
      confidence = 85;
    }

    res.status(200).json({
      ok: true,
      symbol: "BTC",
      price: prices[prices.length-1],
      signal,
      confidence
    });

  } catch (e) {
    res.status(500).json({ ok:false });
  }
}
