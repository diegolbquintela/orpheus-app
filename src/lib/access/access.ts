/**
 * #90 Roles and access (attachments/roles-and-account-design.md; Q-D1..Q-D18 decided). Pure: shared by the server,
 * the `/account` page and the tests. One owner (server-only `ORPHEUS_OWNER_EMAIL`); anyone else reaches the owner's
 * data only through a grant per surface: `personal_finance` (role CFO) or `dashboard` (role Portfolio Manager), at
 * `read` or `read_write` (Q-D2: no write without read).
 */
export const OWNER_EMAIL_ENV = "ORPHEUS_OWNER_EMAIL";

export const SURFACES = ["personal_finance", "dashboard"] as const;
export type Surface = (typeof SURFACES)[number];

export const LEVELS = ["none", "read", "read_write"] as const;
export type Level = (typeof LEVELS)[number];

/** The role a grant on a surface gives (labels only; Q-D3: one person may hold both). */
export const SURFACE_ROLE: Record<Surface, string> = {
  personal_finance: "CFO",
  dashboard: "Portfolio Manager",
};
export const SURFACE_LABEL: Record<Surface, string> = {
  personal_finance: "Personal finance",
  dashboard: "Dashboard",
};
export const LEVEL_LABEL: Record<Level, string> = {
  none: "No access",
  read: "Read",
  read_write: "Read and write",
};

export type Grants = Record<Surface, Level>;
export const NO_GRANTS: Grants = { personal_finance: "none", dashboard: "none" };

export function levelOf(flags: { can_read: boolean; can_write: boolean } | undefined): Level {
  if (!flags?.can_read) return "none";
  return flags.can_write ? "read_write" : "read";
}

export function isLevel(value: unknown): value is Level {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

export const canRead = (level: Level) => level !== "none";
export const canWrite = (level: Level) => level === "read_write";

/** The `You` role lines (ROLE-04): `Owner`, one line per granted surface, or `No access`. */
export function roleLines(owner: boolean, grants: Grants): string[] {
  if (owner) return ["Owner"];
  const lines = SURFACES.filter((s) => grants[s] !== "none").map(
    (s) => `${SURFACE_ROLE[s]} · ${SURFACE_LABEL[s]} · ${LEVEL_LABEL[grants[s]]}`,
  );
  return lines.length ? lines : [LEVEL_LABEL.none];
}

/** Normalised email (trimmed, lower case) or null when it isn't one. */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

/** The owner's email from the environment (lower case), or null when unset: then nobody has access. */
export function ownerEmailFromEnv(env: Record<string, string | undefined>): string | null {
  return normaliseEmail(env[OWNER_EMAIL_ENV]);
}

// Copy (ROLE rows; exact strings).
export const COPY = {
  // #91 audit log (attachments/audit-log-design.md section 5).
  activity: "Activity",
  activityEmpty: "No activity yet.",
  activityOlder: "Show older",
  activityCols: ["When", "Who", "Role", "Action", "Target", "Result"] as const,
  account: "Account",
  title: "Account · Orpheus Wisdom",
  you: "You",
  password: "Password",
  email: "Email",
  who: "Who has access",
  grant: "Grant access",
  signOut: "Sign out",
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm new password",
  newEmail: "New email",
  save: "Save",
  saved: "Saved.",
  enterCurrent: "Enter your current password.",
  tooShort: "Use 8 or more characters.",
  noMatch: "Passwords don't match.",
  wrongPassword: "That password is not right.",
  enterEmail: "Enter an email address.",
  emailInUse: "That email is already in use.",
  ownerEmailBlocked: "Owner email can't be changed here.",
  mustChange: "Set a new password to continue.",
  readOnly: "Read only",
  owner: "Owner",
  name: "Name",
  addPerson: "Add person",
  createAccount: "Create account",
  resetPassword: "Reset password",
  remove: "Remove",
  copy: "Copy",
  copied: "Copied.",
  temporary: "Temporary password (shown once)",
  signInAt: "Sign in at",
  enterName: "Enter a name.",
  failed: "Something went wrong. Try again.",
  home: "Home",
} as const;

export const deniedLine = (surface: Surface) =>
  surface === "dashboard"
    ? "You don't have access to the Dashboard."
    : "You don't have access to Personal finance.";

export const MIN_PASSWORD = 8;
