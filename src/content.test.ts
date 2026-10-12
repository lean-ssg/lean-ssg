import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { build } from "./build.js";
import { DEFAULT_CONFIG, loadConfig, parseConfig } from "./config.js";
import { loadContent, parseEntry, parsePermalink } from "./content.js";
import { SiteError, throwIfProblems } from "./errors.js";
import { html, SafeHtml } from "./html.js";
import { fillPartial, loadPartials } from "./partials.js";
import { renderBlog, renderPage, renderPost } from "./render.js";

const problemsOf = (fn: () => unknown): readonly string[] => {
  try {
    fn();
  } catch (error) {
    if (error instanceof SiteError) return error.problems;
    throw error;
  }
  return [];
};

describe("parsePermalink", () => {
  it("normalizes paths", () => {
    assert.equal(parsePermalink("/"), "/");
    assert.equal(parsePermalink("/o-mnie"), "/o-mnie/");
    assert.equal(parsePermalink("//blog//x/"), "/blog/x/");
    assert.equal(parsePermalink("/404.html"), "/404.html");
  });

  it("rejects unsafe paths", () => {
    for (const input of ["blog/", "/../etc", "/a b/", "/a?b"]) {
      assert.equal(typeof parsePermalink(input), "object", input);
    }
  });
});

describe("parseEntry", () => {
  it("parses a post", () => {
    const post = parseEntry("post", "p.md", "---\ntitle: Hi\ndate: 2026-01-02\npermalink: /blog/hi\n---\n# Body");
    assert.equal(post.kind, "post");
    assert.equal(post.permalink, "/blog/hi/");
    assert.match(post.body.toString(), /<h1>Body<\/h1>/);
  });

  it("reports every problem at once", () => {
    assert.equal(problemsOf(() => parseEntry("post", "p.md", "---\ndate: 2026-02-31\npermalink: nope\n---\n")).length, 3);
  });

  it("requires a permalink", () => {
    assert.match(problemsOf(() => parseEntry("page", "a.md", "---\ntitle: A\n---\n"))[0] ?? "", /"permalink" is required/);
  });
});

describe("parseConfig", () => {
  it("fills defaults", () => {
    assert.deepEqual(parseConfig({ title: "T", blog: { title: "Wpisy" } }, "c.json"), {
      title: "T",
      description: "",
      lang: "en",
      blog: { permalink: "/blog/", title: "Wpisy" },
    });
  });

  it("rejects unknown keys and wrong types", () => {
    assert.deepEqual(problemsOf(() => parseConfig({ titel: "x", lang: 1, blog: { foo: "" } }, "c.json")), [
      'c.json: unknown option "titel"',
      'c.json: unknown option "blog.foo"',
      'c.json: "lang" must be a string',
    ]);
  });
});

describe("fillPartial", () => {
  const variables = {
    "site.title": "A & B",
    "site.description": "",
    "page.title": "<x>",
    "page.permalink": "/blog/",
    year: "2026",
  };

  it("fills escaped placeholders", () => {
    assert.equal(fillPartial("{{site.title}} | {{ page.title }}", variables), "A &amp; B | &lt;x&gt;");
  });

  it("marks the current link", () => {
    assert.equal(
      fillPartial('<a href="/">S</a><a class="n" href="/blog/">B</a>', variables),
      '<a href="/">S</a><a class="n" href="/blog/" aria-current="page">B</a>',
    );
  });
});

describe("html", () => {
  it("escapes strings, keeps SafeHtml, flattens arrays, skips false/null/undefined", () => {
    const items = ["<a>", "b"].map((x) => html`<li>${x}</li>`);
    assert.equal(
      html`<ul>${items}</ul>${SafeHtml.trust("<hr>")}${false}${null}${undefined}`.toString(),
      "<ul><li>&lt;a&gt;</li><li>b</li></ul><hr>",
    );
  });
});

