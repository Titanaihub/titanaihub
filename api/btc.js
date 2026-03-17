export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const data = await r.json();

    res.status(200).json({
      ok: true,
      price: Number(data.price),
      volume: 0
    });

  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.toString()
    });
  }
}
