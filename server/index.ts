import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { openCatalog } from "./catalog.ts";
import { openAppDb } from "./app-db.ts";
import { listTitles, stats, titleDetail } from "./titles.ts";
import { approvedReviews, createReview, isModerator, listUsers, moderate, pendingReviews } from "./reviews.ts";
import { serveStatic } from "./static.ts";

try {
  process.loadEnvFile();
} catch {}

const catalog = openCatalog();
const appDb = openAppDb();

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<any> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("too large");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method ?? "GET";
  const path = url.pathname;
  let m: RegExpMatchArray | null;

  if (method === "GET" && path === "/api/stats") return json(res, 200, stats(catalog));
  if (method === "GET" && path === "/api/users") return json(res, 200, listUsers(appDb));
  if (method === "GET" && path === "/api/titles") {
    const p = url.searchParams;
    return json(
      res,
      200,
      listTitles(catalog, {
        q: p.get("q") ?? "",
        kind: p.get("kind") ?? "all",
        sort: p.get("sort") ?? "title",
        page: Number(p.get("page") ?? 1),
      }),
    );
  }
  if ((m = path.match(/^\/api\/titles\/(movie|show)\/(\d+)$/)) && method === "GET") {
    const d = titleDetail(catalog, m[1], Number(m[2]));
    return d ? json(res, 200, d) : json(res, 404, { error: "Not found" });
  }
  if ((m = path.match(/^\/api\/titles\/(movie|show)\/(\d+)\/reviews$/))) {
    const id = Number(m[2]);
    if (method === "GET") return json(res, 200, approvedReviews(appDb, m[1], id));
    if (method === "POST") {
      if (!titleDetail(catalog, m[1], id)) return json(res, 404, { error: "Not found" });
      const body = await readBody(req);
      if (!body) return json(res, 400, { error: "Invalid JSON" });
      const out = createReview(appDb, m[1], id, body);
      return out.error ? json(res, 400, { error: out.error }) : json(res, 201, out.review);
    }
  }
  if (path === "/api/reviews/pending" && method === "GET") {
    if (!isModerator(appDb, req.headers["x-user-id"] as string | undefined)) return json(res, 403, { error: "Forbidden" });
    return json(res, 200, pendingReviews(appDb));
  }
  if ((m = path.match(/^\/api\/reviews\/(\d+)$/)) && method === "PATCH") {
    if (!isModerator(appDb, req.headers["x-user-id"] as string | undefined)) return json(res, 403, { error: "Forbidden" });
    const body = await readBody(req);
    const out = body ? moderate(appDb, Number(m[1]), body.status) : null;
    return out ? json(res, 200, out) : json(res, 400, { error: "Invalid request" });
  }
  return json(res, 404, { error: "Not found" });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    api(req, res, url).catch((e) => {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: "Server error" });
    });
    return;
  }
  serveStatic(req, res);
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Netflix Explorer on http://localhost:${port}`));
