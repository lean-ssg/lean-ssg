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

export type PartialName = keyof Partials;

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
const isVariable = (name: string): name is Variable => (VARIABLES as readonly string[]).includes(name);
const REQUIRED_PARTIALS = { head: false, header: true, footer: true } as const satisfies Record<PartialName, boolean>;

function readPartial(dir: string, name: PartialName, problems: string[]): Promise<string> {
  const file = path.join(dir, `${name}.html`).split(path.sep).join("/");

  return readFile(file, "utf8")
    .then((source) => {
      for (const [, variable = ""] of source.matchAll(PLACEHOLDER)) {
        if (!isVariable(variable)) {
          problems.push(`${file}: unknown placeholder {{ ${variable} }} (available: ${VARIABLES.join(", ")})`);
        }
      }
      return source;
    })
    .catch(() => {
      if (REQUIRED_PARTIALS[name]) problems.push(`missing required partial: ${file}`);
      return "";
    });
}

/** Loads `partials/{head,header,footer}.html`. Missing required partials and unknown placeholders fail the build. */
export async function loadPartials(dir: string): Promise<Partials> {
  const problems: string[] = [];
  const [head, header, footer] = await Promise.all([
    readPartial(dir, "head", problems),
    readPartial(dir, "header", problems),
    readPartial(dir, "footer", problems),
  ]);

  throwIfProblems(problems);
  return { head, header, footer };
}

function replaceVariable(name: string, variables: Variables): string {
  if (!isVariable(name)) return "";
  return escapeHtml(variables[name]);
}

function markCurrentPageLink(match: string, attributes: string, href: string, variables: Variables): string {
  if (href !== variables["page.permalink"] || match.includes("aria-current")) {
    return match;
  }
  return `<a${attributes} href="${href}" aria-current="page"`;
}

/** Fills placeholders and marks `<a href="…">` pointing at the current page with `aria-current="page"`. */
export function fillPartial(template: string, variables: Variables): string {
  return template
    .replace(PLACEHOLDER, (_match, name: string) => replaceVariable(name, variables))
    .replace(/<a\b([^>]*?)\shref="([^"]*)"/g, (match, attributes: string, href: string) =>
      markCurrentPageLink(match, attributes, href, variables),
    );
}
