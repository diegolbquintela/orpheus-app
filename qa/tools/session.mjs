/**
 * Shared signed-in loop for the dashboard QA tools (QA N4, #58): one browser context per viewport (phone
 * 400 × 860, desktop 1440 × 900; plus wide 1024 × 800 with QA_VIEWPORTS, #59), signed in with QA_EMAIL / QA_PASSWORD (passed in from env by the caller;
 * never logged), and ALWAYS signed out again: the sign-out runs in a `finally`, so an early return, a thrown
 * error or a timeout inside a viewport's checks still ends the session. A thrown error is recorded as a FAIL
 * ("ran to the end") and the next viewport still runs.
 */
export const VIEWPORTS = [
  ["phone", { width: 400, height: 860 }, true],
  ["desktop", { width: 1440, height: 900 }, false],
];

/**
 * Every named viewport (#59): `wide` is the 1024 px breakpoint (the first width with the metrics sheet on the
 * right). `QA_VIEWPORTS=phone,wide,desktop` (env, comma-separated names) picks the set; the default is
 * `VIEWPORTS` (phone + desktop). `qa/tools/dashboard-redesign.mjs` runs every tool at all three.
 */
export const ALL_VIEWPORTS = [VIEWPORTS[0], ["wide", { width: 1024, height: 800 }, false], VIEWPORTS[1]];

export function viewportsFrom(value) {
  if (!value || !String(value).trim()) return VIEWPORTS;
  const names = String(value).split(",").map((n) => n.trim()).filter(Boolean);
  const unknown = names.filter((n) => !ALL_VIEWPORTS.some(([vp]) => vp === n));
  if (unknown.length) throw new Error(`QA_VIEWPORTS: unknown viewport(s) ${unknown.join(", ")} (phone, wide, desktop)`);
  return ALL_VIEWPORTS.filter(([vp]) => names.includes(vp));
}

export async function eachViewport({ browser, baseUrl, email, password, check, viewports = viewportsFrom(process.env.QA_VIEWPORTS) }, fn) {
  for (const [vp, viewport, mobile] of viewports) {
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    try {
      const login = await page.request.post(`${baseUrl}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: baseUrl } });
      check(`[${vp}] sign-in`, login.ok(), login.status());
      if (login.ok()) await fn({ vp, viewport, mobile, page, ctx });
    } catch (e) {
      check(`[${vp}] ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      try {
        const out = await page.request.post(`${baseUrl}/api/auth/sign-out`, { data: {}, headers: { origin: baseUrl } });
        check(`[${vp}] sign-out`, out.ok(), out.status());
      } catch (e) {
        check(`[${vp}] sign-out`, false, String(e?.message ?? e).split("\n")[0]);
      }
      await ctx.close().catch(() => {});
    }
  }
}
