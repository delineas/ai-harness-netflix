// Ejercita el programa real (harness/guard.sh) con repos git temporales:
// lo que prueba es lo mismo que Claude Code ejecutará como hook.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const guard = resolve(import.meta.dirname, "../../harness/guard.sh");
let root: string;
const repos: Record<string, string> = {};

function repoOn(name: string, branch: string): string {
  const dir = join(root, name);
  spawnSync("git", ["init", "-q", dir]);
  spawnSync("git", ["-C", dir, "symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  return dir;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "guard-"));
  repos.good = repoOn("good", "feat/harness");
  repos.main = repoOn("main", "main");
  repos.bad = repoOn("bad", "Feat/Mal_Nombre");
  // HEAD suelto: apunta a un commit
  repos.detached = join(root, "detached");
  spawnSync("git", ["init", "-q", repos.detached]);
  spawnSync("git", ["-C", repos.detached, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "i"]);
  spawnSync("git", ["-C", repos.detached, "checkout", "-q", "--detach"]);
  repos.plain = join(root, "plain");
  spawnSync("mkdir", ["-p", repos.plain]);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function run(stdin: string) {
  const r = spawnSync("bash", [guard], { input: stdin, encoding: "utf8" });
  return { code: r.status, err: r.stderr };
}
const hook = (cwd: string, command: string) =>
  run(JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }));

describe("guard.sh", () => {
  it("permite un comando inocuo (exit 0, sin salida)", () => {
    expect(hook(repos.good, "ls")).toEqual({ code: 0, err: "" });
  });

  it("git push: exit 2 con motivo", () => {
    const r = hook(repos.good, "git push origin feat/harness");
    expect(r.code).toBe(2);
    expect(r.err).toContain("git push");
  });

  it("sqlite3 sobre app.db: exit 2", () => {
    const r = hook(repos.good, "sqlite3 data/app.db 'select 1'");
    expect(r.code).toBe(2);
    expect(r.err).toContain("app.db");
  });

  it("Read de app.db: exit 2", () => {
    const r = run(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "/x/data/app.db" }, cwd: repos.good }));
    expect(r.code).toBe(2);
  });

  it("commit en rama con formato: exit 0 (mira la rama del cwd que le llega)", () => {
    expect(hook(repos.good, "git commit -m x").code).toBe(0);
  });

  it("commit en main / rama mal formada: exit 2 con la rama en el motivo", () => {
    const m = hook(repos.main, "git commit -m x");
    expect(m.code).toBe(2);
    expect(m.err).toContain('"main"');
    expect(hook(repos.bad, "git commit -m x").code).toBe(2);
  });

  it("commit sin poder saber la rama (HEAD suelto, sin repo, cwd inexistente, sin cwd): exit 2", () => {
    expect(hook(repos.detached, "git commit -m x").code).toBe(2);
    expect(hook(repos.plain, "git commit -m x").code).toBe(2);
    expect(hook(join(root, "no-existe"), "git commit -m x").code).toBe(2);
    expect(run(JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit -m x" } })).code).toBe(2);
  });

  it("comandos que no son commit no necesitan rama", () => {
    expect(hook(repos.plain, "git status").code).toBe(0);
    expect(hook(repos.main, "ls").code).toBe(0);
  });

  it("entrada ilegible o incompleta: exit 2 (nunca 1)", () => {
    for (const bad of ["", "no es json", "{", "null", "[]", "{}", '{"tool_name":"Bash"}']) {
      const r = run(bad);
      expect(r.code, `entrada ${JSON.stringify(bad)}`).toBe(2);
      expect(r.err).toContain("guard:");
    }
  });

  it("si falla node (no está en el PATH) también sale con 2", () => {
    const r = spawnSync("/bin/bash", [guard], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" }, cwd: repos.good }),
      encoding: "utf8",
      env: { PATH: "/nonexistent" },
    });
    expect(r.status).toBe(2);
  });
});
