/**
 * Shared signed-in loop for the dashboard QA tools (QA N4, #58): one browser context per viewport (phone
 * 400 × 860, desktop 1440 × 900), signed in with QA_EMAIL / QA_PASSWORD (passed in from env by the caller;
 * never logged), and ALWAYS signed out again: the sign-out runs in a `finally`, so an early return, a thrown
 * error or a timeout inside a viewport's checks still ends the session. A thrown error is recorded as a FAIL
 * ("ran to the end") and the next viewport still runs.
 */
export const VIEWPORTS = [
  ["phone", { width: 400, height: 860 }, true],
  ["desktop", { width: 1440, height: 900 }, false],
];

export async function eachViewport({ browser, baseUrl, email, password, check }, fn) {
  for (const [vp, viewport, mobile] of VIEWPORTS) {
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
