import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  COPY,
  type Grants,
  LEVEL_LABEL,
  LEVELS,
  type Level,
  MIN_PASSWORD,
  roleLines,
  SURFACE_LABEL,
  SURFACES,
  type Surface,
} from "@/lib/access/access";
import type { AccountPageData } from "@/lib/access/gate";

/**
 * `/account` (#90; design section 2.2, ROLE-03..08, ROLE-17..19): the dark shell's account page. `01` You (name,
 * email, roles, Sign out), `02` Password, `03` Email (the owner: blocked, Q-D12), `04` Who has access (current state
 * only), and for the owner `05` Grant access (people, levels, Add person with a temporary password shown once, Reset
 * password, Remove). With a temporary password only `01` and `02` show (Q-D5). Every write calls `/api/account/*`;
 * the page then reloads its data from the server. No helper paragraphs.
 */
export function AccountPage({ data }: { data: AccountPageData }) {
  return (
    <main
      className="signin account mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 pt-10 pb-20 sm:px-8 lg:gap-16 lg:pt-14 lg:pb-24"
      data-testid="account-page"
    >
      <header>
        <h1 className="signin-title">{COPY.account}</h1>
        {data.mustChange ? (
          <p className="signin-note mt-4" data-testid="account-must-change">
            {COPY.mustChange}
          </p>
        ) : null}
      </header>
      <Section numeral="01" title={COPY.you} id="account-you">
        <dl className="account-facts" data-testid="account-you">
          <dt className="signin-label">{COPY.name}</dt>
          <dd data-testid="account-name">{data.name || "—"}</dd>
          <dt className="signin-label">{COPY.email}</dt>
          <dd data-testid="account-email">{data.email}</dd>
          <dt className="signin-label">Roles</dt>
          <dd>
            {data.roles.map((r) => (
              <span key={r} className="block" data-testid="account-role">
                {r}
              </span>
            ))}
          </dd>
        </dl>
        <SignOut />
      </Section>
      <Section numeral="02" title={COPY.password} id="account-password">
        <PasswordForm mustChange={data.mustChange} />
      </Section>
      {data.mustChange ? null : (
        <>
          <Section numeral="03" title={COPY.email} id="account-email-title">
            {data.owner ? (
              <p className="signin-note" data-testid="account-owner-email">
                {COPY.ownerEmailBlocked}
              </p>
            ) : (
              <EmailForm />
            )}
          </Section>
          <Section numeral="04" title={COPY.who} id="account-who">
            <WhoHasAccess people={data.people} />
          </Section>
          {data.owner ? (
            <Section numeral="05" title={COPY.grant} id="account-grant">
              <GrantAccess people={data.people.filter((p) => !p.owner)} />
            </Section>
          ) : null}
        </>
      )}
    </main>
  );
}

function Section({
  numeral,
  title,
  id,
  children,
}: {
  numeral: string;
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6" aria-labelledby={id} data-testid={id}>
      <div>
        <p className="pf-label">{numeral}</p>
        <h2 id={id} className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

async function send(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

const errorOf = (r: { data: Record<string, unknown> }) =>
  typeof r.data.error === "string" ? r.data.error : COPY.failed;

function SignOut() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        disabled={busy}
        className="signin-switch"
        data-testid="account-sign-out"
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const { signOut } = await import("@/lib/auth/client");
            await signOut("/dashboard/sign-in");
          } catch {
            setFailed(true);
            setBusy(false);
          }
        }}
      >
        {COPY.signOut}
      </button>
      {failed ? <span className="signin-error">{COPY.failed}</span> : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="signin-label">{label}</span>
      {children}
    </label>
  );
}

function Status({ error, ok, testId }: { error: string | null; ok: boolean; testId: string }) {
  if (error)
    return (
      <p className="signin-error" role="alert" data-testid={`${testId}-error`}>
        {error}
      </p>
    );
  return (
    <p className="signin-note" role="status" data-testid={`${testId}-status`}>
      {ok ? COPY.saved : ""}
    </p>
  );
}

