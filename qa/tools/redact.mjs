// #278 CA (QA 2026-11-02): QA tool output never shows an email address. Any email-shaped string in console output or a
// JSON artifact becomes `<email>`. Credential values are never passed to a log in the first place; this is the backstop.
export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
export const maskEmails = (s) => String(s).replace(EMAIL_RE, "<email>");
/** A deep copy with every string (keys too) masked. */
export function maskDeep(v) {
  if (typeof v === "string") return maskEmails(v);
  if (Array.isArray(v)) return v.map(maskDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [maskEmails(k), maskDeep(x)]));
  return v;
}
/** JSON.stringify, then mask (for artifacts). */
export const maskedJson = (v, space = 2) => maskEmails(JSON.stringify(maskDeep(v), null, space));
/** Mask console.log / info / warn / error for this process (idempotent). */
export function installConsoleMask(c = console) {
  if (c.__emailMasked) return;
  for (const m of ["log", "info", "warn", "error"]) {
    const o = c[m].bind(c);
    c[m] = (...a) => o(...a.map((x) => (typeof x === "string" ? maskEmails(x) : maskEmails(typeof x === "object" ? JSON.stringify(x) : String(x)))));
  }
  c.__emailMasked = true;
}
