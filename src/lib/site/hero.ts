/**
 * The calculator hero (#70, spec §7 / §7a): Sandro Botticelli, The Birth of Venus, served from `public/hero/`
 * (source and licence: `public/hero/calculator-SOURCE.md`). Two crops of the same painting, chosen per width:
 *   phone (below 1024 px): a 2:1 crop with Venus on the right, the band min(50vw, 200px) tall;
 *   wide (from 1024 px): a 4.1:1 crop of the top of the painting with Venus right of centre, the band at the
 *   crop's own aspect ratio (capped at 460 px tall on very wide screens).
 * `figure` is Venus (head, hair and body; the shell is outside both crops) as fractions of each crop, so the QA
 * tool can check that the `01` / title wash never covers her (ST4-14). Pure data: no React.
 */

export const HERO_ALT = "Sandro Botticelli, The Birth of Venus";
export const HERO_NUMERAL = "01";
export const CALCULATOR_TITLE = "Dollar-cost average calculator.";

/** Phone rules apply below this width; the wide layout from it (spec §7a). */
export const WIDE_FROM_PX = 1024;

export type HeroCrop = {
  name: "phone" | "wide";
  /** Crop size in source pixels (the intrinsic aspect ratio of every file of this crop). */
  width: number;
  height: number;
  widths: { avif: number[]; webp: number[]; jpg: number[] };
  /** Venus as fractions of the crop: [left, top, right, bottom]. */
  figure: [number, number, number, number];
  /** CSS object-position for the band. */
  position: string;
};

export const HERO_CROPS: Record<"phone" | "wide", HeroCrop> = {
  phone: {
    name: "phone",
    width: 1700,
    height: 850,
    widths: { avif: [480, 800, 1200], webp: [480, 800, 1200], jpg: [480, 800, 1200] },
    figure: [0.56, 0.094, 0.935, 1],
    position: "100% 25%",
  },
  wide: {
    name: "wide",
    width: 3264,
    height: 796,
    // 2880 (1440 px at 2x) only as AVIF: the WebP / JPEG files at that width would pass 300 KB.
    widths: { avif: [1024, 1440, 2048, 2880], webp: [1024, 1440, 2048], jpg: [1024, 1440, 2048] },
    figure: [0.532, 0.123, 0.728, 1],
    position: "50% 20%",
  },
};

export function heroFile(crop: HeroCrop["name"], width: number, ext: "avif" | "webp" | "jpg"): string {
  return `/hero/venus-${crop}-${width}.${ext}`;
}

export function heroSrcSet(crop: HeroCrop, ext: "avif" | "webp" | "jpg"): string {
  return crop.widths[ext].map((w) => `${heroFile(crop.name, w, ext)} ${w}w`).join(", ");
}
