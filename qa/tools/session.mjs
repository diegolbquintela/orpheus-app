/**
 * Shared signed-in loop for the dashboard QA tools (QA N4, #58): one browser context per viewport (phone
 * 390 × 844 since #320, desktop 1440 × 900; plus opt-in widths with QA_VIEWPORTS / --viewports, #59), signed in with QA_EMAIL / QA_PASSWORD (passed in from env by the caller;
 * never logged), and ALWAYS signed out again: the sign-out runs in a `finally`, so an early return, a thrown
 * error or a timeout inside a viewport's checks still ends the session. A thrown error is recorded as a FAIL
 * ("ran to the end") and the next viewport still runs.
 */
import { signedOutProd } from "./prod-guard.mjs";
import { DEFAULT_VIEWPORTS, NAMED, pickViewports, viewportsFromArgv } from "./lib/viewports.mjs";

// #320: the matrix lives in lib/viewports.mjs; the default is phone 390 + desktop 1440. QA_VIEWPORTS (names,
// comma separated) or --viewports picks opt-in widths: phone360, phone400, tablet768, wide (1024).
export const VIEWPORTS = DEFAULT_VIEWPORTS;

/**
 * Every named viewport (#59, #320): `wide` is the 1024 px breakpoint (the first width with the metrics sheet on the
 * right), opt-in only. `QA_VIEWPORTS=phone,wide,desktop` (env, comma-separated names) picks the set; the default is
 * `VIEWPORTS` (phone + desktop).
 */
export const ALL_VIEWPORTS = Object.keys(NAMED).map((n) => [n, NAMED[n][0], NAMED[n][1]]).sort((a, b) => a[1].width - b[1].width);

export function viewportsFrom(value) {
  if (!value || !String(value).trim()) return VIEWPORTS;
  try {
    return pickViewports(value);
  } catch (e) {
    throw new Error(`QA_VIEWPORTS: ${e.message}`);
  }
}

// #308: `headers` (optional) are extra request headers for the whole context, sign-in included (the Vercel bypass; never logged).
export async function eachViewport({ browser, baseUrl, email, password, check, viewports = process.env.QA_VIEWPORTS ? viewportsFrom(process.env.QA_VIEWPORTS) : viewportsFromArgv(), headers }, fn) {
  // #157 F7: never sign in on production (qa/tools/prod-guard.mjs signed-out prod mode).
  if (signedOutProd()) {
    console.log("INFO signed-in steps SKIPPED (signed-out prod mode)");
    return;
  }
  for (const [vp, viewport, mobile] of viewports) {
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, ...(headers ? { extraHTTPHeaders: headers } : {}) });
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
