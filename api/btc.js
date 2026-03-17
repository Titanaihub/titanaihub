export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT");
    const data = await r.json();

    res.status(200).json({
      ok: true,
      price: Number(data.lastPrice),
      volume: Number(data.volume)
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: "failed_to_fetch_btc"
    });
  }
}
