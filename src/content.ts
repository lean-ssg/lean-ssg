import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Marked } from "marked";
import { parse as parseYaml } from "yaml";
import { SiteError, throwIfProblems } from "./errors.js";
import { SafeHtml } from "./html.js";

interface EntryBase {
  /** Source path, for error messages. */
  readonly file: string;
  readonly permalink: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly body: SafeHtml;
}
export interface Page extends EntryBase {
  readonly kind: "page";
}
export interface Post extends EntryBase {
  readonly kind: "post";
  readonly date: Date;
}
export type Entry = Page | Post;

type Data = Readonly<Record<string, unknown>>;

const PERMALINK = /^\/[\p{L}\p{N}._~\-/]*$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_EXTENSION = /\.[a-z0-9]+$/i;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

const marked = new Marked({ gfm: true });

/**
 * Validates and normalizes a URL path:
 * `/about` → `/about/` (written as `about/index.html`), `/404.html` stays a file.
 */
export function parsePermalink(input: string): string | { readonly problem: string } {
  const segments = input.split("/").filter(Boolean);
  if (!PERMALINK.test(input)) {
    return { problem: `permalink must start with "/" and contain only letters, digits and . _ ~ - (got "${input}")` };
  }
  if (segments.some((s) => s === "." || s === "..")) {
    return { problem: `permalink must not contain "." or ".." (got "${input}")` };
  }
  const isFile = !input.endsWith("/") && FILE_EXTENSION.test(segments.at(-1) ?? "");
  return segments.length === 0 ? "/" : `/${segments.join("/")}${isFile ? "" : "/"}`;
}

// --- field readers: return a value, or push a readable problem ---------------

function text(data: Data, key: string, problems: string[]): string {
  const value = data[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  problems.push(value == null ? `"${key}" is required` : `"${key}" must be a non-empty string`);
  return "";
}

function optionalText(data: Data, key: string, problems: string[]): string | undefined {
  return data[key] == null ? undefined : text(data, key, problems);
}

function permalink(data: Data, problems: string[]): string {
  const raw = text(data, "permalink", problems);
  if (raw === "") return "";
  const parsed = parsePermalink(raw);
  if (typeof parsed === "string") return parsed;
  problems.push(parsed.problem);
  return "";
}

/** `YYYY-MM-DD`, read as UTC midnight so output never depends on the build machine's timezone. */
function date(data: Data, problems: string[]): Date {
  const value = data["date"];
  const parsed = typeof value === "string" && ISO_DATE.test(value) ? new Date(`${value}T00:00:00Z`) : undefined;
  if (parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(String(value))) return parsed;
  problems.push(`"date" must be a valid YYYY-MM-DD date (got ${JSON.stringify(value)})`);
  return new Date(Number.NaN);
}

function splitFrontmatter(source: string, problems: string[]): { data: Data; markdown: string } {
  const match = FRONTMATTER.exec(source);
  if (!match) {
    problems.push("missing frontmatter (--- ... ---)");
    return { data: {}, markdown: source };
  }
  try {
    const data: unknown = parseYaml(match[1] ?? "") ?? {};
    if (typeof data === "object" && !Array.isArray(data)) {
      return { data: data as Data, markdown: source.slice(match[0].length) };
    }
    problems.push("frontmatter must be a key/value mapping");
  } catch (error) {
    problems.push(`invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { data: {}, markdown: source };
}

/** Parses one Markdown file. Pure: no I/O. Throws `SiteError` listing every problem in the file. */
export function parseEntry(kind: Entry["kind"], file: string, source: string): Entry {
  const problems: string[] = [];
  const { data, markdown } = splitFrontmatter(source, problems);

  const base = {
    file,
    title: text(data, "title", problems),
    permalink: permalink(data, problems),
    description: optionalText(data, "description", problems),
    // Markdown is written by the site owner, so its HTML (raw HTML included) is trusted.
    body: SafeHtml.trust(marked.parse(markdown, { async: false })),
  };
  const entry: Entry = kind === "post" ? { ...base, kind, date: date(data, problems) } : { ...base, kind };

  throwIfProblems(problems.map((problem) => `${file}: ${problem}`));
  return entry;
}

/** Loads every `.md` under `contentDir`. Files under `postsDir` are posts, the rest are pages. */
export async function loadContent(contentDir: string, postsDir: string): Promise<Entry[]> {
  const files = await readdir(contentDir, { recursive: true }).catch(() => {
    throw new SiteError([`missing "${contentDir}/" directory`]);
  });
  const entries: Entry[] = [];
  const problems: string[] = [];

  for (const relative of files.filter((f) => f.endsWith(".md")).sort()) {
    const file = path.join(contentDir, relative);
    const kind = path.resolve(file).startsWith(path.resolve(postsDir) + path.sep) ? "post" : "page";
    try {
      entries.push(parseEntry(kind, file.split(path.sep).join("/"), await readFile(file, "utf8")));
    } catch (error) {
      if (!(error instanceof SiteError)) throw error;
      problems.push(...error.problems);
    }
  }

  throwIfProblems(problems);
  return entries;
}
