# SMC Python Engine (Starter)

This folder is a practical SMC engine for MT4 execution.
It now supports:
- primary mode: `smartmoneyconcepts` adapter (GitHub library as core),
- fallback mode: local lightweight engine when library is unavailable.

## Files

- `smc_engine.py` - orchestrates full analysis and returns one decision.
- `liquidity_engine.py` - equal highs/lows and sweep detection.
- `bos_choch.py` - basic swing structure and BOS/CHoCH detection.
- `order_block.py` - displacement-based bullish/bearish OB zones.
- `fvg.py` - 3-candle fair value gap detection.
- `signal_router.py` - combines confluence into `OPEN_BUY`, `OPEN_SELL`, or `WAIT`.
- `models.py` - candle model + normalization utilities.
- `smc_adapter.py` - wrapper for `smartmoneyconcepts` package output mapping.
- `sanity_backtest.py` - quick CSV scan script for sanity checks.
- `bridge_cli.py` - stdin/stdout bridge for Node.js (`python -m smc_engine.bridge_cli`).

## Install (recommended)

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install --upgrade pip
pip install smartmoneyconcepts pandas numpy
```

## Quick usage

```python
from smc_engine.smc_engine import analyze_smc

rows = [
    {"time": "2026-03-01 10:00", "open": 2900.1, "high": 2902.0, "low": 2898.4, "close": 2901.2, "volume": 123},
    # ... at least 20 candles
]

result = analyze_smc(rows)
print(result["decision"])
```

If `smartmoneyconcepts` is not installed, `analyze_smc()` falls back automatically.

## Quick sanity backtest

Run as module from project root:

```bash
python -m smc_engine.sanity_backtest path/to/xauusd_m5.csv --window 220 --step 10
```

## Output shape

`analyze_smc()` returns:
- `decision`: `{ action, confidence, reason }`
- `smc`: analysis blocks (`liquidity`, `bos_choch`, `fvg`, `order_blocks`)
- `counts`: quick summary counters

This architecture is intentionally modular so you can:
- swap SMC sources,
- keep stable output format for MT4 bridge,
- test and harden each layer independently.

## Node.js bridge env (MT4 service)

When called from `services/mt4-gold-service.js`, these env vars are used:
- `MT4_PYTHON_SMC_ENABLED=true`
- `MT4_PYTHON_SMC_PRIORITY=true`
- `MT4_PYTHON_BIN=python`
- `MT4_PYTHON_SMC_TIMEOUT_MS=4500`

