"""Fetch raw price data for a DCA hand-check: Yahoo (query1/query2), the app's /api/chart, and stooq.

Usage:
  python3 qa/tools/fetch.py --base-url URL [--out DIR] [--tickers PLTR,TQQQ]
  QA_BASE_URL=http://127.0.0.1:4173 python3 qa/tools/fetch.py

#328: there is no production default. With no --base-url and no QA_BASE_URL the script exits 2.
A non-local host needs --release. The CDN estimate counts app /api/chart calls only (one per ticker),
not Yahoo or Stooq. --budget=N (default 10000), --allow-over-budget, --budget-only (print and exit 0).

--out (or QA_OUT_DIR) defaults to a temp dir outside the repo, $TMPDIR/orpheus-qa/fetch-<timestamp>
(same rule as the .mjs tools in config.mjs). Keep raw dumps out of git.
Python 3 standard library only.
"""
import argparse, datetime as dt, os, sys, tempfile
from urllib.parse import urlparse
import urllib.request

RELEASE_WARNING = "WARNING --release: remote QA run (every load is a CDN request)"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}
DEFAULT_BUDGET = 10000


def host_of(url):
    try:
        host = urlparse(url).hostname
    except Exception:
        return None
    return host.lower() if host else None


def is_remote(url):
    if not url:
        return False
    host = host_of(url)
    if host is None:
        return True
    return host not in LOCAL_HOSTS


def parse_budget(raw):
    # Same rule as the JS gate: a positive integer with no leading zero (^ [1-9]\d* $).
    if raw is None:
        return DEFAULT_BUDGET, True
    if isinstance(raw, str) and raw.isdecimal() and raw[0] != "0":
        return int(raw), True
    return None, False


def decide(base, calls, release, allow, budget_raw, budget_only):
    """Return (code, lines). code 0 continues; 0 with budget_only stops after the lines; 2 refuses. No network."""
    budget, ok = parse_budget(budget_raw)
    remote = is_remote(base) if base else False
    if not base:
        return 2, [
            "CDN estimate: 0 (no --base-url)",
            "REFUSED fetch.py: pass --base-url (a local server, or a remote host with --release). No default production URL.",
        ]
    if not remote:
        line = "CDN estimate: 0 (local)"
    else:
        label = str(budget) if ok else "invalid"
        line = f"CDN estimate: {calls} ({calls} calls × 1) budget {label}"
    if not ok:
        return 2, [line, "REFUSED fetch.py: --budget must be a positive integer"]
    if budget_only:
        return 0, [line]
    if remote and not release:
        host = host_of(base) or "invalid URL"
        return 2, [line, f"REFUSED fetch.py: remote host {host} needs --release"]
    if remote and calls > budget and not allow:
        return 2, [line, f"REFUSED fetch.py: CDN estimate {calls} is over the budget {budget}. Pass --allow-over-budget to run it."]
    lines = [line]
    if remote:
        lines.append(RELEASE_WARNING)
    return 0, lines


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default=None)
    ap.add_argument("--release", action="store_true")
    ap.add_argument("--allow-over-budget", action="store_true")
    ap.add_argument("--budget-only", action="store_true")
    ap.add_argument("--budget", default=None)
    _now = dt.datetime.now(dt.timezone.utc)
    stamp = _now.strftime("%Y-%m-%dT%H-%M-%S-") + f"{_now.microsecond // 1000:03d}Z"  # config.mjs format
    default_out = os.path.join(tempfile.gettempdir(), "orpheus-qa", f"fetch-{stamp}")
    ap.add_argument("--out", default=os.environ.get("QA_OUT_DIR") or default_out)
    ap.add_argument("--tickers", default="PLTR,TQQQ")
    ap.add_argument("--start", default="2020-10-02", help="app /api/chart start date")
    ap.add_argument("--end", default="2026-10-02", help="app /api/chart end date")
    args = ap.parse_args(argv)
    base = (args.base_url or os.environ.get("QA_BASE_URL") or "").rstrip("/")
    tickers = [x.strip().upper() for x in args.tickers.split(",") if x.strip()]
    code, lines = decide(base, len(tickers), args.release, args.allow_over_budget, args.budget, args.budget_only)
    for line in lines:
        print(line)
    if code != 0 or args.budget_only:
        return code
    os.makedirs(args.out, exist_ok=True)
    out = lambda name: os.path.join(args.out, name)
    print("base", base, "out", os.path.abspath(args.out))

    def get(url):
        r = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        return urllib.request.urlopen(r, timeout=30).read()

    p1 = int(dt.datetime(2020, 9, 18, tzinfo=dt.timezone.utc).timestamp())
    p2 = int(dt.datetime(2026, 10, 6, tzinfo=dt.timezone.utc).timestamp())
    for t in tickers:
        for host in ["query1", "query2"]:
            try:
                b = get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{t}?period1={p1}&period2={p2}&interval=1d&events=div%2Csplit")
                open(out(f"yahoo_{t}_{host}.json"), "wb").write(b)
                print(t, host, "ok", len(b))
            except Exception as e:
                print(t, host, "ERR", e)
        try:
            b = get(f"{base}/api/chart?ticker={t}&start={args.start}&end={args.end}")
            open(out(f"app_{t}.json"), "wb").write(b)
            print(t, "app ok", len(b))
        except Exception as e:
            print(t, "app ERR", e)
        try:
            b = get(f"https://stooq.com/q/d/l/?s={t.lower()}.us&i=d")
            open(out(f"stooq_{t}.csv"), "wb").write(b)
            print(t, "stooq", len(b), b[:120])
        except Exception as e:
            print(t, "stooq ERR", e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
