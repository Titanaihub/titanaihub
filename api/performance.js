let trades = [];

export default async function handler(req, res) {
  try {

    if (Math.random() > 0.5) {
      trades.unshift({
        time: new Date().toLocaleTimeString(),
        result: Math.random() > 0.5 ? "+Profit" : "-Loss"
      });

      if (trades.length > 10) trades.pop();
    }

    res.status(200).json({
      ok: true,
      trades
    });

  } catch (e) {
    res.status(500).json({ ok:false });
  }
}
