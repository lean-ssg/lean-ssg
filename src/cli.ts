#!/usr/bin/env node
import { parseArgs } from "node:util";
import { build } from "./build.js";
import { CONVENTIONS as C } from "./conventions.js";
import { serve, watchAndRun } from "./dev.js";
import { SiteError } from "./errors.js";

const USAGE = `Usage:
  lean-ssg build [--config <file.json>]
  lean-ssg dev   [--config <file.json>] [--port <number>]`;

async function runBuild(config: string | undefined): Promise<boolean> {
  const start = performance.now();
  try {
    const count = await build({ config });
    console.log(`✓ ${count} pages in ${Math.round(performance.now() - start)} ms`);
    return true;
  } catch (error) {
    console.error(error instanceof SiteError ? `Build failed:\n${error.message}` : error);
    return false;
  }
}

async function main(): Promise<number> {
  let parsed: ReturnType<typeof parseArgs> | undefined;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: { config: { type: "string" }, port: { type: "string", default: "8080" } },
    });
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }

  const { positionals: [command], values } = parsed;
  const config = typeof values["config"] === "string" ? values["config"] : undefined;
  const port = typeof values["port"] === "string" ? Number.parseInt(values["port"], 10) : 8080;

  switch (command) {
    case "build":
      return (await runBuild(config)) ? 0 : 1;
    case "dev": {
      await runBuild(config);
      serve(C.output, port);
      const watched = [C.content, C.partials, C.public, ...(config ? [config] : [C.defaultConfig])];
      watchAndRun(watched, async () => void (await runBuild(config)));
      console.log(`→ http://localhost:${port}`);
      return 0;
    }
    default:
      console.error(USAGE);
      return 1;
  }
}

process.exitCode = await main();
