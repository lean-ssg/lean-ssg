import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { loadContent, parsePermalink, type Entry, type Post } from "./content.js";
import { CONVENTIONS as C } from "./conventions.js";
import { SiteError, throwIfProblems } from "./errors.js";
import { loadPartials } from "./partials.js";
import { renderBlog, renderPage, renderPost, type RenderContext } from "./render.js";

export interface BuildOptions {
  /** Path to a JSON config file. */
  readonly config: string | undefined;
}

type PageOutput = readonly [permalink: string, html: string];

type LoadedBuildArtifacts = readonly [
  site: Awaited<ReturnType<typeof loadConfig>>,
  partials: Awaited<ReturnType<typeof loadPartials>>,
  entries: Awaited<ReturnType<typeof loadContent>>,
];

/** `/` → `index.html`, `/a/` → `a/index.html`, `/404.html` → `404.html` */
const outputFile = (permalink: string): string =>
  path.join(C.output, ...(permalink.endsWith("/") ? `${permalink}index.html` : permalink).split("/"));

/** Unexpected errors are rethrown as-is; `SiteError` problems are collected. */
function problemsOf(result: PromiseSettledResult<unknown>): readonly string[] {
  if (result.status === "fulfilled") return [];
  if (result.reason instanceof SiteError) return result.reason.problems;
  throw result.reason;
}

function valueOf<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "fulfilled") return result.value;
  throw result.reason;
}

async function loadBuildArtifacts(options: BuildOptions): Promise<LoadedBuildArtifacts> {
  const loaded = await Promise.allSettled([loadConfig(options.config), loadPartials(C.partials), loadContent(C.content, C.posts)]);
  throwIfProblems(loaded.flatMap(problemsOf));

  return [valueOf(loaded[0]), valueOf(loaded[1]), valueOf(loaded[2])] as const;
}

function renderEntries(context: RenderContext, entries: readonly Entry[]): PageOutput[] {
  return entries.map((entry) => {
    const html = entry.kind === "post" ? renderPost(context, entry) : renderPage(context, entry);
    return [entry.permalink, html] as const;
  });
}

async function writePages(pages: readonly PageOutput[]): Promise<void> {
  await rm(C.output, { recursive: true, force: true });
  if (existsSync(C.public)) await cp(C.public, C.output, { recursive: true });

  await Promise.all(
    pages.map(async ([permalink, html]) => {
      const file = outputFile(permalink);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, html);
    }),
  );
}

/** config + content/ + partials/ + public/ → dist/. Returns the number of written pages. */
export async function build(options: BuildOptions): Promise<number> {
  const [site, partials, entries] = await loadBuildArtifacts(options);

  const blogPermalink = parsePermalink(site.blog.permalink);
  if (typeof blogPermalink !== "string") throw new SiteError([`config: blog.${blogPermalink.problem}`]);

  const context: RenderContext = {
    site,
    partials,
    stylesheet: existsSync(path.join(C.public, C.stylesheet)) ? `/${C.stylesheet}` : undefined,
  };

  const posts = entries
    .filter((entry): entry is Post => entry.kind === "post")
    .toSorted((a, b) => b.date.getTime() - a.date.getTime());

  const pages: readonly PageOutput[] = [
    ...renderEntries(context, entries),
    [blogPermalink, renderBlog(context, blogPermalink, posts)] as const,
  ];

  await writePages(pages);
  return pages.length;
}
