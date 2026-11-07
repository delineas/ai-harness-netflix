// npm run paso -- NN
// Checks what must be in place when step NN of the course is done.
// It checks contracts (this input gives this output), not the shape of the code,
// so it works with whatever your agent wrote.
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { breakCase, touchedBy, CASES } from "./romper.mjs";

const root = process.cwd();
const CATALOG_SHA256 = "2cc4edee66ba91ce9d76ae388a1cfdfb18e263fc7f8dc01eddc335cc7d9243b0";
const results = [];

function check(label, fn) {
  let ok = false;
  let detail = "";
  try {
    const r = fn();
    if (r === true) ok = true;
    else if (typeof r === "string") detail = r;
    else if (r && typeof r === "object") ({ ok, detail = "" } = r);
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  results.push({ label, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${label}${!ok && detail ? `\n   → ${detail}` : ""}`);
}

async function checkAsync(label, fn) {
  let ok = false;
  let detail = "";
  try {
    const r = await fn();
    if (r === true) ok = true;
    else if (typeof r === "string") detail = r;
    else if (r && typeof r === "object") ({ ok, detail = "" } = r);
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  results.push({ label, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${label}${!ok && detail ? `\n   → ${detail}` : ""}`);
}

function sh(cmd, opts = {}) {
  const r = spawnSync("sh", ["-c", cmd], { cwd: root, encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path) {
  return existsSync(join(root, path));
}

function settings() {
  if (!exists(".claude/settings.json")) throw new Error("no existe .claude/settings.json");
  return JSON.parse(read(".claude/settings.json"));
}

function tableRows(text) {
  return text
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .filter((l) => !/^\|\s*:?-{2,}/.test(l.trim()))
    .slice(1);
}

function listFiles(dir, re) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  const out = [];
  for (const name of readdirSync(full)) {
    const p = join(full, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(join(dir, name), re));
    else if (re.test(name)) out.push(join(dir, name));
  }
  return out;
}

function hook(script, input) {
  // Run it the way Claude Code would: directly if it is executable (its shebang decides), else with sh.
  const full = join(root, script);
  const executable = (statSync(full).mode & 0o111) !== 0;
  const [cmd, args] = executable ? [full, []] : ["sh", [script]];
  const r = spawnSync(cmd, args, { cwd: root, input, encoding: "utf8", timeout: 600_000, env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function hookCommands(event) {
  const s = settings();
  const entries = s.hooks?.[event] ?? [];
  return entries.flatMap((e) => (e.hooks ?? []).map((h) => ({ matcher: e.matcher ?? "", command: h.command ?? "" })));
}

function cleanTree() {
  return sh("git status --porcelain -- . ':!.env'").out.trim() === "";
}

function withBroken(caso, fn) {
  // Save the files as they are now (committed or not) and put them back exactly as they were.
  const saved = new Map(touchedBy(caso).map((f) => [f, readFileSync(join(root, f), "utf8")]));
  breakCase(caso, { quiet: true });
  try {
    return fn();
  } finally {
    for (const [f, text] of saved) writeFileSync(join(root, f), text);
  }
}

function verify() {
  return sh("npm run verify --silent", { timeout: 900_000 });
}

function lastLines(text, n = 6) {
  return text.trim().split("\n").slice(-n).join("\n   ");
}

const guardInput = (command, cwd = root) => JSON.stringify({ cwd, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });

// ---------- checks per step ----------

const steps = {
  "02": () => {
    check("Node 24 o superior", () => Number(process.versions.node.split(".")[0]) >= 24 || `tienes Node ${process.versions.node}`);
    check("el catálogo está descargado y su huella cuadra", () => {
      if (!exists("data/catalog.db")) return "falta data/catalog.db: lanza npm run setup";
      const hash = createHash("sha256").update(readFileSync(join(root, "data/catalog.db"))).digest("hex");
      return hash === CATALOG_SHA256 || "la huella no cuadra: el catálogo ha cambiado. Bórralo y lanza npm run setup";
    });
    check("data/app.db existe", () => exists("data/app.db") || "lanza npm run setup");
    check("npm test pasa", () => {
      const r = sh("npm test --silent", { timeout: 300_000 });
      return r.code === 0 || lastLines(r.out);
    });
  },

  "03": () => {
    check("docs/incidents.md existe", () => exists("docs/incidents.md"));
    check("docs/incidents.md tiene una tabla con al menos 8 incidentes", () => {
      const n = tableRows(read("docs/incidents.md")).length;
      return n >= 8 || `tiene ${n} filas`;
    });
  },

  "04": () => {
    check("trabajas en una rama que no es main", () => {
      const b = sh("git branch --show-current").out.trim();
      return (b && b !== "main") || `estás en «${b || "(sin rama)"}»`;
    });
    check("AGENTS.md existe y es corto (60 líneas o menos)", () => {
      if (!exists("AGENTS.md")) return "no existe";
      const n = read("AGENTS.md").split("\n").length;
      return n <= 60 || `tiene ${n} líneas`;
    });
    check("CLAUDE.md importa AGENTS.md con @AGENTS.md", () => exists("CLAUDE.md") && read("CLAUDE.md").includes("@AGENTS.md"));
    check("docs/decisions.md decide las semanas en el top 10", () => {
      if (!exists("docs/decisions.md")) return "no existe";
      return /top[ -]?10/i.test(read("docs/decisions.md")) || "no habla del top 10";
    });
  },

  "05": async () => {
    check("package.json tiene el script verify", () => !!JSON.parse(read("package.json")).scripts?.verify);
    check("hay tests de estructura en tests/architecture/", () => listFiles("tests/architecture", /\.test\.ts$/).length > 0);
    check("hay tests e2e en e2e/", () => listFiles("e2e", /\.(spec|test)\.ts$/).length > 0);
    check("npm run verify pasa", () => {
      const r = verify();
      return r.code === 0 || `sale con ${r.code}:\n   ${lastLines(r.out)}`;
    });
    for (const caso of CASES) {
      check(`npm run verify falla con «romper ${caso}»`, () =>
        withBroken(caso, () => {
          const r = verify();
          return r.code !== 0 || "sigue en verde";
        }),
      );
    }
    check("la conexión de la app al catálogo no deja escribir", () => {
      const r = sh(`node --input-type=module -e 'import { openCatalog } from "./server/catalog.ts"; const db = openCatalog(); try { db.exec("BEGIN"); db.exec("UPDATE movie SET title = title WHERE id = 177"); console.log("WROTE") } catch { console.log("REFUSED") } finally { try { db.exec("ROLLBACK") } catch {} }'`);
      return r.out.includes("REFUSED") || "openCatalog() deja escribir en el catálogo";
    });
    await checkAsync("la tarjeta y el detalle dan las mismas semanas en el top 10", () =>
      withServer(async (base) => {
        const list = await (await fetch(`${base}/api/titles?q=Through%20My%20Window&kind=movie`)).json();
        const card = list.items.find((t) => t.id === 177);
        const detail = await (await fetch(`${base}/api/titles/movie/177`)).json();
        const a = card?.weeksInTop10;
        const b = detail?.weeksInTop10;
        return (a !== undefined && a === b) || `tarjeta ${a}, detalle ${b}`;
      }),
    );
    await checkAsync("el servidor sigue vivo después de pedir /favicon.ico", () =>
      withServer(async (base) => {
        await fetch(`${base}/favicon.ico`).catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        const r = await fetch(`${base}/api/stats`).catch(() => null);
        return r?.status === 200 || "/api/stats ya no contesta";
      }),
    );
  },

  "06": () => {
    let s;
    check(".claude/settings.json existe y es JSON válido", () => {
      s = settings();
      return true;
    });
    if (!s) return;
    const deny = s.permissions?.deny ?? [];
    const ask = s.permissions?.ask ?? [];
    const has = (list, re) => list.some((r) => re.test(r));
    check("deny protege los tests e2e", () => has(deny, /^Edit\(.*e2e/) || "falta Edit(/e2e/**)");
    check("deny protege los tests de estructura", () => has(deny, /^Edit\(.*tests\/architecture/) || "falta Edit(/tests/architecture/**)");
    check("deny protege el script de npm run verify", () => {
      const cmd = JSON.parse(read("package.json")).scripts?.verify ?? "";
      const file = cmd.split(/\s+/).find((w) => /\.(m?[jt]s|sh)$/.test(w));
      if (!file) return `no encuentro el fichero que lanza «${cmd}»`;
      return has(deny, new RegExp(`^Edit\\(.*${file.replace(/^\.\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)) || `falta Edit(/${file})`;
    });
    check("deny protege la configuración del agente", () => has(deny, /^Edit\(.*\.claude/) || "falta Edit(/.claude/**)");
    check("deny protege el catálogo", () => has(deny, /^Edit\(.*catalog\.db/) || "falta Edit(/data/catalog.db)");
    check("deny protege las herramientas del curso", () => has(deny, /^Edit\(.*curso/) || "falta Edit(/curso/**)");
    check("deny bloquea git push", () => has(deny, /^Bash\(git push/) || "falta Bash(git push:*)");
    check("deny bloquea git commit", () => has(deny, /^Bash\(git commit/) || "falta Bash(git commit:*)");
    check("hay al menos una regla ask", () => ask.length > 0 || "ask está vacío");
    check("ninguna regla de ruta usa Write(...)", () => {
      const bad = [...deny, ...ask, ...(s.permissions?.allow ?? [])].filter((r) => /^Write\(/.test(r));
      return bad.length === 0 || `cámbialas por Edit(...): ${bad.join(", ")}`;
    });
  },

  "07": () => {
    check("existe harness/guard.sh", () => exists("harness/guard.sh"));
    check("settings.json lanza harness/guard.sh antes de cada Bash", () =>
      hookCommands("PreToolUse").some((h) => /Bash/.test(h.matcher) && h.command.includes("harness/guard.sh")) || "falta la entrada PreToolUse",
    );
    check("deny protege harness/", () => (settings().permissions?.deny ?? []).some((r) => /^Edit\(.*harness/.test(r)) || "falta Edit(/harness/**)");
    const cases = [
      ["git status", 0],
      ['sqlite3 data/app.db "select email from users"', 2],
      ['sqlite3 data/catalog.db "select * from BATCH_JOB_EXECUTION"', 2],
      ["git -C . push origin main", 2],
    ];
    for (const [cmd, want] of cases) {
      check(`guard: «${cmd}» → exit ${want}`, () => {
        const r = hook("harness/guard.sh", guardInput(cmd));
        return r.code === want || `exit ${r.code}${r.out ? `: ${r.out.trim()}` : ""}`;
      });
    }
    check("guard: JSON roto → exit 2", () => {
      const r = hook("harness/guard.sh", "{broken");
      return r.code === 2 || `exit ${r.code}`;
    });
    const tmp = mkdtempSync(join(tmpdir(), "paso07-"));
    try {
      spawnSync("git", ["init", "-q", "-b", "main", tmp]);
      check("guard: «git commit» en main → exit 2", () => {
        const r = hook("harness/guard.sh", guardInput('git commit -m "x"', tmp));
        return r.code === 2 || `exit ${r.code}`;
      });
      spawnSync("git", ["-C", tmp, "switch", "-q", "-c", "feat/top10-history"]);
      check("guard: «git commit» en feat/top10-history → exit 0", () => {
        const r = hook("harness/guard.sh", guardInput('git commit -m "x"', tmp));
        return r.code === 0 || `exit ${r.code}${r.out ? `: ${r.out.trim()}` : ""}`;
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },

  "08": () => {
    check("existe harness/stop.sh", () => exists("harness/stop.sh"));
    check("settings.json lanza harness/stop.sh al terminar", () => hookCommands("Stop").some((h) => h.command.includes("harness/stop.sh")) || "falta la entrada Stop");
    check("deny protege harness/", () => (settings().permissions?.deny ?? []).some((r) => /^Edit\(.*harness/.test(r)));
    const input = (active) => JSON.stringify({ cwd: root, hook_event_name: "Stop", stop_hook_active: active });
    check("stop: árbol limpio → exit 0", () => {
      if (!cleanTree()) return "el árbol tiene cambios: haz commit y vuelve a lanzarlo";
      const r = hook("harness/stop.sh", input(false));
      return r.code === 0 || `exit ${r.code}`;
    });
    check("stop: con «romper filtro» → exit 2", () =>
      withBroken("filtro", () => {
        const r = hook("harness/stop.sh", input(false));
        return r.code === 2 || `exit ${r.code}`;
      }),
    );
    check("stop: con «romper filtro» y stop_hook_active → deja parar (exit 0) con un aviso", () =>
      withBroken("filtro", () => {
        const r = hook("harness/stop.sh", input(true));
        return (r.code === 0 && r.out.trim() !== "") || `exit ${r.code}, salida «${r.out.trim()}»`;
      }),
    );
  },

  "09": () => {
    let sb;
    check("settings.json tiene el sandbox activado", () => {
      sb = settings().sandbox;
      return sb?.enabled === true || "sandbox.enabled no es true";
    });
    if (!sb) return;
    check("failIfUnavailable: true", () => sb.failIfUnavailable === true);
    check("allowUnsandboxedCommands: false", () => sb.allowUnsandboxedCommands === false);
    check("ningún comando fuera del sandbox", () => (sb.excludedCommands ?? []).length === 0 || `excluidos: ${sb.excludedCommands.join(", ")}`);
    const denyRead = sb.filesystem?.denyRead ?? [];
    check("el sandbox no deja leer data/app.db", () => denyRead.some((p) => p.includes("app.db")));
    check("el sandbox no deja leer .env", () => denyRead.some((p) => /(^|\/)\.env$/.test(p)));
    const deny = settings().permissions?.deny ?? [];
    check("deny de lectura para data/app.db", () => deny.some((r) => /^Read\(.*app\.db/.test(r)) || "falta Read(/data/app.db)");
    check("deny de lectura para .env", () => deny.some((r) => /^Read\(.*\.env/.test(r)) || "falta Read(/.env)");
    check(".env está en .gitignore", () => /^\/?\.env$/m.test(read(".gitignore")));
  },

  "10": () => {
    check("git usa .githooks (core.hooksPath)", () => sh("git config core.hooksPath").out.trim() === ".githooks" || "lanza: git config core.hooksPath .githooks");
    check("hay un workflow de CI que lanza npm run verify", () => {
      const files = listFiles(".github/workflows", /\.ya?ml$/);
      if (!files.length) return "no hay .github/workflows/*.yml";
      return files.some((f) => read(f).includes("npm run verify")) || "ningún workflow lanza npm run verify";
    });
    const hooksDir = join(root, ".githooks");
    const tmp = mkdtempSync(join(tmpdir(), "paso10-"));
    const g = (args) => spawnSync("git", ["-c", `core.hooksPath=${hooksDir}`, "-c", "user.name=paso", "-c", "user.email=paso@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: tmp, encoding: "utf8" });
    try {
      // A throwaway clone: whatever happens here never touches your repo.
      const c = spawnSync("git", ["clone", "-q", root, tmp], { encoding: "utf8" });
      if (c.status !== 0) throw new Error(c.stderr);
      check("git rechaza un commit en main", () => {
        const s = spawnSync("git", ["switch", "-q", "main"], { cwd: tmp, encoding: "utf8" });
        if (s.status !== 0) return `no hay rama main: ${s.stderr.trim()}`;
        const r = g(["commit", "--allow-empty", "-q", "-m", "feat: prueba"]);
        return r.status !== 0 || "el commit pasó";
      });
      check("git rechaza una rama mal nombrada", () => {
        const r = g(["switch", "-q", "-c", "mi-rama"]);
        return r.status !== 0 || "la rama se creó";
      });
      check("git acepta un commit en feat/prueba-paso-10", () => {
        const s = g(["switch", "-q", "-c", "feat/prueba-paso-10"]);
        if (s.status !== 0) return `no deja crear la rama: ${(s.stderr || s.stdout).trim()}`;
        const r = g(["commit", "--allow-empty", "-q", "-m", "feat: prueba"]);
        return r.status === 0 || `rechazado: ${(r.stderr || r.stdout).trim()}`;
      });
      check("git rechaza un commit con una clave de API", () => {
        writeFileSync(join(tmp, "config.local.ts"), `export const key = "${["sk", "live", "51Hk2vQeZ8xT4mN7pR9sW3yL6bJ0cF5dG1aK8uE2iO4"].join("_")}";\n`);
        spawnSync("git", ["add", "config.local.ts"], { cwd: tmp });
        const r = g(["commit", "-q", "-m", "feat: config"]);
        return r.status !== 0 || "el commit con la clave pasó";
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },

  "11": async () => {
    check("docs/audit.md tiene una fila por incidente, con su evidencia", () => {
      if (!exists("docs/audit.md")) return "no existe docs/audit.md";
      const n = tableRows(read("docs/audit.md")).length;
      return n >= 8 || `tiene ${n} filas`;
    });
    for (const nn of ["04", "05", "06", "07", "08", "09", "10"]) {
      console.log(`\n— lo del paso ${nn}`);
      await steps[nn]();
    }
  },
};

async function withServer(fn) {
  const port = 3900 + Math.floor(Math.random() * 90);
  if (!exists("dist/index.html")) sh("npm run build --silent");
  const child = spawn(process.execPath, ["server/index.ts"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 50; i++) {
      const ok = await fetch(`${base}/api/stats`).then((r) => r.ok).catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return await fn(base);
  } finally {
    child.kill();
  }
}

const nn = (process.argv[2] ?? "").padStart(2, "0");
if (!steps[nn]) {
  console.log(`Uso: npm run paso -- NN   (pasos: ${Object.keys(steps).join(", ")})`);
  process.exit(1);
}
console.log(`Paso ${nn}\n`);
await steps[nn]();
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `\n${bad} de ${results.length} sin cumplir.` : `\nPaso ${nn} hecho: ${results.length} de ${results.length}.`);
process.exit(bad ? 1 : 0);