function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setOk(false);
    if (!current) return setError(COPY.enterCurrent);
    if (next.length < MIN_PASSWORD) return setError(COPY.tooShort);
    if (next !== confirm) return setError(COPY.noMatch);
    setBusy(true);
    const r = await send("/api/account/password", "POST", { currentPassword: current, newPassword: next });
    setBusy(false);
    if (!r.ok) return setError(errorOf(r));
    setError(null);
    setCurrent("");
    setNext("");
    setConfirm("");
    setOk(true);
    // After a temporary password the whole page (and every page the grants allow) opens.
    if (mustChange) window.location.assign("/account");
  }
  return (
    <form className="account-form" onSubmit={submit} noValidate data-testid="account-password-form">
      <Field label={COPY.currentPassword}>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="signin-field"
          data-testid="account-current-password"
        />
      </Field>
      <Field label={COPY.newPassword}>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="signin-field"
          data-testid="account-new-password"
        />
      </Field>
      <Field label={COPY.confirmPassword}>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="signin-field"
          data-testid="account-confirm-password"
        />
      </Field>
      <Status error={error} ok={ok} testId="account-password" />
      <button type="submit" disabled={busy} className="signin-button self-start" data-testid="account-password-save">
        {COPY.save}
      </button>
    </form>
  );
}

function EmailForm() {
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter({ warn: false });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setOk(false);
    if (!email.trim()) return setError(COPY.enterEmail);
    if (!current) return setError(COPY.enterCurrent);
    setBusy(true);
    const r = await send("/api/account/email", "POST", { newEmail: email, currentPassword: current });
    setBusy(false);
    if (!r.ok) return setError(errorOf(r));
    setError(null);
    setEmail("");
    setCurrent("");
    setOk(true);
    await router?.invalidate();
  }
  return (
    <form className="account-form" onSubmit={submit} noValidate data-testid="account-email-form">
      <Field label={COPY.newEmail}>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="signin-field"
          data-testid="account-new-email"
        />
      </Field>
      <Field label={COPY.currentPassword}>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="signin-field"
          data-testid="account-email-password"
        />
      </Field>
      <Status error={error} ok={ok} testId="account-email" />
      <button type="submit" disabled={busy} className="signin-button self-start" data-testid="account-email-save">
        {COPY.save}
      </button>
    </form>
  );
}

function personRoles(p: AccountPageData["people"][number]): string[] {
  return roleLines(p.owner, p.grants);
}

