import type { DatabaseSync } from "node:sqlite";
import { hoursViewed } from "./domain/hours.ts";
import type { ViewRow } from "./domain/hours.ts";

export const PAGE_SIZE = 24;

export type Kind = "movie" | "show";

export type TitleCard = {
  kind: Kind;
  id: number;
  title: string;
  year: number | null;
  hoursViewed: number;
  weeksInTop10: number;
};

function year(ms: unknown): number | null {
  return typeof ms === "number" ? new Date(ms).getUTCFullYear() : null;
}

export function stats(db: DatabaseSync) {
  const movies = db.prepare("SELECT COUNT(*) AS n FROM movie").get() as { n: number };
  const shows = db.prepare("SELECT COUNT(*) AS n FROM tv_show").get() as { n: number };
  const h = db
    .prepare("SELECT COALESCE(SUM(hours_viewed), 0) AS n FROM view_summary WHERE duration = 'SEMI_ANNUALLY'")
    .get() as { n: number };
  return { movies: movies.n, shows: shows.n, hoursViewed: h.n };
}

const MOVIE_SELECT = `
  SELECT 'movie' AS kind, m.id AS id, m.title AS title, m.release_date AS release_date,
    COALESCE(a.hours, 0) AS hours, COALESCE(a.weeks, 0) AS weeks
  FROM movie m
  LEFT JOIN (
    SELECT movie_id,
      SUM(CASE WHEN duration = 'SEMI_ANNUALLY' THEN hours_viewed END) AS hours,
      SUM(CASE WHEN duration = 'WEEKLY' THEN 1 ELSE 0 END) AS weeks
    FROM view_summary WHERE movie_id IS NOT NULL GROUP BY movie_id
  ) a ON a.movie_id = m.id
  WHERE m.title LIKE ? ESCAPE '\\'`;

const SHOW_SELECT = `
  SELECT 'show' AS kind, t.id AS id, t.title AS title, t.release_date AS release_date,
    COALESCE(a.hours, 0) AS hours, COALESCE(a.weeks, 0) AS weeks
  FROM tv_show t
  LEFT JOIN (
    SELECT s.tv_show_id AS show_id,
      SUM(CASE WHEN v.duration = 'SEMI_ANNUALLY' THEN v.hours_viewed END) AS hours,
      SUM(CASE WHEN v.duration = 'WEEKLY' THEN 1 ELSE 0 END) AS weeks
    FROM view_summary v JOIN season s ON s.id = v.season_id GROUP BY s.tv_show_id
  ) a ON a.show_id = t.id
  WHERE t.title LIKE ? ESCAPE '\\'`;

export function listTitles(
  db: DatabaseSync,
  opts: { q?: string; kind?: string; sort?: string; page?: number },
) {
  const q = (opts.q ?? "").trim();
  const like = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const kind = opts.kind === "movie" || opts.kind === "show" ? opts.kind : "all";
  const page = Number.isInteger(opts.page) && (opts.page as number) > 0 ? (opts.page as number) : 1;

  const parts: string[] = [];
  const params: string[] = [];
  if (kind !== "show") {
    parts.push(MOVIE_SELECT);
    params.push(like);
  }
  if (kind !== "movie") {
    parts.push(SHOW_SELECT);
    params.push(like);
  }
  const union = parts.join(" UNION ALL ");
  const order =
    opts.sort === "hours"
      ? "hours DESC, title COLLATE NOCASE, kind, id"
      : "title COLLATE NOCASE, kind, id";

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM (${union})`).get(...params) as { n: number }
  ).n;
  const rows = db
    .prepare(`SELECT * FROM (${union}) ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as any[];

  const items: TitleCard[] = rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    title: r.title,
    year: year(r.release_date),
    hoursViewed: r.hours,
    weeksInTop10: r.weeks,
  }));
  return { items, total, page, pageSize: PAGE_SIZE };
}

export function titleDetail(db: DatabaseSync, kind: string, id: number) {
  if (kind === "movie") {
    const m = db.prepare("SELECT id, title, release_date FROM movie WHERE id = ?").get(id) as any;
    if (!m) return null;
    const rows = db
      .prepare("SELECT duration, hours_viewed FROM view_summary WHERE movie_id = ?")
      .all(id) as ViewRow[];
    const w = db
      .prepare("SELECT COALESCE(MAX(cumulative_weeks_in_top10), 0) AS n FROM view_summary WHERE movie_id = ?")
      .get(id) as { n: number };
    return {
      kind: "movie" as const,
      id: m.id as number,
      title: m.title as string,
      year: year(m.release_date),
      hoursViewed: hoursViewed(rows),
      weeksInTop10: w.n,
      seasons: [] as { id: number; title: string; seasonNumber: number | null; hoursViewed: number }[],
    };
  }
  if (kind === "show") {
    const t = db.prepare("SELECT id, title, release_date FROM tv_show WHERE id = ?").get(id) as any;
    if (!t) return null;
    const seasons = db
      .prepare("SELECT id, title, season_number FROM season WHERE tv_show_id = ? ORDER BY season_number, id")
      .all(id) as any[];
    const bySeason = seasons.map((s) => {
      const rows = db
        .prepare("SELECT duration, hours_viewed FROM view_summary WHERE season_id = ?")
        .all(s.id) as ViewRow[];
      return {
        id: s.id as number,
        title: s.title as string,
        seasonNumber: s.season_number as number | null,
        hoursViewed: hoursViewed(rows),
      };
    });
    const w = db
      .prepare(
        `SELECT COALESCE(MAX(v.cumulative_weeks_in_top10), 0) AS n FROM view_summary v
         JOIN season s ON s.id = v.season_id WHERE s.tv_show_id = ?`,
      )
      .get(id) as { n: number };
    return {
      kind: "show" as const,
      id: t.id as number,
      title: t.title as string,
      year: year(t.release_date),
      hoursViewed: bySeason.reduce((a, s) => a + s.hoursViewed, 0),
      weeksInTop10: w.n,
      seasons: bySeason,
    };
  }
  return null;
}
