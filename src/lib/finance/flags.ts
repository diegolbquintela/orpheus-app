/**
 * #165: the ONE switch for the category / account Delete UI (a new feature awaiting Diego's call). A code constant,
 * not an environment variable. `true`: `Delete category` / `Delete account` and their confirm are shown (PR #167).
 * `false` (branch fix/pf-keep-deleted-protection-only): no Delete buttons or confirm text; the KEEP protection
 * (deleted names read back on earlier months, `(deleted)` labels for existing data, report `deleted` / `labels`) and
 * every test stay. Flip it in one commit.
 */
export const PF_DELETE_UI = true;
