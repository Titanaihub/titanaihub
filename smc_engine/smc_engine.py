from typing import Any, Dict, List

from .bos_choch import detect_bos_choch
from .fvg import detect_fvg
from .liquidity_engine import detect_liquidity
from .models import normalize_candles
from .order_block import detect_order_blocks
from .signal_router import route_signal
from .smc_adapter import analyze_with_smartmoneyconcepts


def analyze_smc(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    lib_result = analyze_with_smartmoneyconcepts(rows)
    if lib_result.get("ok"):
        return lib_result

    candles = normalize_candles(rows)
    if len(candles) < 20:
        return {
            "ok": False,
            "message": "need at least 20 valid candles",
            "counts": {"candles": len(candles)},
        }

    liquidity = detect_liquidity(candles)
    bos_choch = detect_bos_choch(candles)
    fvg = detect_fvg(candles)
    order_blocks = detect_order_blocks(candles)

    pack = {
        "liquidity": liquidity,
        "bos_choch": bos_choch,
        "fvg": fvg,
        "order_blocks": order_blocks,
    }
    decision = route_signal(candles, pack)

    return {
        "ok": True,
        "source": "fallback_local_engine",
        "fallback_reason": lib_result.get("message"),
        "decision": decision,
        "smc": pack,
        "counts": {
            "candles": len(candles),
            "equal_highs": len(liquidity.get("equal_highs", [])),
            "equal_lows": len(liquidity.get("equal_lows", [])),
            "sweeps": len(liquidity.get("sweeps", [])),
            "swings": len(bos_choch.get("swings", [])),
            "events": len(bos_choch.get("events", [])),
            "fvg_bull": len(fvg.get("bullish", [])),
            "fvg_bear": len(fvg.get("bearish", [])),
            "ob_bull": len(order_blocks.get("bullish", [])),
            "ob_bear": len(order_blocks.get("bearish", [])),
        },
    }

