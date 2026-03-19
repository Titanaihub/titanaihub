export default async function handler(req, res) {
  let price = null;
  let source = "fallback";

  // 1. ดึงจาก Binance (หลัก)
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const data = await r.json();

    if (data && data.price) {
      price = Number(data.price);
      source = "live";
    }
  } catch (e) {
    console.log("Binance error:", e);
  }

  // 2. fallback → CoinGecko
  if (!price) {
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await r.json();

      if (data && data.bitcoin && data.bitcoin.usd) {
        price = Number(data.bitcoin.usd);
        source = "estimated";
      }
    } catch (e) {
      console.log("CoinGecko error:", e);
    }
  }

  // 3. fallback สุดท้าย (กันเว็บว่าง)
  if (!price) {
    price = 65000;
    source = "fallback";
  }

  res.status(200).json({
    ok: true,
    symbol: "BTC",
    price,
    source
  });
}
