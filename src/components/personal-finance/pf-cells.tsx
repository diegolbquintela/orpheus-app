import type { ReactNode } from "react";

/** A section head: the numeral (12 px dim) and the `h2`. */
export function SectionHead({
  numeral,
  title,
  id,
}: {
  numeral: string;
  title: string;
  id: string;
}) {
  return (
    <div>
      <p className="pf-label">{numeral}</p>
      <h2 id={id} className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
        {title}
      </h2>
    </div>
  );
}

/**
 * One labelled cell. The label shows above the value on a phone and is visually hidden from 1024 px (the group's
 * column-label row stands in). A control carries its own aria-label, so its visible label is hidden from
 * assistive tech; a computed value keeps its label as its name.
 */
export function Cell({
  label,
  area,
  control = false,
  children,
}: {
  label: string;
  area: string;
  control?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`pf-cell pf-${area}`}>
      <span className="pf-label pf-cell-label" {...(control ? { "aria-hidden": true } : {})}>
        {label}
      </span>
      {children}
    </div>
  );
}
