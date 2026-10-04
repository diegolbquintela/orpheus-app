/** Trimmed server env value, or undefined when unset or blank. */
export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}
