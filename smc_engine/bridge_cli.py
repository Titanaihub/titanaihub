import json
import sys
from typing import Any, Dict, List

from .smc_engine import analyze_smc


def _read_stdin_json() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def main() -> None:
    payload = _read_stdin_json()
    rows: List[Dict[str, Any]] = payload.get("candles") or payload.get("rows") or []
    out = analyze_smc(rows)
    sys.stdout.write(json.dumps(out, ensure_ascii=True))


if __name__ == "__main__":
    main()

