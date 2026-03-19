module.exports = async (req, res) => {
  try {
    let price = null;
    let source = "fallback";

    // ✅ Binance
    try {
      const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
      const data = await r.json();

      if (data && data.price) {
        price = Number(data.price);
        source = "live";
      }
    } catch (e) {}

    // ✅ CoinGecko fallback
    if (!price) {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
        const data = await r.json();

        if (data && data.bitcoin && data.bitcoin.usd) {
          price = Number(data.bitcoin.usd);
          source = "estimated";
        }
      } catch (e) {}
    }

    // 🔐 fallback กันตาย
    if (!price) {
      price = 65000;
      source = "fallback";
    }

    // 🧠 signal logic
    let signal = "WAIT";
    let confidence = 65;

    const mod = price % 200;

    if (mod > 120) {
      signal = "BUY";
      confidence = 80;
    } else if (mod < 60) {
      signal = "SELL";
      confidence = 80;
    }

    let entry = price;
    let stopLoss = null;
    let takeProfit = null;

    if (signal === "BUY") {
      stopLoss = price - 250;
      takeProfit = price + 450;
    }

    if (signal === "SELL") {
      stopLoss = price + 250;
      takeProfit = price - 450;
    }

    res.status(200).json({
      ok: true,
      symbol: "BTC",
      mode: "monitor",
      source,
      price: Math.round(price),
      signal,
      confidence,
      entry,
      stopLoss,
      takeProfit
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.toString()
    });
  }
};
