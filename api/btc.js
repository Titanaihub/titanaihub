export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await r.json();

    res.status(200).json({
      ok: true,
      price: Number(data.bitcoin.usd),
      volume: 0
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
}
