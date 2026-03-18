export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT");
    const data = await r.json();

    res.status(200).json({
      ok: true,
      symbol: "BNB",
      price: Number(data.price)
    });

  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.toString()
    });
  }
}
