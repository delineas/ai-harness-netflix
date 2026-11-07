import { describe, expect, it } from "vitest";
import { createTestAppDb } from "../../server/test-app-db.ts";
import { approvedReviews, isModerator, pendingReviews } from "../../server/reviews.ts";

const db = createTestAppDb();

describe("reviews", () => {
  it("approved reviews contain no emails", () => {
    const rows = db.prepare("SELECT title_kind k, title_id i FROM reviews WHERE status = 'approved' LIMIT 1").get() as any;
    const list = approvedReviews(db, rows.k, rows.i);
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toContain("@");
  });

  it("pending reviews contain no emails", () => {
    expect(JSON.stringify(pendingReviews(db))).not.toContain("@");
  });

  it("moderation is refused to a viewer", () => {
    const viewer = db.prepare("SELECT id FROM users WHERE role = 'viewer' LIMIT 1").get() as { id: number };
    expect(isModerator(db, String(viewer.id))).toBe(false);
    expect(isModerator(db, undefined)).toBe(false);
  });

  it("moderation is allowed to a moderator", () => {
    const mod = db.prepare("SELECT id FROM users WHERE role = 'moderator' LIMIT 1").get() as { id: number };
    expect(isModerator(db, String(mod.id))).toBe(true);
  });
});
