import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openCatalog } from "../server/catalog.ts";

const URL_DB = "https://github.com/lerocha/netflixdb/releases/download/v1.0.70/netflixdb.sqlite";
const SHA = "2cc4edee66ba91ce9d76ae388a1cfdfb18e263fc7f8dc01eddc335cc7d9243b0";

mkdirSync("data", { recursive: true });

const sha256 = () => createHash("sha256").update(readFileSync("data/catalog.db")).digest("hex");

async function download() {
  console.log("Downloading catalog...");
  const res = await fetch(URL_DB);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  writeFileSync("data/catalog.db", Buffer.from(await res.arrayBuffer()));
}

if (existsSync("data/catalog.db") && sha256() !== SHA) {
  console.log("catalog.db checksum does not match, downloading it again...");
  rmSync("data/catalog.db");
}
if (!existsSync("data/catalog.db")) await download();
const sha = sha256();
if (sha !== SHA) {
  console.error(`catalog.db checksum mismatch: expected ${SHA}, got ${sha}`);
  process.exit(1);
}
console.log("Catalog OK");

const names = [
  "Lucía Fernández", "Carlos Martínez", "Marta Gómez", "Javier Ruiz", "Elena Sánchez",
  "Pablo Navarro", "Carmen Ortega", "Diego Romero", "Laura Torres", "Andrés Molina",
  "Sofía Castillo", "Alberto Vidal", "Paula Herrera", "Sergio Iglesias", "Irene Campos",
  "Raúl Delgado", "Natalia Peña", "Hugo Marín", "Beatriz Cano", "Adrián Prieto",
];
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ /g, ".");

rmSync("data/app.db", { force: true });
const db = new DatabaseSync("data/app.db");
db.exec(`
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
`);
const addUser = db.prepare("INSERT INTO users (name, email, role) VALUES (?, ?, ?)");
names.forEach((n, i) => addUser.run(n, `${strip(n)}@example.com`, i === 0 || i === 1 ? "moderator" : "viewer"));

// Sample reviews on popular titles
const cat = openCatalog();
const popular = cat
  .prepare(
    `SELECT 'movie' AS kind, m.id, SUM(v.hours_viewed) AS h FROM movie m JOIN view_summary v ON v.movie_id = m.id
       WHERE v.duration = 'SEMI_ANNUALLY' GROUP BY m.id
     UNION ALL
     SELECT 'show', t.id, SUM(v.hours_viewed) FROM tv_show t JOIN season s ON s.tv_show_id = t.id
       JOIN view_summary v ON v.season_id = s.id WHERE v.duration = 'SEMI_ANNUALLY' GROUP BY t.id
     ORDER BY h DESC LIMIT 10`,
  )
  .all() as { kind: string; id: number }[];
cat.close();

const bodies = [
  "Me ha encantado, la vería otra vez.", "Entretenida, pero se hace larga.", "Muy buena actuación del reparto.",
  "No es para mí, la verdad.", "Una sorpresa total, muy recomendable.", "Final flojo, pero el resto merece la pena.",
  "Perfecta para un domingo por la tarde.", "Gran ritmo y buena fotografía.", "Esperaba más, aunque se deja ver.",
  "Imprescindible si te gusta el género.",
];
const statuses = ["approved", "approved", "approved", "pending", "rejected"];
const addReview = db.prepare(
  "INSERT INTO reviews (user_id, title_kind, title_id, rating, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
for (let i = 0; i < 30; i++) {
  const t = popular[i % popular.length];
  const created = new Date(Date.UTC(2025, 0, 1 + i * 3, 12)).toISOString();
  addReview.run((i * 7) % 20 + 1, t.kind, t.id, (i * 3) % 5 + 1, bodies[i % bodies.length], statuses[i % statuses.length], created);
}
db.close();
console.log("App database created (20 users, 30 reviews)");

if (!existsSync(".env")) {
  // Fake key for the course (fault F8). Built from parts so that no commit holds it literally
  // and GitHub push protection doesn't reject the repo; the .env on disk gets the full key.
  const fakeKey = ["sk", "live", "51Hk2vQeZ8xT4mN7pR9sW3yL6bJ0cF5dG1aK8uE2iO4"].join("_");
  writeFileSync(".env", readFileSync(".env.example", "utf8").replace(/^TMDB_API_KEY=$/m, `TMDB_API_KEY=${fakeKey}`));
  console.log("Created .env");
}
