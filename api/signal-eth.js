module.exports = async (req, res) => {
  try {
    let price = null;
    let source = "fallback";

    // 🔹 ดึงราคาจาก eth.js (ภายในระบบ)
    try {
      const r = await fetch(`${req.headers.host.includes("localhost") ? "http" : "https"}://${req.headers.host}/api/eth`);
      const data = await r.json();

      if (data && data.price) {
        price = Number(data.price);
        source = data.source || "internal";
      }
    } catch (e) {}

    // 🔐 fallback
    if (!price) {
      price = 3000;
      source = "fallback";
    }

    // 🧠 Signal Logic
    let signal = "WAIT";
    let confidence = 65;

    const mod = price % 150;

    if (mod > 90) {
      signal = "BUY";
      confidence = 78;
    } else if (mod < 45) {
      signal = "SELL";
      confidence = 78;
    }

    let entry = price;
    let stopLoss = null;
    let takeProfit = null;

    if (signal === "BUY") {
      stopLoss = price - 40;
      takeProfit = price + 80;
    }

    if (signal === "SELL") {
      stopLoss = price + 40;
      takeProfit = price - 80;
    }

    res.status(200).json({
      ok: true,
      symbol: "ETH",
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
