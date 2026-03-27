from typing import Any, Dict, List, Tuple

from .models import clamp01


def _load_deps() -> Tuple[bool, Any, Any, str]:
    try:
        import pandas as pd  # type: ignore
        from smartmoneyconcepts import smc  # type: ignore
        return True, pd, smc, ""
    except Exception as exc:  # pragma: no cover
        return False, None, None, str(exc)


def _normalize_df(pd: Any, rows: List[Dict[str, Any]]) -> Any:
    df = pd.DataFrame(rows or [])
    if df.empty:
        return df
    df.columns = [str(c).lower() for c in df.columns]
    for col in ("open", "high", "low", "close"):
        if col not in df.columns:
            df[col] = None
    if "volume" not in df.columns:
        df["volume"] = 0.0
    df = df.dropna(subset=["open", "high", "low", "close"])
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    return df


def _records(df: Any, n: int = 60) -> List[Dict[str, Any]]:
    if df is None or getattr(df, "empty", True):
        return []
    return df.tail(n).to_dict("records")


def _decision_from_indicators(df: Any, bos: Any, liq: Any) -> Dict[str, Any]:
    if df is None or getattr(df, "empty", True):
        return {"action": "WAIT", "confidence": 0.2, "reason": "empty_dataframe"}
    close = float(df["close"].iloc[-1])

    bias = "neutral"
    try:
        tail = bos.tail(3) if bos is not None else None
        if tail is not None and not tail.empty:
            if "BOS" in tail.columns and float(tail["BOS"].fillna(0).iloc[-1]) > 0:
                bias = "bull"
            elif "BOS" in tail.columns and float(tail["BOS"].fillna(0).iloc[-1]) < 0:
                bias = "bear"
            elif "CHOCH" in tail.columns and float(tail["CHOCH"].fillna(0).iloc[-1]) > 0:
                bias = "bull"
            elif "CHOCH" in tail.columns and float(tail["CHOCH"].fillna(0).iloc[-1]) < 0:
                bias = "bear"
    except Exception:
        bias = "neutral"

    swept_buy_side = False
    swept_sell_side = False
    try:
        if liq is not None and not liq.empty:
            last = liq.tail(1)
            if "Swept" in last.columns:
                swept = float(last["Swept"].fillna(0).iloc[-1])
                if swept > close:
                    swept_buy_side = True
                elif swept < close:
                    swept_sell_side = True
    except Exception:
        pass

    bull = 0.0
    bear = 0.0
    if bias == "bull":
        bull += 0.4
    elif bias == "bear":
        bear += 0.4
    if swept_sell_side:
        bull += 0.2
    if swept_buy_side:
        bear += 0.2

    if bull >= bear + 0.2:
        return {"action": "OPEN_BUY", "confidence": clamp01(0.45 + bull - bear), "reason": "smc_lib_bull_confluence"}
    if bear >= bull + 0.2:
        return {"action": "OPEN_SELL", "confidence": clamp01(0.45 + bear - bull), "reason": "smc_lib_bear_confluence"}
    return {"action": "WAIT", "confidence": 0.35, "reason": "smc_lib_no_clear_edge"}


def analyze_with_smartmoneyconcepts(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    ok, pd, smc, err = _load_deps()
    if not ok:
        return {"ok": False, "message": f"smartmoneyconcepts unavailable: {err}"}

    df = _normalize_df(pd, rows)
    if df.empty or len(df) < 20:
        return {"ok": False, "message": "need at least 20 valid candles"}

    try:
        swings = smc.swing_highs_lows(df, swing_length=20)
        bos = smc.bos_choch(df, swings, close_break=True)
        fvg = smc.fvg(df, join_consecutive=False)
        ob = smc.ob(df, swings)
        liq = smc.liquidity(df, swings, range_percent=0.01)
        prev_hl = smc.previous_high_low(df, time_frame="1D")
    except Exception as exc:  # pragma: no cover
        return {"ok": False, "message": f"smartmoneyconcepts run failed: {exc}"}

    decision = _decision_from_indicators(df, bos, liq)
    return {
        "ok": True,
        "source": "smartmoneyconcepts",
        "decision": decision,
        "smc": {
            "swings": _records(swings),
            "bos_choch": _records(bos),
            "fvg": _records(fvg),
            "order_blocks": _records(ob),
            "liquidity": _records(liq),
            "previous_high_low": _records(prev_hl),
        },
        "counts": {
            "candles": int(len(df)),
            "swings": len(_records(swings, 1000)),
            "bos_choch": len(_records(bos, 1000)),
            "fvg": len(_records(fvg, 1000)),
            "order_blocks": len(_records(ob, 1000)),
            "liquidity": len(_records(liq, 1000)),
        },
    }

