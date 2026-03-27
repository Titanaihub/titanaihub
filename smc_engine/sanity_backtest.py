import argparse
import csv
import json
from pathlib import Path
from typing import Dict, List

from .smc_engine import analyze_smc


def load_rows(csv_path: Path) -> List[Dict]:
    rows: List[Dict] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        rd = csv.DictReader(f)
        for r in rd:
            rows.append(
                {
                    "time": r.get("time") or r.get("timestamp"),
                    "open": r.get("open"),
                    "high": r.get("high"),
                    "low": r.get("low"),
                    "close": r.get("close"),
                    "volume": r.get("volume", 0),
                }
            )
    return rows


def run_window_scan(rows: List[Dict], window: int = 220, step: int = 10) -> Dict:
    actions = {"OPEN_BUY": 0, "OPEN_SELL": 0, "WAIT": 0}
    conf_sum = 0.0
    conf_n = 0
    last_decision = None
    for i in range(window, len(rows), step):
        chunk = rows[:i]
        out = analyze_smc(chunk[-window:])
        if not out.get("ok"):
            continue
        d = out.get("decision", {})
        act = str(d.get("action", "WAIT")).upper()
        if act not in actions:
            act = "WAIT"
        actions[act] += 1
        conf = float(d.get("confidence", 0.0))
        conf_sum += conf
        conf_n += 1
        last_decision = d
    return {
        "samples": conf_n,
        "action_counts": actions,
        "avg_confidence": (conf_sum / conf_n) if conf_n else 0.0,
        "last_decision": last_decision,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Quick sanity scan for SMC engine using CSV candles.")
    parser.add_argument("csv_path", help="Path to CSV with columns: time,open,high,low,close[,volume]")
    parser.add_argument("--window", type=int, default=220)
    parser.add_argument("--step", type=int, default=10)
    args = parser.parse_args()

    rows = load_rows(Path(args.csv_path))
    result = run_window_scan(rows, window=max(40, args.window), step=max(1, args.step))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

