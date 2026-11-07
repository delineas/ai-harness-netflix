import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openCatalog } from "../../server/catalog.ts";
import { listTitles, stats, titleDetail } from "../../server/titles.ts";

const db = openCatalog();

describe("catalog", () => {
  it("the app's catalog connection (openCatalog) is read-only", () => {
    // Use a throw-away copy: if the connection were writable, this test must
    // not modify the real data/catalog.db.
    const dir = mkdtempSync(join(tmpdir(), "catalog-ro-"));
    const copy = join(dir, "catalog.db");
    copyFileSync("data/catalog.db", copy);
    const conn = openCatalog(copy);
    try {
      expect(() => conn.exec("UPDATE movie SET title = 'x' WHERE id = 1")).toThrow(/readonly/i);
      expect(() => conn.exec("CREATE TABLE should_not_exist (a)")).toThrow(/readonly/i);
    } finally {
      conn.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns global stats", () => {
    const s = stats(db);
    expect(s.movies).toBeGreaterThan(1000);
    expect(s.shows).toBeGreaterThan(1000);
    expect(s.hoursViewed).toBeGreaterThan(0);
  });

  it("searches case-insensitively", () => {
    const r = listTitles(db, { q: "LOVE" });
    expect(r.total).toBeGreaterThan(0);
    expect(r.items.every((i) => i.title.toLowerCase().includes("love"))).toBe(true);
  });

  it("filters by kind and paginates 24 per page", () => {
    const r = listTitles(db, { kind: "movie", page: 2 });
    expect(r.items).toHaveLength(24);
    expect(r.items.every((i) => i.kind === "movie")).toBe(true);
    expect(r.page).toBe(2);
  });

  it("sorts by hours descending", () => {
    const r = listTitles(db, { sort: "hours" });
    const h = r.items.map((i) => i.hoursViewed);
    expect(h).toEqual([...h].sort((a, b) => b - a));
  });

  it("returns the detail of a known movie", () => {
    const d = titleDetail(db, "movie", 177);
    expect(d?.title).toBe("Through My Window");
    expect(d?.year).toBe(2022);
    expect(d?.hoursViewed).toBeGreaterThan(0);
  });

  it("returns the detail of a known show with seasons", () => {
    const d = titleDetail(db, "show", 2);
    expect(d?.kind).toBe("show");
    expect(d?.seasons.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown title", () => {
    expect(titleDetail(db, "movie", 99999999)).toBeNull();
  });

  describe("weeks in the top 10 (R14: one definition for card and detail)", () => {
    const card = (q: string, kind: string, id: number) =>
      listTitles(db, { q, kind }).items.find((i) => i.kind === kind && i.id === id);

    it("Through My Window (movie 177): 18 weeks on both card and detail", () => {
      expect(card("Through My Window", "movie", 177)?.weeksInTop10).toBe(18);
      expect(titleDetail(db, "movie", 177)?.weeksInTop10).toBe(18);
    });

    it("Stranger Things (show 92): MAX over seasons, same on card and detail", () => {
      expect(card("Stranger Things", "show", 92)?.weeksInTop10).toBe(29);
      expect(titleDetail(db, "show", 92)?.weeksInTop10).toBe(29);
    });

    it("card and detail agree for the 5 most-viewed pages of titles", () => {
      let checked = 0;
      for (let page = 1; page <= 5; page++) {
        for (const c of listTitles(db, { sort: "hours", page }).items) {
          expect(titleDetail(db, c.kind, c.id)?.weeksInTop10, `${c.kind} ${c.id} ${c.title}`).toBe(c.weeksInTop10);
          checked++;
        }
      }
      expect(checked).toBe(120);
    });

    it("a title that never entered the top 10 is 0 on both", () => {
      const never = listTitles(db, { sort: "title" }).items.find((i) => i.weeksInTop10 === 0);
      expect(never).toBeDefined();
      expect(titleDetail(db, never!.kind, never!.id)?.weeksInTop10).toBe(0);
    });
  });
});
