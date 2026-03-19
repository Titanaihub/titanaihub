module.exports = async (req, res) => {
  let price = null;
  let source = "fallback";

  // 1) Binance
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT");
    const data = await r.json();

    if (data && data.price) {
      price = Number(data.price);
      source = "live";
    }
  } catch (e) {}

  // 2) CoinGecko
  if (!price) {
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
      const data = await r.json();

      if (data && data.ethereum && data.ethereum.usd) {
        price = Number(data.ethereum.usd);
        source = "estimated";
      }
    } catch (e) {}
  }

  // 3) Fallback
  if (!price) {
    price = 3500;
    source = "fallback";
  }

  res.status(200).json({
    ok: true,
    symbol: "ETH",
    price,
    source
  });
};
