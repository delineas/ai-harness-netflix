// Reglas puras (git-rules.ts) + los git hooks reales (.githooks/) sobre repos
// temporales, con `-c core.hooksPath=<ruta absoluta>`: no tocan la config del repo.
// Las claves de prueba se construyen en tiempo de ejecución: ningún literal de
// este fichero tiene forma de clave, o el propio hook rechazaría commitearlo.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALLOW_MARKER, checkCommitBranch, checkNewBranches, findSecret, scanAddedLines, scanText } from "../../harness/git-rules.ts";

const hooks = resolve(import.meta.dirname, "../../.githooks");
const stripe = "sk_" + "live_" + "A1b2C3d4E5f6G7h8I9j0K1l2";
const github = "gh" + "p_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
const aws = "AK" + "IA" + "ABCDEFGHIJKLMNOP";

// ------------------------------------------------------------ reglas puras

describe("checkCommitBranch", () => {
  it("acepta tipo/nombre-con-guiones", () => {
    expect(checkCommitBranch("feat/harness").allow).toBe(true);
    expect(checkCommitBranch("fix/login-roto").allow).toBe(true);
  });
  it("rechaza main, mal formadas y rama desconocida", () => {
    for (const b of ["main", "master", "mi-rama", "Feat/x", "feat/Mal_Nombre", "feat/", "/x", "feat/a/b", null, ""]) {
      expect(checkCommitBranch(b).allow, String(b)).toBe(false);
    }
  });
});

describe("checkNewBranches", () => {
  it("acepta nombres con formato y deja crear main", () => {
    expect(checkNewBranches(["feat/a", "fix/b-c", "main"]).allow).toBe(true);
  });
  it("rechaza si alguna está mal nombrada y la nombra en el motivo", () => {
    const d = checkNewBranches(["feat/a", "mi-rama"]);
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toContain('"mi-rama"');
  });
});

describe("findSecret", () => {
  it("detecta formatos con prefijo propio", () => {
    for (const v of [stripe, github, aws, "xox" + "b-" + "1234567890-abcdefghij", "AI" + "za" + "A".repeat(35), "-----BEGIN " + "RSA PRIVATE KEY-----"]) {
      expect(findSecret(`const x = "${v}";`), v.slice(0, 6)).not.toBeNull();
    }
  });
  it("detecta valores largos asignados a KEY/TOKEN/SECRET", () => {
    expect(findSecret("TMDB_API_KEY=0123456789abcdef0123456789abcdef")).not.toBeNull(); // harness:allow-secret (fixture)
    expect(findSecret('{ "auth_token": "Zq81xLm29Wp04Tn77Vb3" }')).not.toBeNull(); // harness:allow-secret (fixture)
    expect(findSecret("Authorization: Bearer Zq81xLm29Wp04Tn77Vb3")).not.toBeNull(); // harness:allow-secret (fixture)
  });
  it("no se queja de código normal, placeholders ni referencias a variables", () => {
    for (const l of [
      "const key = process.env.TMDB_API_KEY;",
      "const TMDB_API_KEY = process.env.TMDB_API_KEY2;",
      "TMDB_API_KEY=your-key-here-1234567890",
      "TMDB_API_KEY=",
      "const maxTokens = 4096;",
      "password: string;",
      "Authorization: Bearer ${token}",
      "const skeleton = 'sk-learn';",
    ]) {
      expect(findSecret(l), l).toBeNull();
    }
  });
  it("la marca de excepción en la línea lo acepta", () => {
    expect(findSecret(`x = "${stripe}" // ${ALLOW_MARKER}`)).toBeNull();
  });
  it("enmascara el valor: nunca devuelve la clave entera", () => {
    const hit = findSecret(`x = "${stripe}"`);
    expect(hit?.preview).toBeDefined();
    expect(hit?.preview).not.toContain(stripe);
    expect(hit?.preview).not.toContain(stripe.slice(0, 12));
  });
});

describe("scanAddedLines / scanText", () => {
  const diff = (body: string) => `diff --git a/c.ts b/c.ts\n--- a/c.ts\n+++ b/c.ts\n@@ -1,0 +7,2 @@\n${body}\n`;
  it("solo cuenta líneas añadidas, con fichero y número de línea", () => {
    const hits = scanAddedLines(diff(`+ok\n+x = "${stripe}"`));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: "c.ts", line: 8 });
  });
  it("quitar una clave (línea borrada) no se castiga", () => {
    expect(scanAddedLines(diff(`-x = "${stripe}"`))).toEqual([]);
  });
  it("mensaje de commit: ignora comentarios de git", () => {
    expect(scanText(`feat: algo\n# ${stripe}`)).toEqual([]);
    expect(scanText(`feat: algo\n\nclave ${stripe}`)).toHaveLength(1);
  });
});

// ----------------------------------------------------------- hooks reales

let root: string;
let n = 0;

