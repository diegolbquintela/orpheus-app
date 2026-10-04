import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { analyticsBeforeSend, stripUrl } from "./analytics.ts";

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

describe("Vercel Web Analytics (#48)", () => {
  it("<Analytics /> is rendered exactly once, in the root layout, with beforeSend", () => {
    const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    const mounts = files.flatMap((f) =>
      (readFileSync(f, "utf8").match(/<Analytics\b/g) ?? []).map(() => f),
    );
    assert.deepEqual(mounts, ["src/routes/__root.tsx"]);
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    assert.match(root, /import \{ Analytics \} from "@vercel\/analytics\/react";/);
    assert.match(root, /<Analytics beforeSend=\{analyticsBeforeSend\} \/>/);
  });

  it("no custom events: nothing in src imports or calls track()", () => {
    for (const f of walk("src").filter(
      (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("analytics.test.ts"),
    )) {
      const text = readFileSync(f, "utf8");
      assert.doesNotMatch(text, /\btrack\s*\(/, f);
      assert.doesNotMatch(text, /import\s*\{[^}]*\btrack\b[^}]*\}\s*from\s*"@vercel\/analytics/, f);
      assert.doesNotMatch(text, /@vercel\/analytics\/server/, f);
    }
  });

  it("no other trackers in the dependencies", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    assert.deepEqual(
      deps.filter((d) =>
        /analytics|gtag|segment|posthog|mixpanel|plausible|amplitude|hotjar|sentry|speed-insights/i.test(
          d,
        ),
      ),
      ["@vercel/analytics"],
    );
  });

  it("strips query strings and hashes; keeps the path", () => {
    assert.equal(
      stripUrl("https://x.vercel.app/calculator?ticker=KO&email=a@b.c#r"),
      "https://x.vercel.app/calculator",
    );
    assert.equal(
      stripUrl("https://x.vercel.app/dashboard/sign-in"),
      "https://x.vercel.app/dashboard/sign-in",
    );
    assert.equal(stripUrl("/calculator?x=1"), "/calculator");
  });

  it("beforeSend: page views with bare paths; custom events dropped", () => {
    assert.deepEqual(
      analyticsBeforeSend({ type: "pageview", url: "https://x.vercel.app/?ticker=KO" }),
      {
        type: "pageview",
        url: "https://x.vercel.app/",
      },
    );
    assert.equal(
      analyticsBeforeSend({ type: "event", url: "https://x.vercel.app/calculator" }),
      null,
    );
  });
});
