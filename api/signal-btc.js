export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const data = await r.json();

    const price = Number(data.price);

    if (!price) throw new Error("No price");

    let signal = "WAIT";
    let confidence = 70;

    // logic ง่ายๆก่อน
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
