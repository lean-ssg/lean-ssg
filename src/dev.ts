import { existsSync, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** Local preview server. Not for production. */
export function serve(dir: string, port: number): void {
  const root = path.resolve(dir);

  createServer(async (req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    } catch {
      return void res.writeHead(400).end();
    }

    const target = path.join(root, pathname);
    if (target !== root && !target.startsWith(root + path.sep)) return void res.writeHead(403).end();

    const isDir = (await stat(target).catch(() => undefined))?.isDirectory() ?? false;
    if (isDir && !pathname.endsWith("/")) return void res.writeHead(301, { location: `${pathname}/` }).end();

    for (const [file, status] of [[isDir ? path.join(target, "index.html") : target, 200], [path.join(root, "404.html"), 404]] as const) {
      const body = await readFile(file).catch(() => undefined);
      if (body) {
        return void res
          .writeHead(status, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" })
          .end(body);
      }
    }
    res.writeHead(404).end("Not found");
  }).listen(port);
}

/**
 * Runs `task` whenever something in `dirs` changes.
 * Debounced, and never runs two tasks at once (changes made during a run trigger one more run).
 */
export function watchAndRun(dirs: readonly string[], task: () => Promise<void>): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;

  const run = async (): Promise<void> => {
    if (running) return void (pending = true);
    running = true;
    await task();
    running = false;
    if (pending) {
      pending = false;
      await run();
    }
  };

  for (const dir of dirs) {
    if (existsSync(dir)) {
      watch(dir, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => void run(), 50);
      });
    }
  }
}
