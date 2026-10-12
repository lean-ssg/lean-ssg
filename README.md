# lean-ssg

[![CI](https://github.com/lean-ssg/lean-ssg/actions/workflows/ci.yml/badge.svg)](https://github.com/lean-ssg/lean-ssg/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/lean-ssg)](https://www.npmjs.com/package/lean-ssg)

A tiny, strictly typed static site generator. Markdown + HTML partials → static HTML.
Two runtime dependencies (`marked`, `yaml`). Node 22+.

```bash
npm install -D lean-ssg
```

```json
"scripts": {
  "build": "lean-ssg build",
  "dev": "lean-ssg dev"
}
```

## Conventions

```
content/**/*.md         pages
content/posts/**/*.md   blog posts (also listed at /blog/)
partials/header.html    required
partials/footer.html    required
partials/head.html      optional, extra <head> content
public/                 copied as-is; public/style.css is linked automatically
lean-ssg.json           optional config (or pass --config <file>)
dist/                   output
```

## Frontmatter

```yaml
---
title: Hello            # required
permalink: /blog/hello/ # required, the only source of the URL ("/404.html" stays a file)
date: 2026-10-01        # required for posts, YYYY-MM-DD
description: ...        # optional
---
```

Pages are pure Markdown (write your own headings; raw HTML is allowed).
Posts get `<h1>` and `<time>` automatically.

## Partials

Placeholders (HTML-escaped): `{{ site.title }}`, `{{ site.description }}`, `{{ page.title }}`,
`{{ page.permalink }}`, `{{ year }}`. Unknown placeholders fail the build.

Any `<a href="…">` whose `href` equals the current permalink gets `aria-current="page"`.

## Config

All fields optional; unknown keys fail the build.

```json
{
  "title": "My site",
  "description": "",
  "lang": "en",
  "blog": { "permalink": "/blog/", "title": "Blog" }
}
```

## CLI

```
lean-ssg build [--config <file.json>]
lean-ssg dev   [--config <file.json>] [--port <number>]
```

Every problem (config, partials, content) is reported in one run; the build exits with code 1.

## Development

```bash
npm install       # also compiles src/ to lib/
npm run check     # typecheck + tests
npm run example   # build example/ with the local code
```

Releases are published from CI — see [RELEASING.md](RELEASING.md).

## License

MIT
