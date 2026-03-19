module.exports = async (req, res) => {
  try {
    const r = await fetch(
      "https://pro-api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd&include_last_updated_at=true",
      {
        headers: {
          "x-cg-pro-api-key": process.env.COINGECKO_API_KEY,
          "accept": "application/json"
        }
      }
    );

    const data = await r.json();
    const price = Number(data?.binancecoin?.usd);

    if (!price) throw new Error("No BNB price from CoinGecko");

    let signal = "WAIT";
    let confidence = 65;

    const mod = price % 30;
    if (mod > 18) {
      signal = "BUY";
      confidence = 75;
    } else if (mod < 10) {
      signal = "SELL";
      confidence = 75;
    }

    let stopLoss = null;
    let takeProfit = null;

    if (signal === "BUY") {
      stopLoss = +(price - 10).toFixed(2);
      takeProfit = +(price + 20).toFixed(2);
    }

    if (signal === "SELL") {
      stopLoss = +(price + 10).toFixed(2);
      takeProfit = +(price - 20).toFixed(2);
    }

    res.status(200).json({
      ok: true,
      symbol: "BNB",
      mode: "monitor",
      source: "coingecko",
      price: +price.toFixed(2),
      signal,
      confidence,
      entry: +price.toFixed(2),
      stopLoss,
      takeProfit,
      lastUpdatedAt: data?.binancecoin?.last_updated_at || null
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BNB",
      error: err.toString()
    });
  }
};
