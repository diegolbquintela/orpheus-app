import { HERO_NUMERAL, WIDE_FROM_PX } from "@/lib/site/hero";
import {
  HOME_HERO_ALT,
  HOME_HERO_CROPS,
  HOME_TITLE,
  homeHeroFile,
  homeHeroSrcSet,
} from "@/lib/site/home-hero";

const { phone, wide } = HOME_HERO_CROPS;
const WIDE = `(min-width: ${WIDE_FROM_PX}px)`;
const TYPES = [
  ["avif", "image/avif"],
  ["webp", "image/webp"],
  ["jpg", "image/jpeg"],
] as const;

/**
 * The Jordaens band under the bar (#69, spec §8; ST3-01, -02, -05, -06). The band's height comes from CSS alone
 * (min(66.667vw, 480px) on a phone, the wide crop's aspect ratio from 1024 px, ≤ 600 px), and every source carries
 * its intrinsic width and height, so nothing moves when the image arrives (CLS 0). `01` and the title sit lower
 * left in a soft wash (night at 88%) that hugs them, in plain type; the title box is font-independent
 * (`.home-title`: 5.3em × 3.3em, three lines, one text node), so the Google Fonts swap moves nothing. The wash
 * stays left of the prince and the horses (the figure box per crop in `home-hero.ts`): wide, the text starts on
 * the content column's left edge but never further right than 33.24% − 280 px of the band (the leftmost horse is
 * at 33.24% of the wide crop), so it stays clear on screens wider than 1440 px too.
 */
export function HomeHero() {
  return (
    <header
      className="relative h-[min(66.667vw,480px)] overflow-hidden bg-night lg:aspect-[3670/1529] lg:h-auto lg:max-h-[600px]"
      data-testid="home-hero"
    >
      <picture>
        {TYPES.map(([ext, type]) => (
          <source
            key={`wide-${ext}`}
            media={WIDE}
            type={type}
            srcSet={homeHeroSrcSet(wide, ext)}
            sizes="100vw"
            width={wide.width}
            height={wide.height}
          />
        ))}
        {TYPES.slice(0, 2).map(([ext, type]) => (
          <source
            key={`phone-${ext}`}
            type={type}
            srcSet={homeHeroSrcSet(phone, ext)}
            sizes="100vw"
            width={phone.width}
            height={phone.height}
          />
        ))}
        <img
          src={homeHeroFile("phone", 800, "jpg")}
          srcSet={homeHeroSrcSet(phone, "jpg")}
          sizes="100vw"
          width={phone.width}
          height={phone.height}
          alt={HOME_HERO_ALT}
          fetchPriority="high"
          decoding="async"
          data-figure-phone={phone.figure.join(",")}
          data-figure-wide={wide.figure.join(",")}
          className="absolute inset-0 size-full object-cover object-[50%_30%] lg:object-[50%_10%]"
        />
      </picture>
      <div
        className="relative mx-auto flex h-full w-full max-w-6xl items-end px-5 pb-3 sm:px-8 lg:max-w-none lg:pr-8 lg:pb-8 lg:pl-[min(max(2rem,calc((100%_-_72rem)/2_+_2rem)),calc(33.24%_-_17.5rem))]"
        data-testid="hero-text"
      >
        <div
          className="home-wash -ml-3 w-fit px-2 py-1.5 lg:-ml-5 lg:px-5 lg:py-4"
          data-testid="hero-wash"
        >
          <p className="h-3 text-xs leading-none text-chalk lg:h-[0.9rem] lg:leading-[1.2]">
            {HERO_NUMERAL}
          </p>
          <h1 className="home-title mt-1 text-chalk lg:mt-2" data-testid="hero-title">
            {HOME_TITLE}
          </h1>
        </div>
      </div>
    </header>
  );
}
