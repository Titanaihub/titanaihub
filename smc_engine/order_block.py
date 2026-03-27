from typing import Dict, List

from .models import Candle, avg_range


def detect_order_blocks(candles: List[Candle]) -> Dict:
    if len(candles) < 12:
        return {"bullish": [], "bearish": []}

    ar = max(avg_range(candles, 20), 1e-8)
    impulse_mult = 1.2
    bullish = []
    bearish = []

    for i in range(1, len(candles)):
        prev = candles[i - 1]
        cur = candles[i]
        body = abs(cur.close - cur.open)
        displacement = max(0.0, cur.high - cur.low)
        strong = displacement >= ar * impulse_mult or body >= ar * impulse_mult

        if not strong:
            continue

        # Up displacement -> last bearish candle as bullish OB
        if cur.close > cur.open and prev.close < prev.open:
            bullish.append(
                {
                    "time": prev.time,
                    "top": max(prev.open, prev.close),
                    "bottom": min(prev.open, prev.close),
                    "source": "displacement_up",
                }
            )

        # Down displacement -> last bullish candle as bearish OB
        if cur.close < cur.open and prev.close > prev.open:
            bearish.append(
                {
                    "time": prev.time,
                    "top": max(prev.open, prev.close),
                    "bottom": min(prev.open, prev.close),
                    "source": "displacement_down",
                }
            )

    return {"bullish": bullish[-40:], "bearish": bearish[-40:]}

