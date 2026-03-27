from typing import Dict, List

from .models import Candle, asdict_clean


def _near(a: float, b: float, tolerance: float) -> bool:
    return abs(a - b) <= tolerance


def detect_liquidity(candles: List[Candle], tolerance_mult: float = 0.12) -> Dict:
    if len(candles) < 20:
        return {"equal_highs": [], "equal_lows": [], "sweeps": []}

    ranges = [max(0.0, c.high - c.low) for c in candles[-60:]]
    avg_r = (sum(ranges) / len(ranges)) if ranges else 0.0
    tol = max(avg_r * tolerance_mult, 1e-8)

    eq_highs = []
    eq_lows = []
    sweeps = []

    for i in range(2, len(candles) - 1):
        a = candles[i - 1]
        b = candles[i]
        c = candles[i + 1]
        if _near(a.high, b.high, tol):
            eq_highs.append(asdict_clean({"time": b.time, "price": b.high, "left": a.time, "right": b.time}))
        if _near(a.low, b.low, tol):
            eq_lows.append(asdict_clean({"time": b.time, "price": b.low, "left": a.time, "right": b.time}))

        if c.high > b.high + tol and c.close < b.high:
            sweeps.append({"time": c.time, "side": "buy_side_liquidity", "swept_price": b.high})
        if c.low < b.low - tol and c.close > b.low:
            sweeps.append({"time": c.time, "side": "sell_side_liquidity", "swept_price": b.low})

    return {
        "equal_highs": eq_highs[-40:],
        "equal_lows": eq_lows[-40:],
        "sweeps": sweeps[-40:],
    }

