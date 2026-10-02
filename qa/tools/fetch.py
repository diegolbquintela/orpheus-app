"""Fetch raw price data for a DCA hand-check: Yahoo (query1/query2), the app's /api/chart, and stooq.

Usage:
  python3 qa/tools/fetch.py [--base-url URL] [--out DIR] [--tickers PLTR,TQQQ]
  QA_BASE_URL=https://<preview>.vercel.app python3 qa/tools/fetch.py

--base-url (or QA_BASE_URL) defaults to https://orpheus-app-beta.vercel.app.
--out (or QA_OUT_DIR) defaults to the current directory. Keep raw dumps out of git.
Python 3 standard library only.
"""
import argparse, datetime as dt, os, urllib.request

DEFAULT_BASE_URL = "https://orpheus-app-beta.vercel.app"

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--base-url", default=os.environ.get("QA_BASE_URL", DEFAULT_BASE_URL))
ap.add_argument("--out", default=os.environ.get("QA_OUT_DIR", "."))
ap.add_argument("--tickers", default="PLTR,TQQQ")
ap.add_argument("--start", default="2020-10-02", help="app /api/chart start date")
ap.add_argument("--end", default="2026-10-02", help="app /api/chart end date")
args = ap.parse_args()
base = args.base_url.rstrip("/")
os.makedirs(args.out, exist_ok=True)
out = lambda name: os.path.join(args.out, name)
print("base", base, "out", os.path.abspath(args.out))

def get(url):
    r=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"application/json"})
    return urllib.request.urlopen(r,timeout=30).read()
p1=int(dt.datetime(2020,9,18,tzinfo=dt.timezone.utc).timestamp()); p2=int(dt.datetime(2026,10,6,tzinfo=dt.timezone.utc).timestamp())
for t in [x.strip().upper() for x in args.tickers.split(",") if x.strip()]:
  for host in ["query1","query2"]:
    try:
      b=get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{t}?period1={p1}&period2={p2}&interval=1d&events=div%2Csplit")
      open(out(f"yahoo_{t}_{host}.json"),"wb").write(b); print(t,host,"ok",len(b))
    except Exception as e: print(t,host,"ERR",e)
  try:
    b=get(f"{base}/api/chart?ticker={t}&start={args.start}&end={args.end}")
    open(out(f"app_{t}.json"),"wb").write(b); print(t,"app ok",len(b))
  except Exception as e: print(t,"app ERR",e)
  try:
    b=get(f"https://stooq.com/q/d/l/?s={t.lower()}.us&i=d"); open(out(f"stooq_{t}.csv"),"wb").write(b); print(t,"stooq",len(b),b[:120])
  except Exception as e: print(t,"stooq ERR",e)
