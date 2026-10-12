import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseConfig } from "./config.js";
import { parseEntry, parsePermalink } from "./content.js";
import { SiteError } from "./errors.js";
import { html, SafeHtml } from "./html.js";
import { fillPartial } from "./partials.js";

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
