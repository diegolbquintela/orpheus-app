// #258 (personal-finance-spec 80, AC PFRL): the one-click `Reload` button beside the stale-save banner (409 `stale`,
// 428 `base_version_required`). It re-fetches the server state in place (no page reload) through the page's own
// loader; while that runs it is disabled and reads `Reloading…`; on failure an inline error shows (focused) and the
// page's edits are kept. A success hands focus to the page heading (the banner is gone).
import { useEffect, useRef, useState } from "react";

import { focusPageHeading, RELOAD_BUTTON, RELOAD_ERROR, RELOADING } from "@/lib/finance/stale-reload";

export function StaleReload({
  onReload,
  testId = "pf-stale-reload",
}: {
  /** Re-fetch and apply the server state; resolve `false` (or throw) on failure. */
  onReload: () => Promise<boolean>;
  testId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const errRef = useRef<HTMLSpanElement | null>(null);
  // Each failed attempt moves focus to the (re-shown) error once it is on screen.
  const [failures, setFailures] = useState(0);
  useEffect(() => {
    if (failures) errRef.current?.focus();
  }, [failures]);
  // A successful reload clears the stale state, which removes this banner: focus moves to the page heading in that
  // same commit (the DOM is already the fresh one), not on a timer.
  const succeeded = useRef(false);
  useEffect(
    () => () => {
      if (succeeded.current) focusPageHeading();
    },
    [],
  );
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    let ok = false;
    try {
      ok = await onReload();
    } catch {
      ok = false;
    }
    // On success the caller has already queued the update that unmounts this banner.
    setBusy(false);
    if (ok) {
      succeeded.current = true;
    } else {
      setFailed(true);
      setFailures((n) => n + 1);
    }
  };
  return (
    <span className="pf-stale-reload">
      <button
        type="button"
        className="pf-button pf-button-secondary"
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy || undefined}
        data-testid={testId}
      >
        {busy ? RELOADING : RELOAD_BUTTON}
      </button>
      {failed ? (
        <span ref={errRef} tabIndex={-1} className="pf-error" role="alert" data-testid={`${testId}-error`}>
          {RELOAD_ERROR}
        </span>
      ) : null}
    </span>
  );
}
