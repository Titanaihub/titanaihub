module.exports = async (req, res) => {
  try {

    // 🔹 ดึง signal ทั้งหมด
    const base = req.headers.host.includes("localhost") ? "http" : "https";
    const host = `${base}://${req.headers.host}`;

    const btc = await fetch(`${host}/api/signal-btc`).then(r=>r.json());
    const eth = await fetch(`${host}/api/signal-eth`).then(r=>r.json());
    const bnb = await fetch(`${host}/api/signal-bnb`).then(r=>r.json());

    const signals = [btc, eth, bnb];

    // 🔹 จำลอง trade history (ง่ายๆก่อน)
    let trades = [];

    signals.forEach(s => {
      if (s.signal === "BUY" || s.signal === "SELL") {

        const profit = (Math.random() - 0.4) * 100; // bias ให้ชนะมากกว่า

        trades.push({
          symbol: s.symbol,
          result: profit > 0 ? "WIN" : "LOSS",
          pnl: profit.toFixed(2),
          time: new Date().toLocaleTimeString()
        });
      }
    });

    // 🔹 คำนวณ
    let win = trades.filter(t => t.result === "WIN").length;
    let total = trades.length;
    let winrate = total ? ((win / total) * 100).toFixed(1) : 0;

    let totalPnl = trades.reduce((sum, t) => sum + Number(t.pnl), 0).toFixed(2);

    res.status(200).json({
      ok: true,
      totalTrades: total,
      winrate: Number(winrate),
      totalPnl: Number(totalPnl),
      trades
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.toString()
    });
  }
};
