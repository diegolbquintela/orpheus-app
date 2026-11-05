// #320: one viewport matrix for every QA tool. The default is phone 390 × 844 + desktop 1440 × 900; 360, 400, 768
// and 1024 are opt-in only: `--viewports=phone360,phone400,tablet768,wide` (names or widths, comma separated; the
// default two are added only when named). Entries are [name, { width, height }, mobile].
export const NAMED = {
  phone: [{ width: 390, height: 844 }, true],
  desktop: [{ width: 1440, height: 900 }, false],
  phone360: [{ width: 360, height: 780 }, true],
  phone400: [{ width: 400, height: 860 }, true],
  tablet768: [{ width: 768, height: 1024 }, false],
  wide: [{ width: 1024, height: 800 }, false],
};
export const DEFAULT_NAMES = ["phone", "desktop"];
const ORDER = ["phone360", "phone", "phone400", "tablet768", "wide", "desktop"];
const entry = (n) => [n, { ...NAMED[n][0] }, NAMED[n][1]];
export const DEFAULT_VIEWPORTS = DEFAULT_NAMES.map(entry);
export const DEFAULT_WIDTHS = DEFAULT_VIEWPORTS.map(([, v]) => v.width);

/** Names (or widths) → entries in width order. Empty / undefined → the default. Throws on an unknown one. */
export function pickViewports(value) {
  if (value === undefined || value === null || !String(value).trim()) return DEFAULT_VIEWPORTS.map(([n, v, m]) => [n, { ...v }, m]);
  const asked = String(value).split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => (/^\d+$/.test(s) ? Object.keys(NAMED).find((n) => NAMED[n][0].width === Number(s)) ?? s : s));
  const unknown = asked.filter((n) => !NAMED[n]);
  if (unknown.length) throw new Error(`unknown viewport(s) ${unknown.join(", ")} (${ORDER.join(", ")} or their widths)`);
  return ORDER.filter((n) => asked.includes(n)).map(entry);
}

/** The --viewports CLI flag (both `--viewports a,b` and `--viewports=a,b`), else the default. */
export function viewportsFromArgv(argv = process.argv.slice(2)) {
  let v;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--viewports") v = argv[i + 1];
    else if (argv[i].startsWith("--viewports=")) v = argv[i].slice(12);
  }
  return pickViewports(v);
}
