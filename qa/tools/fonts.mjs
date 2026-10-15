/**
 * #135: wait for the site font before a font-dependent measurement.
 *
 * The site serves Schibsted Grotesk with `font-display: optional`. If the file takes longer than the browser's
 * short block period (about 100 ms) to arrive, Chromium renders that page in the fallback (Liberation Sans) for
 * the rest of its life and never swaps, even after `document.fonts.ready` resolves. That was the source of the
 * intermittent site-shell phone360 ST1-01, style-regression ST6-06 / ST6-07 and ST0-05 pixel-diff failures.
 *
 * `fontsSettled(page)`:
 *   1. awaits `document.fonts.ready` and two animation frames (the layout settle);
 *   2. asks CDP which platform font each probe actually renders in (the bar's links and the first h1);
 *   3. if any probe still renders in a fallback while the face has loaded, reloads the page once the file is
 *      cached (what a second visit sees) and repeats, up to `attempts` loads in total.
 * It never changes what a check asserts: the caller measures afterwards with its own unchanged assertion, and
 * if the font still isn't applied after the last attempt, that check fails as before.
 * The cold-load checks (ST6-06 strict CLS, the home and calculator "fonts at DOMContentLoaded" checks) don't use
 * it; they measure the first load on purpose.
 */
export const FONT_FAMILY = "Schibsted Grotesk";
const PROBES = ['nav[aria-label="Site"] a[href="/calculator"]', "h1"];

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

async function rendered(page) {
  const c = await page.context().newCDPSession(page);
  try {
    await c.send("DOM.enable");
    await c.send("CSS.enable");
    const { root } = await c.send("DOM.getDocument", { depth: 0 });
    const out = {};
    for (const sel of PROBES) {
      const { nodeId } = await c.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
      if (!nodeId) continue;
      out[sel] = (await c.send("CSS.getPlatformFontsForNode", { nodeId })).fonts.map((f) => f.familyName);
    }
    return out;
  } finally {
    await c.detach().catch(() => {});
  }
}

export async function fontsSettled(page, { attempts = 3, waitUntil = "networkidle", after = 300 } = {}) {
  let fonts = {};
  let response = null; // the last reload's response, so a caller's HTTP status / header checks read the page it measures
  for (let i = 1; i <= attempts; i++) {
    await settle(page);
    fonts = await rendered(page);
    const ok = Object.values(fonts).every((f) => f.length > 0 && f.every((n) => n === FONT_FAMILY));
    if (ok) return { ok: true, loads: i, fonts, response };
    if (i === attempts) break;
    response = await page.reload({ waitUntil });
    if (after) await page.waitForTimeout(after);
  }
  return { ok: false, loads: attempts, fonts, response };
}
