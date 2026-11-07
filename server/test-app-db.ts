import { DatabaseSync } from "node:sqlite";
import { APP_SCHEMA } from "./app-db.ts";

// In-memory reviews database with made-up data, for unit tests and e2e.
// Same schema as the real one (APP_SCHEMA); emails use the reserved `.invalid` TLD,
// so no real personal data is ever needed to run the tests.
export function createTestAppDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(APP_SCHEMA);

  const addUser = db.prepare("INSERT INTO users (name, email, role) VALUES (?, ?, ?)");
  for (let i = 1; i <= 6; i++) {
    addUser.run(`Test User ${i}`, `test.user${i}@test.invalid`, i <= 2 ? "moderator" : "viewer");
  }

  const statuses = ["approved", "approved", "approved", "pending", "rejected"];
  const addReview = db.prepare(
    "INSERT INTO reviews (user_id, title_kind, title_id, rating, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (let i = 0; i < 15; i++) {
    const created = new Date(Date.UTC(2025, 0, 1 + i * 3, 12)).toISOString();
    addReview.run((i % 6) + 1, i % 2 ? "show" : "movie", (i % 3) + 1, (i % 5) + 1, `Test review ${i + 1}`, statuses[i % 5], created);
  }
  return db;
}
