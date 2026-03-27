from typing import Dict, List

from .models import Candle, clamp01


def _last_price(candles: List[Candle]) -> float:
    return float(candles[-1].close) if candles else 0.0


def route_signal(candles: List[Candle], smc_pack: Dict) -> Dict:
    if len(candles) < 20:
        return {"action": "WAIT", "confidence": 0.2, "reason": "insufficient_candles"}

    p = _last_price(candles)
    liq = smc_pack.get("liquidity", {})
    bos = smc_pack.get("bos_choch", {})
    fvg = smc_pack.get("fvg", {})
    ob = smc_pack.get("order_blocks", {})

    bias = bos.get("bias", "neutral")
    last_event = (bos.get("events") or [{}])[-1].get("event", "")
    last_sweep = (liq.get("sweeps") or [{}])[-1].get("side", "")
    near_bull_ob = False
    near_bear_ob = False

    for x in (ob.get("bullish") or [])[-6:]:
        if x["bottom"] <= p <= x["top"] * 1.001:
            near_bull_ob = True
    for x in (ob.get("bearish") or [])[-6:]:
        if x["bottom"] * 0.999 <= p <= x["top"]:
            near_bear_ob = True

    bull_score = 0.0
    bear_score = 0.0

    if bias == "bull":
        bull_score += 0.3
    if bias == "bear":
        bear_score += 0.3

    if "bull" in last_event:
        bull_score += 0.25
    if "bear" in last_event:
        bear_score += 0.25

    if last_sweep == "sell_side_liquidity":
        bull_score += 0.2
    if last_sweep == "buy_side_liquidity":
        bear_score += 0.2

    if near_bull_ob:
        bull_score += 0.15
    if near_bear_ob:
        bear_score += 0.15

    if (fvg.get("bullish") or []):
        bull_score += 0.1
    if (fvg.get("bearish") or []):
        bear_score += 0.1

    if bull_score >= bear_score + 0.2:
        return {
            "action": "OPEN_BUY",
            "confidence": clamp01(0.45 + bull_score - bear_score),
            "reason": "smc_bull_confluence",
        }
    if bear_score >= bull_score + 0.2:
        return {
            "action": "OPEN_SELL",
            "confidence": clamp01(0.45 + bear_score - bull_score),
            "reason": "smc_bear_confluence",
        }
    return {"action": "WAIT", "confidence": 0.35, "reason": "smc_no_clear_edge"}

