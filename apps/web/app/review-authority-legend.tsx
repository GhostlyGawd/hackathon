interface ReviewAuthorityLegendProps {
  readonly observedState: "NOT_RUN" | "RECORDED";
  readonly headingId: string;
}

export function ReviewAuthorityLegend({
  observedState,
  headingId,
}: ReviewAuthorityLegendProps) {
  return (
    <section
      className="review-authority-legend"
      data-testid="review-authority-legend"
      aria-labelledby={headingId}
    >
      <header>
        <p className="eyebrow">Who establishes each kind of information</p>
        <h3 id={headingId}>Draft, test rule, and browser evidence are different.</h3>
      </header>
      <div className="review-authority-lanes">
        <article data-authority="model">
          <span>Model proposal</span>
          <strong>A suggestion to review</strong>
          <p>The model proposes a rule from cited text. It cannot run a test.</p>
        </article>
        <article data-authority="human">
          <span>Human-confirmed rule</span>
          <strong>A person-checked test instruction</strong>
          <p>A named reviewer decides what Pactwire may test. This is not a legal conclusion.</p>
        </article>
        <article data-authority="browser" data-observed-state={observedState}>
          <span>Observed browser fact</span>
          <strong>{observedState === "RECORDED" ? "Recorded by instrumentation" : "Nothing observed yet"}</strong>
          <p>Only a browser run can record what the software sent or showed.</p>
        </article>
      </div>
    </section>
  );
}
