export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BNBUSDT");
    const data = await r.json();

    const price = Number(data.lastPrice);
    const volume = Number(data.volume);

    let signal = "WAIT";
    let confidence = 70;

    if (price && volume) {
      if (volume > 3000) {
        signal = Math.random() > 0.5 ? "BUY" : "SELL";
        confidence = 80 + Math.floor(Math.random() * 15);
      }
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