describe("loadConfig", () => {
  it("returns defaults when no config file exists", async () => {
    assert.deepEqual(await loadConfig(undefined), DEFAULT_CONFIG);
  });

  it("reads a JSON config file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lean-ssg-config-"));
    const file = path.join(dir, "lean-ssg.json");

    try {
      await writeFile(file, JSON.stringify({ title: "My fancy site", blog: { title: "Wpisy" } }));
      assert.deepEqual(await loadConfig(file), {
        title: "My fancy site",
        description: "",
        lang: "en",
        blog: { permalink: "/blog/", title: "Wpisy" },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid JSON", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lean-ssg-config-"));
    const file = path.join(dir, "config.json");

    try {
      await writeFile(file, "{bad json}");
      await assert.rejects(() => loadConfig(file), (error: unknown) => {
        if (!(error instanceof SiteError)) return false;
        return error.problems.some((problem) => problem.includes("invalid JSON"));
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("loadPartials", () => {
  it("loads valid partials and validates placeholders", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lean-ssg-partials-"));

    try {
      await writeFile(path.join(dir, "head.html"), "<meta charset=\"utf-8\">\n");
      await writeFile(path.join(dir, "header.html"), "<header>{{ page.title }}</header>\n");
      await writeFile(path.join(dir, "footer.html"), "<footer>{{ year }}</footer>\n");

      assert.deepEqual(await loadPartials(dir), {
        head: "<meta charset=\"utf-8\">\n",
        header: "<header>{{ page.title }}</header>\n",
        footer: "<footer>{{ year }}</footer>\n",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unknown placeholders", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lean-ssg-partials-"));

    try {
      await writeFile(path.join(dir, "head.html"), "");
      await writeFile(path.join(dir, "header.html"), "<header>{{ unknown.value }}</header>");
      await writeFile(path.join(dir, "footer.html"), "<footer>{{ year }}</footer>");

      await assert.rejects(() => loadPartials(dir), (error: unknown) => {
        if (!(error instanceof SiteError)) return false;
        return error.problems.some((problem) => problem.includes("unknown placeholder"));
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("loadContent", () => {
  it("loads markdown pages and posts from the content tree", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lean-ssg-content-"));
    const contentDir = path.join(dir, "content");
    const postsDir = path.join(contentDir, "posts");

    try {
      await mkdir(postsDir, { recursive: true });
      await writeFile(
        path.join(contentDir, "about.md"),
        "---\ntitle: About\npermalink: /about/\n---\n# About\n",
      );
      await writeFile(
        path.join(postsDir, "2026-01-12.md"),
        "---\ntitle: Hello\ndate: 2026-01-12\npermalink: /blog/hello\n---\n# Hello\n",
      );

      const entries = await loadContent(contentDir, postsDir);
      assert.equal(entries.length, 2);
      const [page, post] = entries;
      assert.ok(page);
      assert.ok(post);
      assert.equal(page.kind, "page");
      assert.equal(page.permalink, "/about/");
      assert.equal(post.kind, "post");
      assert.equal(post.permalink, "/blog/hello/");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("collects all problems from invalid content files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lean-ssg-content-"));
    const contentDir = path.join(dir, "content");

    try {
      await mkdir(contentDir, { recursive: true });
      await writeFile(path.join(contentDir, "broken.md"), "---\ndate: 2026-02-31\n---\n");

      await assert.rejects(() => loadContent(contentDir, contentDir), (error: unknown) => {
        if (!(error instanceof SiteError)) return false;
        return error.problems.some((problem) => problem.includes('"title" is required'));
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("render", () => {
  it("renders page, post and blog documents with the correct shell", () => {
    const site = {
      title: "My site",
      description: "Site description",
      lang: "en",
      blog: { permalink: "/blog/", title: "Blog" },
    };
    const partials = {
      head: "<meta name=\"generator\" content=\"lean-ssg\">",
      header: "<header>{{ site.title }}</header>",
      footer: "<footer>{{ year }}</footer>",
    };
    const context = { site, partials, stylesheet: "/style.css" };

    const page = renderPage(context, {
      file: "about.md",
      kind: "page",
      title: "About",
      description: "About page",
      permalink: "/about/",
      body: SafeHtml.trust("<h1>About</h1>"),
    });

    const post = renderPost(context, {
      file: "hello.md",
      kind: "post",
      title: "Hello",
      description: "Post summary",
      permalink: "/blog/hello/",
      date: new Date("2026-01-12T00:00:00Z"),
      body: SafeHtml.trust("<p>Hello world</p>"),
    });

    const blog = renderBlog(context, "/blog/", [
      {
        file: "hello.md",
        kind: "post",
        title: "Hello",
        description: "Post summary",
        permalink: "/blog/hello/",
        date: new Date("2026-01-12T00:00:00Z"),
        body: SafeHtml.trust("<p>Hello world</p>"),
      },
    ]);

    assert.match(page, /<title>About – My site<\/title>/);
    assert.match(page, /<article class="page"><h1>About<\/h1><\/article>/);
    assert.match(post, /<time datetime="2026-01-12">January 12, 2026/);
    assert.match(blog, /<h1>Blog<\/h1>/);
    assert.match(blog, /<a href="\/blog\/hello\/">Hello<\/a>/);
  });
});

describe("build", () => {
  it("builds a site and writes the rendered pages to dist/", async () => {
    const originalCwd = process.cwd();
    const dir = await mkdtemp(path.join(tmpdir(), "lean-ssg-build-"));

    try {
      process.chdir(dir);
      await mkdir(path.join(dir, "content", "posts"), { recursive: true });
      await mkdir(path.join(dir, "partials"), { recursive: true });
      await mkdir(path.join(dir, "public"), { recursive: true });

      await writeFile(path.join(dir, "content", "about.md"), "---\ntitle: About\npermalink: /about/\n---\n# About\n");
      await writeFile(
        path.join(dir, "content", "posts", "2026-01-12.md"),
        "---\ntitle: Hello\ndate: 2026-01-12\npermalink: /blog/hello\n---\n# Hello\n",
      );
      await writeFile(path.join(dir, "partials", "head.html"), "<meta name=\"generator\" content=\"lean-ssg\">\n");
      await writeFile(path.join(dir, "partials", "header.html"), "<header>{{ site.title }}</header>\n");
      await writeFile(path.join(dir, "partials", "footer.html"), "<footer>{{ year }}</footer>\n");
      await writeFile(path.join(dir, "public", "style.css"), "body { color: black; }\n");

      const count = await build({ config: undefined });
      assert.equal(count, 3);

      const about = await readFile(path.join(dir, "dist", "about", "index.html"), "utf8");
      assert.match(about, /<title>About – My site<\/title>/);

      const blog = await readFile(path.join(dir, "dist", "blog", "index.html"), "utf8");
      assert.match(blog, /<h1>Blog<\/h1>/);
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("throwIfProblems", () => {
  it("throws SiteError with all collected problems", () => {
    assert.throws(
      () => throwIfProblems(["first", "second"]),
      (error: unknown) => {
        if (!(error instanceof SiteError)) return false;
        return error.problems.length === 2 && error.message.includes("first") && error.message.includes("second");
      },
    );
  });
});