function git(cwd: string, args: string[], withHooks = true, env: NodeJS.ProcessEnv = process.env) {
  const pre = withHooks ? ["-c", `core.hooksPath=${hooks}`] : [];
  const r = spawnSync("git", [...pre, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

/** Repo nuevo con un commit inicial (hecho SIN hooks) en la rama `branch`. */
function repoOn(branch: string): string {
  const dir = join(root, `r${n++}`);
  mkdirSync(dir);
  git(dir, ["init", "-q", "-b", branch], false);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "inicial"], false);
  return dir;
}
const head = (dir: string) => git(dir, ["symbolic-ref", "--short", "-q", "HEAD"], false).out.trim();
const exists = (dir: string, b: string) => git(dir, ["rev-parse", "-q", "--verify", `refs/heads/${b}`], false).code === 0;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "githooks-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("commit: rama", () => {
  it("rechaza un commit en main (motivo con el nombre de la rama)", () => {
    const r = git(repoOn("main"), ["commit", "-q", "--allow-empty", "-m", "x"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('"main"');
  });
  it("rechaza un commit en una rama mal nombrada", () => {
    const dir = repoOn("Feat/Mal_Nombre");
    expect(git(dir, ["commit", "-q", "--allow-empty", "-m", "x"]).code).not.toBe(0);
  });
  it("rechaza un commit con HEAD suelto", () => {
    const dir = repoOn("feat/base");
    git(dir, ["checkout", "-q", "--detach"], false);
    expect(git(dir, ["commit", "-q", "--allow-empty", "-m", "x"]).code).not.toBe(0);
  });
  it("acepta un commit en una rama con formato", () => {
    const dir = repoOn("feat/ok");
    const r = git(dir, ["commit", "-q", "--allow-empty", "-m", "x"]);
    expect(r.code, r.out).toBe(0);
  });
  it("un merge que crea commit en main también se rechaza", () => {
    const dir = repoOn("main");
    git(dir, ["switch", "-q", "-c", "feat/a"], false);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "a"], false);
    git(dir, ["switch", "-q", "main"], false);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "m"], false);
    const r = git(dir, ["merge", "--no-ff", "-m", "merge", "feat/a"]);
    expect(r.code).not.toBe(0);
  });
});

