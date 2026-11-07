import { DatabaseSync } from "node:sqlite";

export function openAppDb(path = "data/app.db"): DatabaseSync {
  return new DatabaseSync(path);
}
