module.exports = async (req, res) => {
  let price = null;
  let source = "fallback";

  // 1) Binance
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT");
    const data = await r.json();

    if (data && data.price) {
      price = Number(data.price);
      source = "live";
    }
  } catch (e) {}

  // 2) CoinGecko
  if (!price) {
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd");
      const data = await r.json();

      if (data && data.binancecoin && data.binancecoin.usd) {
        price = Number(data.binancecoin.usd);
        source = "estimated";
      }
    } catch (e) {}
  }

  // 3) fallback
  if (!price) {
    price = 300;
    source = "fallback";
  }

  res.status(200).json({
    ok: true,
    symbol: "BNB",
    price,
    source
  });
};
