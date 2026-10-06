import { HOME_CARDS, HOME_LINE } from "@/lib/site/site";

/** Home `/` (#46): one line and exactly two cards. Static: no price fetches, no calculator code. */
export function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-16 pb-24 sm:px-8 sm:pt-24">
      <h1 className="max-w-3xl text-balance text-3xl leading-tight font-normal tracking-tight sm:text-5xl">
        {HOME_LINE}
      </h1>
      <ul className="mt-12 grid gap-px border border-line bg-line sm:mt-16 sm:grid-cols-2">
        {HOME_CARDS.map((card) => (
          <li key={card.href} className="bg-paper text-ink">
            <a
              href={card.href}
              data-testid="home-card"
              className="group flex h-full flex-col gap-3 p-8 transition-colors hover:bg-ink hover:text-card sm:p-10"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-2xl leading-none font-normal tracking-tight">{card.title}</h2>
                <span aria-hidden="true" className="text-muted group-hover:text-card/70">
                  →
                </span>
              </div>
              <p className="text-muted first-letter:uppercase group-hover:text-card/75">
                {card.text}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
