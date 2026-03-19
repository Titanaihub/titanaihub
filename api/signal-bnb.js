module.exports = async (req, res) => {
  try {
    let price = null;
    let source = "fallback";

    // 🔹 ดึงราคาจาก bnb.js
    try {
      const r = await fetch(`${req.headers.host.includes("localhost") ? "http" : "https"}://${req.headers.host}/api/bnb`);
      const data = await r.json();

      if (data && data.price) {
        price = Number(data.price);
        source = data.source || "internal";
      }
    } catch (e) {}

    // 🔐 fallback
    if (!price) {
      price = 300;
      source = "fallback";
    }

    // 🧠 Signal Logic
    let signal = "WAIT";
    let confidence = 65;

    const mod = price % 50;

    if (mod > 30) {
      signal = "BUY";
      confidence = 75;
    } else if (mod < 15) {
      signal = "SELL";
      confidence = 75;
    }

    let entry = price;
    let stopLoss = null;
    let takeProfit = null;

    if (signal === "BUY") {
      stopLoss = price - 10;
      takeProfit = price + 20;
    }

    if (signal === "SELL") {
      stopLoss = price + 10;
      takeProfit = price - 20;
    }

    res.status(200).json({
      ok: true,
      symbol: "BNB",
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
