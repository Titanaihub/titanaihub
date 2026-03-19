module.exports = async (req, res) => {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const base = `${proto}://${host}`;

    const getJson = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Failed: ${url}`);
      return await r.json();
    };

    const [btc, eth, bnb] = await Promise.all([
      getJson(`${base}/api/signal-btc`),
      getJson(`${base}/api/signal-eth`),
      getJson(`${base}/api/signal-bnb`)
    ]);

    const assets = [btc, eth, bnb].filter(x => x && x.ok);
    if (!assets.length) throw new Error("No signal data");

    const buyCount = assets.filter(x => x.signal === "BUY").length;
    const sellCount = assets.filter(x => x.signal === "SELL").length;
    const waitCount = assets.filter(x => x.signal === "WAIT").length;

    let status = "Neutral";
    let exchangeFlow = "Balanced";
    let inflowUsd = 0;
    let outflowUsd = 0;
    let sentimentScore = 50;

    if (buyCount >= 2) {
      status = "Bullish";
      exchangeFlow = "Outflow Dominant";
      outflowUsd = 18.4;
      inflowUsd = 9.7;
      sentimentScore = 72;
    } else if (sellCount >= 2) {
      status = "Bearish";
      exchangeFlow = "Inflow Dominant";
      inflowUsd = 19.8;
      outflowUsd = 8.9;
      sentimentScore = 29;
    } else {
      status = "Neutral";
      exchangeFlow = "Balanced";
      inflowUsd = 11.6;
      outflowUsd = 11.2;
      sentimentScore = 51;
    }

    const strongest = assets
      .slice()
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];

    let lastMove = "--";
    if (strongest.signal === "BUY") {
      lastMove = `${strongest.symbol} monitoring shows accumulation bias`;
    } else if (strongest.signal === "SELL") {
      lastMove = `${strongest.symbol} monitoring shows exchange inflow bias`;
    } else {
      lastMove = `${strongest.symbol} monitoring shows neutral large-wallet activity`;
    }

    const updatedAt = Math.max(
      btc.lastUpdatedAt || 0,
      eth.lastUpdatedAt || 0,
      bnb.lastUpdatedAt || 0
    );

    res.status(200).json({
      ok: true,
      source: "monitor-model",
      status,
      exchangeFlow,
      inflowUsdM: inflowUsd,
      outflowUsdM: outflowUsd,
      sentimentScore,
      assets: {
        buy: buyCount,
        sell: sellCount,
        wait: waitCount
      },
      lastMove,
      updatedAt
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.toString(),
      source: "monitor-model"
    });
  }
};