function WhoHasAccess({ people }: { people: AccountPageData["people"] }) {
  return (
    <ul className="account-people" data-testid="account-who-list">
      {people.map((p) => (
        <li key={p.id} className="account-person" data-testid="account-who-row">
          <span className="text-chalk">{p.name || p.email}</span>
          <span className="account-dim">{p.email}</span>
          {personRoles(p).map((r) => (
            <span key={r} className="account-dim" data-testid="account-who-role">
              {r}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

function LevelSelect({
  surface,
  value,
  onChange,
  id,
}: {
  surface: Surface;
  value: Level;
  onChange: (l: Level) => void;
  id: string;
}) {
  return (
    <Field label={SURFACE_LABEL[surface]}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Level)}
        className="signin-field account-select"
        data-testid={`${id}-${surface}`}
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {LEVEL_LABEL[l]}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Temporary({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const text = `${COPY.email}: ${email}\n${COPY.temporary}: ${password}\n${COPY.signInAt}: ${origin}/dashboard/sign-in`;
  return (
    <div className="account-temp" data-testid="account-temporary">
      <span className="signin-label">{COPY.temporary}</span>
      <code className="account-code" data-testid="account-temporary-password">
        {password}
      </code>
      <span className="account-dim">{email}</span>
      <span className="account-dim">
        {COPY.signInAt} {origin}/dashboard/sign-in
      </span>
      <button
        type="button"
        className="signin-switch self-start"
        data-testid="account-copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? COPY.copied : COPY.copy}
      </button>
    </div>
  );
}

function GrantRow({ person }: { person: AccountPageData["people"][number] }) {
  const router = useRouter({ warn: false });
  const [grants, setGrants] = useState<Grants>(person.grants);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const id = `account-grant-${person.id}`;
  async function run(action: () => Promise<{ ok: boolean; data: Record<string, unknown> }>) {
    setBusy(true);
    setOk(false);
    const r = await action();
    setBusy(false);
    if (!r.ok) return setError(errorOf(r));
    setError(null);
    setOk(true);
    if (typeof r.data.temporaryPassword === "string") setTemp(r.data.temporaryPassword);
    await router?.invalidate();
  }
  return (
    <li className="account-grant-row" data-testid="account-grant-row" data-email={person.email}>
      <div className="flex flex-col">
        <span className="text-chalk">{person.name || person.email}</span>
        <span className="account-dim">{person.email}</span>
      </div>
      <div className="account-levels">
        {SURFACES.map((s) => (
          <LevelSelect
            key={s}
            surface={s}
            id={id}
            value={grants[s]}
            onChange={(l) => setGrants({ ...grants, [s]: l })}
          />
        ))}
      </div>
      <Status error={error} ok={ok} testId={id} />
      <div className="flex flex-wrap items-center gap-x-6">
        <button
          type="button"
          disabled={busy}
          className="signin-button"
          data-testid={`${id}-save`}
          onClick={() => run(() => send("/api/account/access", "PUT", { userId: person.id, ...grants }))}
        >
          {COPY.save}
        </button>
        <button
          type="button"
          disabled={busy}
          className="signin-switch"
          data-testid={`${id}-reset`}
          onClick={() => run(() => send("/api/account/reset", "POST", { userId: person.id }))}
        >
          {COPY.resetPassword}
        </button>
        <button
          type="button"
          disabled={busy}
          className="signin-switch"
          data-testid={`${id}-remove`}
          onClick={() =>
            run(async () => {
              const r = await send(`/api/account/access?userId=${encodeURIComponent(person.id)}`, "DELETE");
              if (r.ok) setGrants({ personal_finance: "none", dashboard: "none" });
              return r;
            })
          }
        >
          {COPY.remove}
        </button>
      </div>
      {temp ? <Temporary email={person.email} password={temp} /> : null}
    </li>
  );
}

function GrantAccess({ people }: { people: AccountPageData["people"] }) {
  return (
    <div className="flex flex-col gap-10">
      {people.length ? (
        <ul className="account-people" data-testid="account-grant-list">
          {people.map((p) => (
            <GrantRow key={`${p.id}:${p.grants.personal_finance}:${p.grants.dashboard}`} person={p} />
          ))}
        </ul>
      ) : null}
      <AddPerson />
    </div>
  );
}

function AddPerson() {
  const router = useRouter({ warn: false });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [grants, setGrants] = useState<Grants>({ personal_finance: "none", dashboard: "none" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string; password: string | null } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(COPY.enterName);
    if (!email.trim()) return setError(COPY.enterEmail);
    setBusy(true);
    const r = await send("/api/account/access", "POST", { name, email, ...grants });
    setBusy(false);
    if (!r.ok) return setError(errorOf(r));
    setError(null);
    setDone({
      email: String(r.data.email ?? email),
      password: typeof r.data.temporaryPassword === "string" ? r.data.temporaryPassword : null,
    });
    setName("");
    setEmail("");
    setGrants({ personal_finance: "none", dashboard: "none" });
    await router?.invalidate();
  }
  return (
    <form className="account-form" onSubmit={submit} noValidate data-testid="account-add-form">
      <h3 className="signin-label">{COPY.addPerson}</h3>
      <Field label={COPY.name}>
        <input
          type="text"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="signin-field"
          data-testid="account-add-name"
        />
      </Field>
      <Field label={COPY.email}>
        <input
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="signin-field"
          data-testid="account-add-email"
        />
      </Field>
      <div className="account-levels">
        {SURFACES.map((s) => (
          <LevelSelect
            key={s}
            surface={s}
            id="account-add"
            value={grants[s]}
            onChange={(l) => setGrants({ ...grants, [s]: l })}
          />
        ))}
      </div>
      {error ? (
        <p className="signin-error" role="alert" data-testid="account-add-error">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="signin-button self-start" data-testid="account-add-submit">
        {COPY.createAccount}
      </button>
      {done?.password ? <Temporary email={done.email} password={done.password} /> : null}
      {done && !done.password ? (
        <p className="signin-note" role="status" data-testid="account-add-status">
          {COPY.saved}
        </p>
      ) : null}
    </form>
  );
}
