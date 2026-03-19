export default async function handler(req, res) {
  try {
    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://titanaihub.vercel.app";

    const r = await fetch(`${baseUrl}/api/btc`);
    const data = await r.json();

    if (!data || !data.ok || !data.price) {
      return res.status(200).json({
        ok: false,
        symbol: "BTC",
        mode: "monitor",
        error: "price unavailable"
      });
    }

    const price = Number(data.price);
    const source = data.source || "fallback";

    // logic แบบเบื้องต้นแต่ไม่สุ่ม
    // ใช้ระดับราคาปัจจุบันกำหนด bias ชั่วคราว
    let signal = "WAIT";
    let confidence = 60;

    const last2 = price % 200;
    const last3 = price % 500;

    if (last2 >= 120) {
      signal = "BUY";
      confidence = 78 + Math.floor((last2 - 120) / 10);
    } else if (last2 <= 60) {
      signal = "SELL";
      confidence = 78 + Math.floor((60 - last2) / 10);
    } else {
      signal = "WAIT";
      confidence = 65;
    }

    if (confidence > 89) confidence = 89;

    let entry = price;
    let stopLoss = null;
    let takeProfit = null;
    let riskReward = null;

    // ตั้ง SL/TP แบบ monitor only
    if (signal === "BUY") {
      stopLoss = Math.round(price - 250);
      takeProfit = Math.round(price + 450);
      riskReward = 1.8;
    } else if (signal === "SELL") {
      stopLoss = Math.round(price + 250);
      takeProfit = Math.round(price - 450);
      riskReward = 1.8;
    }

    return res.status(200).json({
      ok: true,
      symbol: "BTC",
      mode: "monitor",
      source,
      price: Math.round(price),
      signal,
      confidence,
      entry,
      stopLoss,
      takeProfit,
      riskReward
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      symbol: "BTC",
      mode: "monitor",
      error: e.toString()
    });
  }
}
