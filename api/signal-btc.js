module.exports = async (req, res) => {
  try {
    const r = await fetch(
      "https://pro-api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true",
      {
        headers: {
          "x-cg-pro-api-key": process.env.COINGECKO_API_KEY,
          "accept": "application/json"
        }
      }
    );

    const data = await r.json();
    const price = Number(data?.bitcoin?.usd);

    if (!price) throw new Error("No BTC price from CoinGecko");

    let signal = "WAIT";
    let confidence = 65;

    const mod = price % 300;
    if (mod > 180) {
      signal = "BUY";
      confidence = 80;
    } else if (mod < 120) {
      signal = "SELL";
      confidence = 80;
    }

    let stopLoss = null;
    let takeProfit = null;

    if (signal === "BUY") {
      stopLoss = +(price - 250).toFixed(2);
      takeProfit = +(price + 450).toFixed(2);
    }

    if (signal === "SELL") {
      stopLoss = +(price + 250).toFixed(2);
      takeProfit = +(price - 450).toFixed(2);
    }

    res.status(200).json({
      ok: true,
      symbol: "BTC",
      mode: "monitor",
      source: "coingecko",
      price: +price.toFixed(2),
      signal,
      confidence,
      entry: +price.toFixed(2),
      stopLoss,
      takeProfit,
      lastUpdatedAt: data?.bitcoin?.last_updated_at || null
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      symbol: "BTC",
      error: err.toString()
    });
  }
};
