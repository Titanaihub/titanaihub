module.exports = async (req, res) => {
  try {
    const r = await fetch(
      "https://pro-api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_last_updated_at=true",
      {
        headers: {
          "x-cg-pro-api-key": process.env.COINGECKO_API_KEY,
          "accept": "application/json"
        }
      }
    );

    const data = await r.json();
    const price = Number(data?.ethereum?.usd);

    if (!price) throw new Error("No ETH price from CoinGecko");

    let signal = "WAIT";
    let confidence = 65;

    const mod = price % 90;
    if (mod > 55) {
      signal = "BUY";
      confidence = 78;
    } else if (mod < 30) {
      signal = "SELL";
      confidence = 78;
    }

    let stopLoss = null;
    let takeProfit = null;

    if (signal === "BUY") {
      stopLoss = +(price - 40).toFixed(2);
      takeProfit = +(price + 80).toFixed(2);
    }

    if (signal === "SELL") {
      stopLoss = +(price + 40).toFixed(2);
      takeProfit = +(price - 80).toFixed(2);
    }

    res.status(200).json({
      ok: true,
      symbol: "ETH",
      mode: "monitor",
      source: "coingecko",
      price: +price.toFixed(2),
      signal,
      confidence,
      entry: +price.toFixed(2),
      stopLoss,
      takeProfit,
      lastUpdatedAt: data?.ethereum?.last_updated_at || null
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "ETH",
      error: err.toString()
    });
  }
};
