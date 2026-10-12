import { readFile } from "node:fs/promises";
import path from "node:path";
import { throwIfProblems } from "./errors.js";
import { escapeHtml } from "./html.js";

/** The only placeholders a partial may use, e.g. `{{ page.title }}`. Values are HTML-escaped. */
export const VARIABLES = ["site.title", "site.description", "page.title", "page.permalink", "year"] as const;
export type Variable = (typeof VARIABLES)[number];
export type Variables = Readonly<Record<Variable, string>>;

export interface Partials {
  /** Optional: extra `<head>` content (fonts, favicon, scripts). */
  readonly head: string;
  readonly header: string;
  readonly footer: string;
}

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
const isVariable = (name: string): name is Variable => (VARIABLES as readonly string[]).includes(name);

const SPEC = { head: false, header: true, footer: true } as const satisfies Record<keyof Partials, boolean>;

/** Loads `partials/{head,header,footer}.html`. Missing required partials and unknown placeholders fail the build. */
export async function loadPartials(dir: string): Promise<Partials> {
  const problems: string[] = [];

  const read = async (name: keyof Partials): Promise<string> => {
    const file = path.join(dir, `${name}.html`).split(path.sep).join("/");
    const source = await readFile(file, "utf8").catch(() => undefined);
    if (source === undefined) {
      if (SPEC[name]) problems.push(`missing required partial: ${file}`);
      return "";
    }
    for (const [, variable = ""] of source.matchAll(PLACEHOLDER)) {
      if (!isVariable(variable)) problems.push(`${file}: unknown placeholder {{ ${variable} }} (available: ${VARIABLES.join(", ")})`);
    }
    return source;
  };

  const [head, header, footer] = await Promise.all([read("head"), read("header"), read("footer")]);
  throwIfProblems(problems);
  return { head, header, footer };
}

/** Fills placeholders and marks `<a href="…">` pointing at the current page with `aria-current="page"`. */
export function fillPartial(template: string, variables: Variables): string {
  return template
    .replace(PLACEHOLDER, (_, name: string) => (isVariable(name) ? escapeHtml(variables[name]) : ""))
    .replace(/<a\b([^>]*?)\shref="([^"]*)"/g, (match, attributes: string, href: string) =>
      href === variables["page.permalink"] && !match.includes("aria-current")
        ? `<a${attributes} href="${href}" aria-current="page"`
        : match,
    );
}
