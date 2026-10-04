/**
 * Builds qa/fixtures.json for the canonical AC pack (DCA-01..DCA-06).
 *
 *   npm run fixtures:build            # reuse committed qa/snapshots/*.json (offline)
 *   npm run fixtures:build -- --refresh  # re-pull Yahoo through loadChart() and rewrite snapshots
 *
 * Every expected number comes from running the app's engine (runDesk) on data
 * loaded through the app's own fetch path (loadChart in yahoo.server.ts).
 * Nothing in qa/fixtures.json is typed by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type CaseSpec,
  type RecordedRequest,
  type Snapshot,
  evaluateCase,
  replayFetch,
  snapshotPath,
  withFetch,
} from "../src/lib/dca/fixtures-support.ts";

export const AC_RULES: Record<string, string> = {
  "DCA-01": "Dividends reinvested",
  "DCA-02": "DCA = extra cash on each date (contributions only)",
  "DCA-03": "Lump sum deploys starting capital on day one",
  "DCA-04": "Multi-ticker weighted basket",
  "DCA-05": "US/EU/CA listings only",
  "DCA-06": "No buy/sell advice",
};

export const CASES: CaseSpec[] = [
  {
    id: "us-single-dividend-ko",
    title: "US dividend payer, single name, ~2 years, monthly",
    acs: ["DCA-01", "DCA-02", "DCA-03"],
    kind: "run",
    inputs: {
      tickers: ["KO"],
      weights: [100],
      start: "2023-01-03",
      end: "2024-12-31",
      capital: 10000,
      contribution: 500,
      frequency: "monthly",
    },
  },
  {
    id: "us-basket-jnj-pg-wmt",
    title: "Weighted 3-name USD basket (includes WMT 3:1 split, Feb 2024), weekly",
    acs: ["DCA-01", "DCA-02", "DCA-03", "DCA-04"],
    kind: "run",
    inputs: {
      tickers: ["JNJ", "PG", "WMT"],
      weights: [50, 30, 20],
      start: "2023-01-03",
      end: "2024-12-31",
      capital: 20000,
      contribution: 250,
      frequency: "weekly",
    },
  },
  {
    id: "ca-single-ry-to",
    title: "CA listing (Toronto, CAD), single name, monthly",
    acs: ["DCA-01", "DCA-02", "DCA-03", "DCA-05"],
    kind: "run",
    inputs: {
      tickers: ["RY.TO"],
      weights: [100],
      start: "2023-01-03",
      end: "2024-12-31",
      capital: 10000,
      contribution: 500,
      frequency: "monthly",
    },
  },
  {
    id: "refused-lse-vod-l",
    title: "Non US/EU/CA listing (London Stock Exchange) is refused",
    acs: ["DCA-05"],
    kind: "refused",
    inputs: {
      tickers: ["VOD.L"],
      weights: [100],
      start: "2023-01-03",
      end: "2024-12-31",
      capital: 10000,
      contribution: 500,
      frequency: "monthly",
    },
  },
];

/** DCA-06: files that produce user-facing text, scanned for buy/sell/hold output. */
export const COPY_FILES = [
  "src/components/desk.tsx",
  "src/routes/calculator.tsx",
  "src/routes/index.tsx",
  "src/routes/__root.tsx",
  "src/components/home.tsx",
  "src/components/site-menu.tsx",
  "src/components/site-footer.tsx",
  "src/lib/site/site.ts",
  "src/lib/dca/results.ts",
  "src/lib/dca/venues.ts",
];
export const ADVICE_PATTERN =
  "\\b(buy|sell|hold|recommend|recommended|recommends|strong buy|outperform|underweight|overweight)\\b";

export function scanCopy(files: string[]) {
  const re = new RegExp(ADVICE_PATTERN, "gi");
  const matches: { file: string; line: number; text: string }[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      if (re.test(text)) matches.push({ file, line: index + 1, text: text.trim() });
      re.lastIndex = 0;
    });
  }
  return { adviceMatches: matches };
}

function recorder(sink: RecordedRequest[]): typeof fetch {
  const real = globalThis.fetch;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const response = await real(input, init);
    const text = await response.text();
    sink.push({ url, status: response.status, body: JSON.parse(text) });
    return new Response(text, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function snapshotsFor(spec: CaseSpec, refresh: boolean): Promise<Snapshot[]> {
  const out: Snapshot[] = [];
  for (const ticker of spec.inputs.tickers) {
    const path = snapshotPath(ticker, spec.inputs.start, spec.inputs.end);
    if (!refresh && existsSync(path)) {
      out.push(JSON.parse(readFileSync(path, "utf8")) as Snapshot);
      continue;
    }
    const requests: RecordedRequest[] = [];
    const { loadChart } = await import("../src/lib/dca/yahoo.server.ts");
    await withFetch(recorder(requests), () =>
      loadChart({ ticker, start: spec.inputs.start, end: spec.inputs.end }).catch(() => null),
    );
    const snap: Snapshot = {
      ticker,
      start: spec.inputs.start,
      end: spec.inputs.end,
      source: "Yahoo v8 chart API, recorded through loadChart() in src/lib/dca/yahoo.server.ts",
      fetchedAt: new Date().toISOString(),
      requests,
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(snap, null, 1)}\n`);
    out.push(snap);
  }
  return out;
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const fixtures: unknown[] = [];
  for (const spec of CASES) {
    const snaps = await snapshotsFor(spec, refresh);
    const expected = await withFetch(replayFetch(snaps), () => evaluateCase(spec));
    fixtures.push({
      id: spec.id,
      title: spec.title,
      acs: spec.acs.map((ac) => ({ ac, rule: AC_RULES[ac] })),
      kind: spec.kind,
      inputs: spec.inputs,
      data: {
        snapshots: spec.inputs.tickers.map((t) =>
          snapshotPath(t, spec.inputs.start, spec.inputs.end),
        ),
        queries: snaps.flatMap((snap) => snap.requests.map((req) => req.url)),
        fetchedAt: snaps.map((snap) => snap.fetchedAt),
      },
      expected,
    });
  }
  fixtures.push({
    id: "no-advice-copy",
    title: "No buy/sell/hold output in user-facing copy",
    acs: [{ ac: "DCA-06", rule: AC_RULES["DCA-06"] }],
    kind: "content",
    inputs: { files: COPY_FILES, pattern: ADVICE_PATTERN },
    expected: scanCopy(COPY_FILES),
  });
  writeFileSync("qa/fixtures.json", `${JSON.stringify(fixtures, null, 2)}\n`);
  console.log(`qa/fixtures.json: ${fixtures.length} cases`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
