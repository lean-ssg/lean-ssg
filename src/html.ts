/**
 * HTML templating with escaping by default.
 * Every interpolated value is escaped unless it is `SafeHtml`.
 * `SafeHtml` is a class (not a type brand), because the check has to happen at runtime.
 */
export class SafeHtml {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  /** Only for HTML you control, e.g. rendered Markdown. */
  static trust(value: string): SafeHtml {
    return new SafeHtml(value);
  }

  toString(): string {
    return this.#value;
  }
}

type Interpolation = SafeHtml | string | number | false | null | undefined | readonly Interpolation[];

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

function stringify(value: Interpolation): string {
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(stringify).join("");
  if (value === false || value === null || value === undefined) return "";
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: readonly Interpolation[]): SafeHtml {
  return SafeHtml.trust(strings.reduce((out, chunk, i) => out + stringify(values[i - 1]) + chunk));
}
