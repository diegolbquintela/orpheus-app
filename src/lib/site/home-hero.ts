/**
 * The home hero (#69, spec §8): Jacob Jordaens, Triumph of Frederick Henry, Prince of Orange (1652), served from
 * `public/hero/` (source and licence: `public/hero/home-SOURCE.md`). Two crops of the same painting, chosen per
 * width (phone below 1024 px, wide from it; `WIDE_FROM_PX` in `hero.ts`):
 *   phone: a 3:2 crop (source x 0–3300, y 1880–4080), the band min(66.667vw, 480px) tall (Q17);
 *   wide: a 2.4:1 crop (source x 0–3670, y 1880–3409), the band at the crop's aspect ratio, ≤ 600 px.
 * `figure` is the prince with his cape and the four white chariot horses (with the dark horse's head behind the
 * leftmost), source x 1220–3250, y 1940–4000, as fractions of each crop, so the QA tool can check that the `01` /
 * title wash never covers them (ST3-02). Pure data: no React.
 */
import type { HeroCrop } from "@/lib/site/hero";

export const HOME_HERO_ALT = "Jacob Jordaens, Triumph of Frederick Henry, Prince of Orange (1652)";
export const HOME_TITLE = "Investment driven by research.";

export const HOME_HERO_CROPS: Record<"phone" | "wide", HeroCrop> = {
  phone: {
    name: "phone",
    width: 3300,
    height: 2200,
    widths: { avif: [480, 800, 1200], webp: [480, 800, 1200], jpg: [480, 800, 1200] },
    figure: [0.369, 0.027, 0.985, 0.964],
    position: "50% 30%",
  },
  wide: {
    name: "wide",
    width: 3670,
    height: 1529,
    // 2880 (1440 px at 2x) only as AVIF: the WebP is ≈ 290 KB and the JPEG ≈ 473 KB at that width.
    widths: { avif: [1024, 1440, 2048, 2880], webp: [1024, 1440, 2048], jpg: [1024, 1440, 2048] },
    figure: [0.332, 0.039, 0.886, 1],
    position: "50% 10%",
  },
};

export function homeHeroFile(
  crop: HeroCrop["name"],
  width: number,
  ext: "avif" | "webp" | "jpg",
): string {
  return `/hero/frederick-${crop}-${width}.${ext}`;
}

export function homeHeroSrcSet(crop: HeroCrop, ext: "avif" | "webp" | "jpg"): string {
  return crop.widths[ext].map((w) => `${homeHeroFile(crop.name, w, ext)} ${w}w`).join(", ");
}
