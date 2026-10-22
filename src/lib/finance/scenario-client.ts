// #215 (personal-finance-spec 55, AC PFSC): the Scenario page's only network calls. One GET on open; on `Save scenario`
// only (never on a lever move): a fresh GET, then one PUT of that fresh record with the scenario value replaced
// (Q-SC5), through the existing `/api/personal-finance` route, which needs a write grant (#197 pattern).
import { API } from "./account-client";
import type { PfRecord } from "./record";
import { type Scenario, withScenario } from "./scenario";

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

/** `Save scenario`: refused without write on the page already; the server answers 403 to Read in any case. */
export const saveScenario = async (scenario: Scenario): Promise<SaveResult> => {
  const fresh = await loadForScenario();
  if (!fresh.ok) return fresh;
  if (!fresh.access.write) return { ok: false, status: 403 };
  try {
    const res = await fetch(API, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: withScenario(fresh.record, scenario) }),
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
