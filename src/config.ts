import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { CONVENTIONS } from "./conventions.js";
import { SiteError, throwIfProblems } from "./errors.js";

export interface SiteConfig {
  readonly title: string;
  readonly description: string;
  /** BCP 47 tag, used for `<html lang>` and date formatting. */
  readonly lang: string;
  readonly blog: {
    readonly permalink: string;
    readonly title: string;
  };
}

export const DEFAULT_CONFIG: SiteConfig = {
  title: "My site",
  description: "",
  lang: "en",
  blog: { permalink: "/blog/", title: "Blog" },
};

type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function string(object: JsonObject, key: string, fallback: string, name: string, problems: string[]): string {
  const value = object[key];
  if (value === undefined) return fallback;
  if (typeof value === "string") return value;
  problems.push(`"${name}" must be a string`);
  return fallback;
}

/** Unknown keys are errors, so a typo never passes silently. */
function rejectUnknownKeys(object: JsonObject, allowed: readonly string[], prefix: string, problems: string[]): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) problems.push(`unknown option "${prefix}${key}"`);
  }
}

export function parseConfig(json: unknown, file: string): SiteConfig {
  const problems: string[] = [];
  const root = isObject(json) ? json : (problems.push("config must be a JSON object"), {});
  const blog = root["blog"] === undefined ? {} : isObject(root["blog"]) ? root["blog"] : (problems.push(`"blog" must be an object`), {});

  rejectUnknownKeys(root, ["title", "description", "lang", "blog"], "", problems);
  rejectUnknownKeys(blog, ["permalink", "title"], "blog.", problems);

  const d = DEFAULT_CONFIG;
  const config: SiteConfig = {
    title: string(root, "title", d.title, "title", problems),
    description: string(root, "description", d.description, "description", problems),
    lang: string(root, "lang", d.lang, "lang", problems),
    blog: {
      permalink: string(blog, "permalink", d.blog.permalink, "blog.permalink", problems),
      title: string(blog, "title", d.blog.title, "blog.title", problems),
    },
  };

  throwIfProblems(problems.map((problem) => `${file}: ${problem}`));
  return config;
}

/** `--config` path if given (must exist), else `lean-ssg.json` if present, else defaults. */
export async function loadConfig(file: string | undefined): Promise<SiteConfig> {
  const configPath = file ?? (existsSync(CONVENTIONS.defaultConfig) ? CONVENTIONS.defaultConfig : undefined);
  if (configPath === undefined) return DEFAULT_CONFIG;

  const source = await readFile(configPath, "utf8").catch(() => {
    throw new SiteError([`config file not found: ${configPath}`]);
  });
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (error) {
    throw new SiteError([`${configPath}: invalid JSON (${(error as Error).message})`]);
  }
  return parseConfig(json, configPath);
}
