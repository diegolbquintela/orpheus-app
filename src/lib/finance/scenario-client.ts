// #215 (personal-finance-spec 55, AC PFSC): the Scenario page's only network calls. One GET on open; on a named
// `Save scenario` / `Delete` only (#223 `changeSaved`; never on a lever move): a fresh GET, then one PUT of that fresh
// record with the scenario value replaced, through the existing `/api/personal-finance` route (write grant, #197).
// #208 SS7 (spec 61.5): the unused PJ7 `saveScenario` is removed; `changeSaved` is the only scenario.v1 writer.
import { API } from "./account-client";
import type { PfRecord } from "./record";
import { readScenario, type Scenario, withScenario } from "./scenario";

export type Access = { owner: boolean; write: boolean };
export type ScenarioLoad =
  { ok: true; record: PfRecord | null; access: Access } | { ok: false; status: number };
export type SaveResult = { ok: true; record: PfRecord | null } | { ok: false; status: number };

export const loadForScenario = async (): Promise<ScenarioLoad> => {
  try {
    const res = await fetch(API, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status };
    const body = (await res.json()) as {
      data?: PfRecord | null;
      access?: { owner?: boolean; write?: boolean };
    };
    return {
      ok: true,
      record: body.data ?? null,
      access: { owner: body.access?.owner === true, write: body.access?.write === true },
    };
  } catch {
    return { ok: false, status: 0 };
  }
};

export type ChangeResult = SaveResult | { ok: false; status: 0; error: string };

/**
 * #223 (spec 60, AC PFSS): `Save scenario` / `Delete` for named scenarios, the PJ7 path extended: a fresh GET, then one
 * PUT of that fresh record with ONLY the scenario value replaced (every other value byte-for-byte as fetched), through
 * the same route (write grant needed; Read gets 403 from the server in any case).
 */
export const changeSaved = async (
  change: (current: Scenario | null) => Scenario | { error: string },
): Promise<ChangeResult> => {
  const fresh = await loadForScenario();
  if (!fresh.ok) return fresh;
  if (!fresh.access.write) return { ok: false, status: 403 };
  const next = change(readScenario(fresh.record));
  if ("error" in next) return { ok: false, status: 0, error: next.error };
  try {
    const res = await fetch(API, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: withScenario(fresh.record, next) }),
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      return { ok: false, status: res.status };
    }
    const body = (await res.json()) as { data?: PfRecord | null };
    return { ok: true, record: body.data ?? null };
  } catch {
    return { ok: false, status: 0 };
  }
};
