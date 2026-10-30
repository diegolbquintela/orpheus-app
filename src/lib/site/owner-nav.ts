// #271: an owner-only item for the site bar. The server sends it only to the owner (null for everyone else), so its
// label and href never reach a non-owner's HTML or loader data; this file holds only the type.
export type OwnerNavLink = { href: string; label: string; short: string };
