/** A user-fixable problem with the site (content, partials, config). Lists every problem at once. */
export class SiteError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.map((problem) => `  ✗ ${problem}`).join("\n"));
    this.name = "SiteError";
    this.problems = problems;
  }
}

/** Runs independent checks and throws one `SiteError` with all their problems. */
export function throwIfProblems(problems: readonly string[]): void {
  if (problems.length > 0) throw new SiteError(problems);
}
