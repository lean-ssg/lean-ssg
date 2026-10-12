import type { SiteConfig } from "./config.js";
import type { Page, Post } from "./content.js";
import { html, SafeHtml } from "./html.js";
import { fillPartial, type Partials } from "./partials.js";

export interface RenderContext {
  readonly site: SiteConfig;
  readonly partials: Partials;
  readonly stylesheet: string | undefined;
}

interface DocumentProps {
  readonly title: string;
  readonly description: string | undefined;
  readonly permalink: string;
  readonly main: SafeHtml;
}

const time = (date: Date, lang: string): SafeHtml =>
  html`<time datetime="${date.toISOString().slice(0, 10)}">${new Intl.DateTimeFormat(lang, { dateStyle: "long", timeZone: "UTC" }).format(date)}</time>`;

function templateVariables(site: RenderContext["site"], props: Pick<DocumentProps, "title" | "permalink">): Readonly<Record<"site.title" | "site.description" | "page.title" | "page.permalink" | "year", string>> {
  return {
    "site.title": site.title,
    "site.description": site.description,
    "page.title": props.title,
    "page.permalink": props.permalink,
    year: String(new Date().getFullYear()),
  };
}

function documentTitle(site: RenderContext["site"], props: Pick<DocumentProps, "title" | "permalink">): string {
  return props.permalink === "/" ? site.title : `${props.title} – ${site.title}`;
}

/** The one HTML shell: partials around the page content. */
function document({ site, partials, stylesheet }: RenderContext, props: DocumentProps): string {
  const description = props.description ?? site.description;
  const renderPartial = (template: string): SafeHtml => SafeHtml.trust(fillPartial(template, templateVariables(site, props)));

  return html`<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${documentTitle(site, props)}</title>
${description !== "" && html`<meta name="description" content="${description}">`}
${stylesheet !== undefined && html`<link rel="stylesheet" href="${stylesheet}">`}
${renderPartial(partials.head)}
</head>
<body>
${renderPartial(partials.header)}
<main>
${props.main}
</main>
${renderPartial(partials.footer)}
</body>
</html>
`.toString();
}

/** A page is pure Markdown: you write its headings yourself. */
export const renderPage = (context: RenderContext, page: Page): string =>
  document(context, { ...page, main: html`<article class="page">${page.body}</article>` });

export const renderPost = (context: RenderContext, post: Post): string =>
  document(context, {
    ...post,
    main: html`<article class="post">
<h1>${post.title}</h1>
${time(post.date, context.site.lang)}
${post.body}
</article>`,
  });

export const renderBlog = (context: RenderContext, permalink: string, posts: readonly Post[]): string =>
  document(context, {
    title: context.site.blog.title,
    description: undefined,
    permalink,
    main: html`<section class="blog">
<h1>${context.site.blog.title}</h1>
<ul class="post-list">
${posts.map(
  (post) => html`<li>
${time(post.date, context.site.lang)}
<a href="${post.permalink}">${post.title}</a>
${post.description !== undefined && html`<p>${post.description}</p>`}
</li>
`,
)}</ul>
</section>`,
  });
