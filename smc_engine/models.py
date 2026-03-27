from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class Candle:
    time: Any
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


def normalize_candles(rows: List[Dict[str, Any]]) -> List[Candle]:
    out: List[Candle] = []
    for r in rows or []:
        try:
            out.append(
                Candle(
                    time=r.get("time") or r.get("ts") or r.get("timestamp"),
                    open=float(r["open"]),
                    high=float(r["high"]),
                    low=float(r["low"]),
                    close=float(r["close"]),
                    volume=float(r.get("volume", 0.0)),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def avg_range(candles: List[Candle], n: int = 20) -> float:
    tail = candles[-n:] if len(candles) >= n else candles
    if not tail:
        return 0.0
    return sum(max(0.0, c.high - c.low) for c in tail) / float(len(tail))


def asdict_clean(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in payload.items() if v is not None}

