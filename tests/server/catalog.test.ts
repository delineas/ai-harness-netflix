import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openCatalog } from "../../server/catalog.ts";
import { listTitles, stats, titleDetail } from "../../server/titles.ts";

const db = openCatalog();

describe("catalog", () => {
  it("catalog connection is read-only", () => {
    const ro = new DatabaseSync("data/catalog.db", { readOnly: true });
    expect(() => ro.exec("UPDATE movie SET title = 'x' WHERE id = 1")).toThrow();
    ro.close();
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
});
