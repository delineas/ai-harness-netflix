import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const ROOT = join(process.cwd(), "dist");

export function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = normalize(join(ROOT, pathname));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!extname(file)) file = join(ROOT, "index.html");
  else if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}
