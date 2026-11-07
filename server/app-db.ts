import { DatabaseSync } from "node:sqlite";

// One definition of the reviews schema, shared by `npm run setup` and the test database.
export const APP_SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('viewer','moderator'))
  );
  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    title_kind TEXT NOT NULL CHECK (title_kind IN ('movie','show')),
    title_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    created_at TEXT NOT NULL
  );
`;

export function openAppDb(path = "data/app.db"): DatabaseSync {
  return new DatabaseSync(path);
}
