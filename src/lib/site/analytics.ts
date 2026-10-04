/**
 * Vercel Web Analytics (#48): anonymous page views only, no cookies, no custom events.
 * Every event URL loses its query string and hash before it is sent. Page URLs carry no personal data
 * by design (no emails, tickers or holding ids in /, /calculator or /dashboard paths), but `/?query`
 * redirects to `/calculator?query` with the query kept, so a query could hold anything a link carried.
 */
import type { BeforeSendEvent } from "@vercel/analytics/react";

/** Drops the query string and the hash from an event URL; keeps origin and path. */
export function stripUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}

/** `beforeSend` for the Analytics component: page views go out with the bare path; anything else is dropped. */
export function analyticsBeforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  return { ...event, url: stripUrl(event.url) };
}
