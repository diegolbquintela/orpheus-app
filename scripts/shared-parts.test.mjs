// #92 Shared page parts (site-style-spec section 16; SP-01..SP-05): one source for fonts, the label, the button, the chrome.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const p = join(dir, n);
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
  });
const css = walk("src").filter((p) => p.endsWith(".css"));
const tsx = walk("src").filter((p) => /\.tsx?$/.test(p) && !/\.test\./.test(p));

describe("#92 shared page parts", () => {
  it("SP-01 every @font-face is in src/styles/fonts.css, imported once by src/styles.css", () => {
    const withFaces = css.filter((p) => /@font-face/.test(read(p)));
    assert.deepEqual(withFaces, ["src/styles/fonts.css"]);
    assert.equal(read("src/styles.css").match(/@import "\.\/styles\/fonts\.css";/g)?.length, 1);
  });

  it("SP-02 FONT_PRELOAD is the root preload, a face's src in fonts.css and a file in public/", () => {
    const path = /FONT_PRELOAD = "([^"]+)"/.exec(read("src/lib/site/fonts.ts"))[1];
    assert.match(read("src/routes/__root.tsx"), /href: FONT_PRELOAD/);
    assert.ok(!read("src/routes/__root.tsx").includes(path), "the path is not repeated in the root");
    assert.ok(read("src/styles/fonts.css").includes(`url("${path}")`));
    assert.ok(existsSync(join(root, "public", path)));
  });

  it("SP-03 / SP-04 the label and the chalk button are declared once (parts.css)", () => {
    const parts = read("src/styles/parts.css");
    for (const sel of [".ow-label", ".calc-label", ".signin-label", ".pf-label", ".ow-button", ".calc-button", ".signin-button"])
      assert.ok(parts.includes(sel), sel);
    assert.equal(read("src/styles.css").match(/@import "\.\/styles\/parts\.css";/g)?.length, 1);
    for (const p of css.filter((x) => x !== "src/styles/parts.css")) {
      const text = read(p);
      for (const sel of ["calc-label", "signin-label", "pf-label", "calc-button", "signin-button", "ow-label", "ow-button"])
        assert.ok(!new RegExp(`\\.${sel}(:disabled)?\\s*[,{]`).test(text), `${p} redeclares .${sel}`);
    }
  });

  it("SP-05 the bar and footer are rendered only by the root route", () => {
    const users = tsx.filter((p) => /<SiteMenu\b|<SiteFooter\b/.test(read(p)));
    assert.deepEqual(users, ["src/routes/__root.tsx"]);
  });
});
