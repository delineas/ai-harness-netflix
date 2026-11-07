// npm run romper -- <caso>
// Breaks one known thing in the app, always the same way, so that a step of the course
// can show which piece of the harness catches it. Undo it with: git checkout .
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BREAKS = {
  "sin-tests": {
    what: "el patrón de Vitest ya no encuentra ningún test",
    file: "vitest.config.ts",
    find: /include:\s*\[\s*"tests\/\*\*\/\*\.test\.ts"\s*\]/,
    replace: 'include: ["tests/**/*.nothing.ts"]',
  },
  "horas-vistas": {
    what: "las horas vistas suman las filas semanales en lugar de las semestrales",
    file: "server/domain/hours.ts",
    find: /duration === "SEMI_ANNUALLY"/,
    replace: 'duration === "WEEKLY"',
  },
  "import-backend": {
    what: "la web importa un fichero del servidor",
    file: "web/src/main.ts",
    find: /^/,
    replace: 'import "../../server/domain/hours.ts";\n',
  },
  filtro: {
    what: "el filtro de tipo lee un atributo vacío en lugar del valor elegido",
    file: "web/src/main.ts",
    find: /kind: \$<HTMLSelectElement>\("kind"\)\.value,/,
    replace: 'kind: $<HTMLSelectElement>("kind").dataset.value ?? "",',
  },
  catalogo: {
    what: "la app abre el catálogo en escritura",
    file: "server/catalog.ts",
    find: /readOnly:\s*true/,
    replace: "readOnly: false",
    missing: "No encuentro «readOnly: true» en server/catalog.ts. Este caso sirve cuando el catálogo ya se abre en solo lectura (paso 05).",
  },
};

export const CASES = Object.keys(BREAKS);

export function touchedBy(name) {
  return BREAKS[name] ? [BREAKS[name].file] : [];
}

export function breakCase(name, { quiet = false } = {}) {
  const b = BREAKS[name];
  if (!b) throw new Error(`No conozco el caso «${name}». Casos: ${CASES.join(", ")}`);
  if (!existsSync(b.file)) throw new Error(`No existe ${b.file}.`);
  const before = readFileSync(b.file, "utf8");
  if (name === "import-backend" && before.includes(b.replace.trim())) return [b.file];
  if (!b.find.test(before)) {
    throw new Error(b.missing ?? `No encuentro la línea que rompe «${name}» en ${b.file}. ¿Ha cambiado ese fichero? Compáralo con: git diff inicio -- ${b.file}`);
  }
  writeFileSync(b.file, before.replace(b.find, b.replace));
  if (!quiet) {
    console.log(`Roto: ${b.what}.`);
    console.log(`Fichero: ${b.file}`);
    console.log("Deshazlo con: git checkout .");
  }
  return [b.file];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  if (!name) {
    console.log("Uso: npm run romper -- <caso>\n");
    for (const [k, b] of Object.entries(BREAKS)) console.log(`  ${k.padEnd(15)} ${b.what}`);
    process.exit(1);
  }
  try {
    breakCase(name);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
