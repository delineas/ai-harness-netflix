import type { DatabaseSync } from "node:sqlite";

export function listUsers(db: DatabaseSync) {
  return db.prepare("SELECT id, name FROM users ORDER BY name").all() as { id: number; name: string }[];
}

export function approvedReviews(db: DatabaseSync, kind: string, id: number) {
  return db
    .prepare(
      `SELECT r.id, u.name AS author, r.rating, r.body, r.created_at AS createdAt
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.title_kind = ? AND r.title_id = ? AND r.status = 'approved'
       ORDER BY r.created_at DESC, r.id DESC`,
    )
    .all(kind, id);
}

export function createReview(
  db: DatabaseSync,
  kind: string,
  id: number,
  input: { userId?: unknown; rating?: unknown; body?: unknown },
): { review?: unknown; error?: string } {
  const rating = Number(input.rating);
  const userId = Number(input.userId);
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be 1 to 5" };
  if (!body) return { error: "Text is required" };
  if (body.length > 2000) return { error: "Text is too long" };
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return { error: "Unknown user" };
  const now = new Date().toISOString();
  const res = db
    .prepare(
      "INSERT INTO reviews (user_id, title_kind, title_id, rating, body, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    )
    .run(userId, kind, id, rating, body, now);
  return {
    review: { id: Number(res.lastInsertRowid), rating, body, status: "pending", createdAt: now },
  };
}

export function isModerator(db: DatabaseSync, header: string | undefined): boolean {
  if (!header) return false;
  const row = db.prepare("SELECT role FROM users WHERE id = ?").get(Number(header)) as
    | { role: string }
    | undefined;
  return row?.role === "moderator";
}

export function pendingReviews(db: DatabaseSync) {
  return db
    .prepare(
      `SELECT r.id, u.name AS author, r.title_kind AS titleKind, r.title_id AS titleId,
              r.rating, r.body, r.status, r.created_at AS createdAt
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.status = 'pending' ORDER BY r.created_at, r.id`,
    )
    .all();
}

export function moderate(db: DatabaseSync, id: number, status: unknown) {
  if (status !== "approved" && status !== "rejected") return null;
  const res = db.prepare("UPDATE reviews SET status = ? WHERE id = ?").run(status, id);
  if (Number(res.changes) === 0) return null;
  return { id, status };
}
