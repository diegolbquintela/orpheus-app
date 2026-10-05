// Types for leaveouts-rules.mjs (imported by src/components/dashboard/leaveouts.dom.test.tsx).
export interface LeaveOutControl {
  tag: string;
  role: string | null;
  type: string | null;
  name: string;
  href: string | null;
  download: boolean;
  pressed: string | null;
}
export interface LeaveOutSnapshot {
  text: string;
  controls?: LeaveOutControl[];
  paragraphs?: { text: string; alert: boolean }[];
}
export const KEPT_LINES: RegExp[];
export function leaveOutFindings(snapshot: LeaveOutSnapshot): Record<string, string[]>;
