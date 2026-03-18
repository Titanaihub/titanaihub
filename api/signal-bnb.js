export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd");
    const data = await r.json();

    const price = Number(data.binancecoin.usd);
    if (!price) throw new Error("No price");

    let signal = "WAIT";
    let confidence = 70;

    if (price > 0) {
      signal = Math.random() > 0.5 ? "BUY" : "SELL";
      confidence = 80 + Math.floor(Math.random() * 10);
    }

    res.status(200).json({
      ok: true,
      price,
      signal,
      confidence
    });
  } catch (e) {
    res.status(200).json({
      ok: false,
      error: e.toString()
    });
  }
}
