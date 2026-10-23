import { migrateExpenses } from "./expenses";
import { clearLegacy, prepareRecord, RecordStore } from "./record";

/**
 * The page's store when signed in (#102; spec section 16.5): the account's record via `/api/personal-finance`,
 * read once; #112: written only on `Save` (and a section toggle), the whole record; #242 (spec §73): each PUT sends
 * the version it was based on and a 409 (another tab saved first) is `onSaved(false, "stale")`. An empty
 * account imports this browser's old `localStorage` values once (then removes them); a v1 expenses value is
 * migrated (rates inverted). `onSaved(false)` after a failed save (the page shows `Not saved.`).
 */
export const API = "/api/personal-finance";
export const SIGN_IN = "/dashboard/sign-in?next=/personal-finance";
/** #90 Q-D11: a person's own section toggles (used when they may read but not write). */
export const VIEW_API = "/api/personal-finance/view";

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
  /** #112: send what was written (the account store); absent = written already (localStorage). */
  save?(): Promise<boolean>;
};
/** #242: why a save failed: "stale" = another tab saved first (409); the page then shows `STALE_MESSAGE`. */
export type SaveFailure = "stale";
export type LoadStore = (opts: { onSaved: (ok: boolean, why?: SaveFailure) => void }) => Promise<StoreLike>;

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
    version?: string | null;
  };
  // #242: the version this tab's next PUT is based on (null = no record yet); each 200 moves it on.
  let version: string | null = typeof body.version === "string" ? body.version : null;
  // #90: the record is the owner's. Only the owner imports this browser's old values. #197: without a write grant
  // nothing is saved (the view route needs write); toggles already stored for the person still apply (Q-D11).
  const owner = body.access?.owner !== false;
  const write = body.access?.write !== false;
  const browser = owner ? local() : null;
  const prepared = owner
    ? prepareRecord(body.data ?? null, browser)
    : { record: { ...(body.data ?? {}) }, imported: false, migrated: false };

  const put = async (keepalive = false): Promise<boolean> => {
    // #197 (spec 54, Q-VW1): without a write grant nothing is sent (the view route answers 403 to Read); a section
    // toggle still works on the page for this visit and the page shows no `Not saved.`.
    if (!write) {
      onSaved(true);
      return true;
    }
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: store.snapshot(), baseVersion: version }),
        keepalive,
      });
      // Read the (small) reply so the request completes (an unread body keeps it open, e.g. for "network idle").
      const text = await r.text().catch(() => "");
      if (r.ok) {
        try {
          const v = (JSON.parse(text) as { version?: unknown }).version;
          if (typeof v === "string") version = v;
        } catch {
          /* keep the old base: the next save gets a 409, not a silent overwrite */
        }
      }
      if (r.status === 409) onSaved(false, "stale");
      else onSaved(r.ok);
      return r.ok;
    } catch {
      onSaved(false);
      return false;
    }
  };
  // #112: no autosave. The store holds the saved record; the page writes into it and calls `save()` on `Save`
  // (and after a section toggle, which saves at once).
  // One PUT at a time, in order (two quick section toggles must not land out of order).
  let queue: Promise<unknown> = Promise.resolve();
  const save = (): Promise<boolean> => {
    const next = queue.then(() => put());
    queue = next.catch(() => {});
    return next;
  };
  const store = Object.assign(new RecordStore(prepared.record), { save });
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
