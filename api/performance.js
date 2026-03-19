module.exports = async (req, res) => {
  try {
    const fetchCoin = async (id) => {
      const r = await fetch(
        `https://pro-api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_last_updated_at=true`,
        {
          headers: {
            "x-cg-pro-api-key": process.env.COINGECKO_API_KEY,
            "accept": "application/json"
          }
        }
      );

      const data = await r.json();
      return data[id];
    };

    const [btcData, ethData, bnbData] = await Promise.all([
      fetchCoin("bitcoin"),
      fetchCoin("ethereum"),
      fetchCoin("binancecoin")
    ]);

    const btc = Number(btcData?.usd);
    const eth = Number(ethData?.usd);
    const bnb = Number(bnbData?.usd);

    if (!btc || !eth || !bnb) {
      throw new Error("Missing market prices");
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });

    const buildTrade = (symbol, currentPrice, side, entryOffsetPct, sizeUsd) => {
      let entry;
      let pnl;

      if (side === "BUY") {
        entry = currentPrice * (1 - entryOffsetPct);
        pnl = ((currentPrice - entry) / entry) * sizeUsd;
      } else {
        entry = currentPrice * (1 + entryOffsetPct);
        pnl = ((entry - currentPrice) / entry) * sizeUsd;
      }

      pnl = Number(pnl.toFixed(2));

      return {
        symbol,
        side,
        entry: Number(entry.toFixed(2)),
        exit: Number(currentPrice.toFixed(2)),
        pnl,
        result: pnl >= 0 ? "WIN" : "LOSS",
        time: timeStr
      };
    };

    // จำลอง trade log แบบสมจริงขึ้นจากราคาปัจจุบัน
    const trades = [
      buildTrade("BTC", btc, "BUY", 0.0045, 1200),
      buildTrade("ETH", eth, "SELL", 0.008, 900),
      buildTrade("BNB", bnb, "BUY", 0.006, 700),
      buildTrade("BTC", btc, "SELL", 0.003, 1000),
      buildTrade("ETH", eth, "BUY", 0.005, 850)
    ];

    const totalTrades = trades.length;
    const wins = trades.filter(t => t.result === "WIN").length;
    const winrate = Number(((wins / totalTrades) * 100).toFixed(1));
    const totalPnl = Number(
      trades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2)
    );

    res.status(200).json({
      ok: true,
      totalTrades,
      winrate,
      totalPnl,
      trades
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.toString(),
      totalTrades: 0,
      winrate: 0,
      totalPnl: 0,
      trades: []
    });
  }
};
