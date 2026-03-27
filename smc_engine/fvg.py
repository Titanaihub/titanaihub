from typing import Dict, List

from .models import Candle, avg_range


def detect_fvg(candles: List[Candle]) -> Dict:
    if len(candles) < 5:
        return {"bullish": [], "bearish": []}

    a_range = max(avg_range(candles, 20), 1e-8)
    min_gap = a_range * 0.08
    bullish = []
    bearish = []

    for i in range(2, len(candles)):
        c0 = candles[i - 2]
        c2 = candles[i]

        # Bullish FVG: old high < current low
        if c0.high + min_gap < c2.low:
            bullish.append(
                {
                    "time": c2.time,
                    "top": c2.low,
                    "bottom": c0.high,
                    "size": c2.low - c0.high,
                }
            )

        # Bearish FVG: old low > current high
        if c0.low - min_gap > c2.high:
            bearish.append(
                {
                    "time": c2.time,
                    "top": c0.low,
                    "bottom": c2.high,
                    "size": c0.low - c2.high,
                }
            )

    return {"bullish": bullish[-60:], "bearish": bearish[-60:]}

