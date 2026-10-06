import { CALCULATOR_TITLE, HERO_ALT, HERO_CROPS, HERO_NUMERAL, heroFile, heroSrcSet, WIDE_FROM_PX } from "@/lib/site/hero";

const { phone, wide } = HERO_CROPS;
const WIDE = `(min-width: ${WIDE_FROM_PX}px)`;
const TYPES = [
  ["avif", "image/avif"],
  ["webp", "image/webp"],
  ["jpg", "image/jpeg"],
] as const;

/**
 * The Botticelli band under the bar (#70, spec §7, §7a; ST4-01, -02, -11, -14, -15). The band's height comes
 * from CSS alone (min(50vw, 200px) on a phone, the crop's aspect ratio from 1024 px), and every source carries
 * its intrinsic width and height, so nothing moves when the image arrives (CLS 0). `01` and the title sit lower
 * left in a soft wash (night at 88%), in plain type. The wash and title box have font-independent sizes
 * (`.calc-title`: 18 px × 1.1, 5.5em wide and three lines on a phone; 40 / 44 px, 9.5em wide and two lines from
 * 1024 px; the title one text node), so the Google Fonts swap moves nothing (QA round 1, D1). The wash hugs
 * the text: 87 px of a 180 px (360) or 200 px (400) band (N4).
 */
export function CalculatorHero() {
  return (
    <header
      className="relative h-[min(50vw,200px)] overflow-hidden bg-night lg:h-auto lg:max-h-[460px] lg:aspect-[3264/796]"
      data-testid="calculator-hero"
    >
      <picture>
        {TYPES.map(([ext, type]) => (
          <source
            key={`wide-${ext}`}
            media={WIDE}
            type={type}
            srcSet={heroSrcSet(wide, ext)}
            sizes="100vw"
            width={wide.width}
            height={wide.height}
          />
        ))}
        {TYPES.slice(0, 2).map(([ext, type]) => (
          <source
            key={`phone-${ext}`}
            type={type}
            srcSet={heroSrcSet(phone, ext)}
            sizes="100vw"
            width={phone.width}
            height={phone.height}
          />
        ))}
        <img
          src={heroFile("phone", 800, "jpg")}
          srcSet={heroSrcSet(phone, "jpg")}
          sizes="100vw"
          width={phone.width}
          height={phone.height}
          alt={HERO_ALT}
          fetchPriority="high"
          decoding="async"
          data-figure-phone={phone.figure.join(",")}
          data-figure-wide={wide.figure.join(",")}
          className="absolute inset-0 size-full object-cover object-[100%_25%] lg:object-[50%_20%]"
        />
      </picture>
      <div className="relative mx-auto flex h-full w-full max-w-6xl items-end px-5 pb-3 sm:px-8 lg:pb-8">
        <div className="calc-wash -ml-3 w-fit px-3 py-1.5 lg:-ml-5 lg:px-5 lg:py-4" data-testid="hero-wash">
          <p className="h-3 text-xs leading-none text-chalk lg:h-[0.9rem] lg:leading-[1.2]">{HERO_NUMERAL}</p>
          <h1 className="calc-title mt-1 text-chalk lg:mt-2" data-testid="hero-title">
            {CALCULATOR_TITLE}
          </h1>
        </div>
      </div>
    </header>
  );
}
