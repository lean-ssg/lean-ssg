/** Directory and file conventions, relative to the site's root (the current working directory). */
export const CONVENTIONS = {
  content: "content",
  posts: "content/posts",
  partials: "partials",
  public: "public",
  output: "dist",
  /** Linked automatically when it exists in `public/`. */
  stylesheet: "style.css",
  /** Used when `--config` is not given and this file exists. */
  defaultConfig: "lean-ssg.json",
} as const;