describe("crear ramas (reference-transaction)", () => {
  it("rechaza switch -c con mal nombre y la rama no llega a existir", () => {
    const dir = repoOn("feat/ok");
    const r = git(dir, ["switch", "-c", "mi-rama"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("mi-rama");
    expect(exists(dir, "mi-rama")).toBe(false);
    expect(head(dir)).toBe("feat/ok");
  });
  it("rechaza branch y checkout -b con mal nombre", () => {
    const dir = repoOn("feat/ok");
    for (const args of [["branch", "Feat/Mal"], ["branch", "mal_nombre"], ["checkout", "-b", "otra"]]) {
      expect(git(dir, args).code, args.join(" ")).not.toBe(0);
    }
    expect(exists(dir, "Feat/Mal") || exists(dir, "mal_nombre") || exists(dir, "otra")).toBe(false);
  });
  it("límite conocido: git no avisa al hook al renombrar (branch -m), pero el commit siguiente sí se rechaza", () => {
    const dir = repoOn("feat/ok");
    git(dir, ["branch", "-m", "feo"]);
    expect(head(dir)).toBe("feo");
    expect(git(dir, ["commit", "-q", "--allow-empty", "-m", "x"]).code).not.toBe(0);
  });
  it("acepta ramas con formato y renombrar a un nombre bueno", () => {
    const dir = repoOn("feat/ok");
    expect(git(dir, ["switch", "-c", "fix/login-roto"]).code).toBe(0);
    expect(git(dir, ["branch", "-m", "fix/login-arreglado"]).code).toBe(0);
    expect(head(dir)).toBe("fix/login-arreglado");
  });
  it("deja crear main (un clon nuevo la crea con git switch main)", () => {
    const dir = repoOn("feat/base");
    expect(git(dir, ["branch", "main"]).code).toBe(0);
  });
  it("deja borrar una rama mal nombrada que ya existía", () => {
    const dir = repoOn("feat/ok");
    git(dir, ["branch", "vieja"], false);
    expect(git(dir, ["branch", "-D", "vieja"]).code).toBe(0);
    expect(exists(dir, "vieja")).toBe(false);
  });
  it("los commits normales no se ven afectados", () => {
    const dir = repoOn("feat/ok");
    expect(git(dir, ["commit", "-q", "--allow-empty", "-m", "otro"]).code).toBe(0);
  });
});

describe("commit: secretos", () => {
  it("rechaza un fichero nuevo con clave, sin volcarla entera", () => {
    const dir = repoOn("feat/ok");
    writeFileSync(join(dir, "config.local.ts"), `export const key = "${stripe}";\n`);
    git(dir, ["add", "config.local.ts"], false);
    const r = git(dir, ["commit", "-q", "-m", "feat: config"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("config.local.ts:1");
    expect(r.out).not.toContain(stripe);
    expect(r.out).not.toContain(stripe.slice(0, 14));
  });
  it("rechaza con `commit -a` un cambio no preparado en un fichero seguido", () => {
    const dir = repoOn("feat/ok");
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    git(dir, ["add", "a.ts"], false);
    git(dir, ["commit", "-q", "-m", "a"], false);
    writeFileSync(join(dir, "a.ts"), `export const a = "${github}";\n`);
    expect(git(dir, ["commit", "-q", "-a", "-m", "b"]).code).not.toBe(0);
  });
  it("rechaza una clave estilo .env (TMDB_API_KEY=...)", () => {
    const dir = repoOn("feat/ok");
    writeFileSync(join(dir, "x.txt"), "TMDB_API_KEY=0123456789abcdef0123456789abcdef\n"); // harness:allow-secret (fixture)
    git(dir, ["add", "x.txt"], false);
    expect(git(dir, ["commit", "-q", "-m", "x"]).code).not.toBe(0);
  });
  it("rechaza una clave en el mensaje del commit", () => {
    const dir = repoOn("feat/ok");
    const r = git(dir, ["commit", "-q", "--allow-empty", "-m", `feat: usa ${aws}`]);
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain(aws);
  });
  it("acepta un diff limpio, la marca de excepción y quitar una clave", () => {
    const dir = repoOn("feat/ok");
    writeFileSync(join(dir, "ok.ts"), "export const k = process.env.TMDB_API_KEY;\n");
    git(dir, ["add", "ok.ts"], false);
    expect(git(dir, ["commit", "-q", "-m", "ok"]).code).toBe(0);

    writeFileSync(join(dir, "doc.md"), `ejemplo: ${stripe} ${ALLOW_MARKER}\n`);
    git(dir, ["add", "doc.md"], false);
    expect(git(dir, ["commit", "-q", "-m", "doc"]).code).toBe(0);

    writeFileSync(join(dir, "doc.md"), "sin clave\n");
    expect(git(dir, ["commit", "-q", "-a", "-m", "quita"]).code).toBe(0);
  });
  it("no se queja de una clave que ya estaba en el fichero (solo cuenta lo añadido)", () => {
    const dir = repoOn("feat/ok");
    writeFileSync(join(dir, "old.txt"), `${stripe}\n`);
    git(dir, ["add", "old.txt"], false);
    git(dir, ["commit", "-q", "-m", "vieja"], false); // sin hooks: ya estaba
    writeFileSync(join(dir, "otro.txt"), "nada\n");
    git(dir, ["add", "otro.txt"], false);
    expect(git(dir, ["commit", "-q", "-m", "otro"]).code).toBe(0);
  });
});

describe("fallan cerrando", () => {
  // PATH con solo git y bash: sin node.
  function pathWithoutNode(): NodeJS.ProcessEnv {
    const bin = join(root, `bin${n++}`);
    mkdirSync(bin);
    for (const tool of ["git", "bash"]) {
      const which = spawnSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
      symlinkSync(which, join(bin, tool));
    }
    return { PATH: bin };
  }
  const run = (script: string, cwd: string, args: string[], input = "") =>
    spawnSync("/usr/bin/env", ["bash", join(hooks, script), ...args], { cwd, input, encoding: "utf8", env: pathWithoutNode() });

  it("sin node, pre-commit rechaza", () => {
    expect(run("pre-commit", repoOn("feat/ok"), []).status).not.toBe(0);
  });
  it("sin node, reference-transaction rechaza la creación de una rama pero no un borrado", () => {
    const dir = repoOn("feat/ok");
    const zero = "0".repeat(40);
    const sha = "1".repeat(40);
    expect(run("reference-transaction", dir, ["prepared"], `${zero} ${sha} refs/heads/x\n`).status).not.toBe(0);
    expect(run("reference-transaction", dir, ["prepared"], `${sha} ${zero} refs/heads/x\n`).status).toBe(0);
    expect(run("reference-transaction", dir, ["committed"], `${zero} ${sha} refs/heads/x\n`).status).toBe(0);
  });
  it("sin harness/git-cli.ts (hooks copiados solos) rechaza", () => {
    const solo = join(root, `solo${n++}`);
    mkdirSync(join(solo, ".githooks"), { recursive: true });
    for (const h of ["pre-commit", "reference-transaction"]) {
      spawnSync("cp", [join(hooks, h), join(solo, ".githooks", h)]);
    }
    const zero = "0".repeat(40);
    const sha = "1".repeat(40);
    const dir = repoOn("feat/ok");
    const a = spawnSync("bash", [join(solo, ".githooks/pre-commit")], { cwd: dir, encoding: "utf8" });
    const b = spawnSync("bash", [join(solo, ".githooks/reference-transaction"), "prepared"], { cwd: dir, input: `${zero} ${sha} refs/heads/x\n`, encoding: "utf8" });
    expect(a.status).not.toBe(0);
    expect(b.status).not.toBe(0);
  });
});
