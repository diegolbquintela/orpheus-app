export function money(value: number, currency: string): string {
  try {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    });
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("en-US")}`;
  }
}

export function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const points = value * 100;
  const body = `${Math.abs(points).toFixed(1)}%`;
  if (points < 0) return `−${body}`;
  if (points > 0) return `+${body}`;
  return "0.0%";
}

export function quote(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = value >= 1000 ? 0 : value >= 1 ? 2 : 4;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function shareCount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function weightLabel(weight: number): string {
  return `${(weight * 100).toFixed(1)}%`;
}
