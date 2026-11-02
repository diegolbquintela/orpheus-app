// #280 (spec §85, AC PFCH): the one visible chart title + subtitle used by every Personal Finance line chart on the
// scenario screen (Overview, Projected path, Compare). It is the figure's caption: the figure is labelled by the title
// (a real h3, so it is in the heading outline) and described by the subtitle.
export function ChartHeading({ id, title, sub, testId }: { id: string; title: string; sub: string; testId: string }) {
  return (
    <figcaption className="pf-chart-head" data-testid={testId}>
      <h3 id={`${id}-title`} className="pf-chart-title" data-testid={`${testId}-title`}>
        {title}
      </h3>
      <p id={`${id}-sub`} className="pf-chart-sub" data-testid={`${testId}-sub`}>
        {sub}
      </p>
    </figcaption>
  );
}
