import { migrateExpenses } from "./expenses";
import { clearLegacy, prepareRecord, RecordStore } from "./record";
import { VIEW_KEY } from "./view";

/**
 * The page's store when signed in (#102; spec section 16.5): the account's record via `/api/personal-finance`,
 * read once; every change saves the whole record 400 ms later (and on leaving the page); last write wins. An empty
 * account imports this browser's old `localStorage` values once (then removes them); a v1 expenses value is
 * migrated (rates inverted). `onSaved(false)` after a failed save (the page shows `Not saved.`).
 */
export const API = "/api/personal-finance";
export const SIGN_IN = "/dashboard/sign-in?next=/personal-finance";
/** #90 Q-D11: a person's own section toggles (used when they may read but not write). */
export const VIEW_API = "/api/personal-finance/view";
const DEBOUNCE_MS = 400;

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export type StoreLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};
export type LoadStore = (opts: { onSaved: (ok: boolean) => void }) => Promise<StoreLike>;

export const loadAccountStore: LoadStore = async ({ onSaved }) => {
  const res = await fetch(API, { headers: { accept: "application/json" }, cache: "no-store" });
  if (res.status === 401) {
    window.location.href = SIGN_IN;
    return new Promise<StoreLike>(() => {});
  }
  if (!res.ok) throw new Error(`load ${res.status}`);
  const body = (await res.json()) as {
    data?: Record<string, string> | null;
    access?: { owner?: boolean; write?: boolean };
  };
  // #90: the record is the owner's. Only the owner imports this browser's old values; without a write grant only
  // the person's own section toggles are saved (`/api/personal-finance/view`, Q-D11).
  const owner = body.access?.owner !== false;
  const write = body.access?.write !== false;
  const browser = owner ? local() : null;
  const prepared = owner
    ? prepareRecord(body.data ?? null, browser)
    : { record: { ...(body.data ?? {}) }, imported: false, migrated: false };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const put = async (keepalive = false): Promise<boolean> => {
    try {
      const r = write
        ? await fetch(API, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data: store.snapshot() }),
            keepalive,
          })
        : await fetch(VIEW_API, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ view: store.getItem(VIEW_KEY) ?? "" }),
            keepalive,
          });
      // Read the (small) reply so the request completes (an unread body keeps it open, e.g. for "network idle").
      await r.text().catch(() => "");
      onSaved(r.ok);
      return r.ok;
    } catch {
      onSaved(false);
      return false;
    }
  };
  const store = new RecordStore(prepared.record, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void put();
    }, DEBOUNCE_MS);
  });
  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
    void put(true);
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  if (write && (prepared.imported || prepared.migrated)) {
    const ok = await put();
    if (ok && prepared.imported) clearLegacy(browser);
  }
  return store;
};

/** Tests / previews of the page without an account: this browser's localStorage (old behaviour). */
export const loadLocalStore: LoadStore = async () => {
  const store = local();
  if (!store) throw new Error("no storage");
  migrateExpenses(store);
  return store;
};
