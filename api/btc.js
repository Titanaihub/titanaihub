export default async function handler(req, res) {
  let price = null;
  let source = "fallback";

  // 🔥 Binance (หลัก)
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const data = await r.json();

    if (data?.price) {
      price = Number(data.price);
      source = "live";
    }
  } catch (e) {}

  // 🔁 CoinGecko (สำรอง)
  if (!price) {
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await r.json();

      if (data?.bitcoin?.usd) {
        price = Number(data.bitcoin.usd);
        source = "estimated";
      }
    } catch (e) {}
  }

  // 🔐 fallback สุดท้าย (กันเว็บว่าง)
  if (!price) {
    price = 65000 + Math.floor(Math.random() * 2000);
    source = "fallback";
  }

  res.status(200).json({
    ok: true,
    symbol: "BTC",
    price,
    source
  });
}
