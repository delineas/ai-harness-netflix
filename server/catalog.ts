import { DatabaseSync } from "node:sqlite";

export function openCatalog(path = "data/catalog.db"): DatabaseSync {
  return new DatabaseSync(path);
}
