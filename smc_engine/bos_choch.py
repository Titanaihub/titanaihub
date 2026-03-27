from typing import Dict, List

from .models import Candle


def _pivot_high(c: List[Candle], i: int, w: int = 2) -> bool:
    if i - w < 0 or i + w >= len(c):
        return False
    x = c[i].high
    return all(x >= c[j].high for j in range(i - w, i + w + 1) if j != i)


def _pivot_low(c: List[Candle], i: int, w: int = 2) -> bool:
    if i - w < 0 or i + w >= len(c):
        return False
    x = c[i].low
    return all(x <= c[j].low for j in range(i - w, i + w + 1) if j != i)


def detect_bos_choch(candles: List[Candle]) -> Dict:
    if len(candles) < 25:
        return {"swings": [], "events": [], "bias": "neutral"}

    swings = []
    for i in range(2, len(candles) - 2):
        if _pivot_high(candles, i):
            swings.append({"time": candles[i].time, "type": "high", "price": candles[i].high, "i": i})
        elif _pivot_low(candles, i):
            swings.append({"time": candles[i].time, "type": "low", "price": candles[i].low, "i": i})

    events = []
    trend = "neutral"
    last_high = None
    last_low = None
    for s in swings:
        if s["type"] == "high":
            last_high = s
        else:
            last_low = s

    for i in range(max(0, len(candles) - 60), len(candles)):
        c = candles[i]
        if last_high and c.close > last_high["price"]:
            e = "bos_bull" if trend in ("bull", "neutral") else "choch_bull"
            events.append({"time": c.time, "event": e, "level": last_high["price"]})
            trend = "bull"
            last_high = None
        if last_low and c.close < last_low["price"]:
            e = "bos_bear" if trend in ("bear", "neutral") else "choch_bear"
            events.append({"time": c.time, "event": e, "level": last_low["price"]})
            trend = "bear"
            last_low = None

    return {"swings": swings[-80:], "events": events[-40:], "bias": trend}

