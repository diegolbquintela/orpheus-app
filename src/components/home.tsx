import { HomeHero } from "@/components/home-hero";
import {
  HOME_OPEN,
  HOME_PLATFORMS,
  HOME_PLATFORMS_HEADING,
  HOME_PLATFORMS_NUMERAL,
} from "@/lib/site/site";

/**
 * Home `/` (#69, spec §8; replaces the #46 line and cards): the Jordaens band with `01` and the title, then
 * `02` `Platforms` with exactly three lines (#97: Calculator, Dashboard, Personal finance), each `Open` a link. Nothing else between the bar and the footer.
 * Static: no price fetches, no calculator code.
 */
export function Home() {
  return (
    <div className="home">
      <HomeHero />
      <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-20 sm:px-8 lg:pt-14 lg:pb-24">
        <section aria-labelledby="platforms-heading" data-testid="platforms">
          <p className="home-label">{HOME_PLATFORMS_NUMERAL}</p>
          <h2
            id="platforms-heading"
            className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk"
          >
            {HOME_PLATFORMS_HEADING}
          </h2>
          <ul className="mt-8">
            {HOME_PLATFORMS.map((line) => {
              const id = `platform-${line.name.toLowerCase().replace(/\s+/g, "-")}`;
              return (
                <li
                  key={line.href}
                  className="home-line"
                  data-testid="platform-line"
                  data-href={line.href}
                >
                  <h3 id={id} className="home-name text-xl leading-tight font-normal text-chalk">
                    {line.name}
                  </h3>
                  <p className="home-text text-sm leading-normal text-dim">{line.text}</p>
                  <a
                    href={line.href}
                    className="home-open"
                    aria-describedby={id}
                    data-testid="platform-open"
                  >
                    {HOME_OPEN}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
