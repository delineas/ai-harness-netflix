import { describe, expect, it } from "vitest";
import { decide, isValidBranch, splitCommand } from "../../harness/rules.ts";

const bash = (command: string, branch: string | null = "feat/harness") =>
  decide({ tool_name: "Bash", tool_input: { command }, cwd: "/x" }, branch);
const blocked = (command: string, branch: string | null = "feat/harness") => bash(command, branch).allow === false;

describe("isValidBranch", () => {
  it.each(["feat/harness", "fix/login-roto", "chore/a1-b2"])("acepta %s", (b) => {
    expect(isValidBranch(b)).toBe(true);
  });
  it.each(["main", "feat", "feat/", "Feat/x", "feat/x_y", "feat/-x", "feat/x--y", "feat/x/y", "", "feat/x y"])(
    "rechaza %j",
    (b) => {
      expect(isValidBranch(b)).toBe(false);
    },
  );
});

describe("splitCommand", () => {
  it("separa segmentos y quita comillas", () => {
    expect(splitCommand(`a "b c" 'd' && e | f`)).toEqual([
      { words: ["a", "b c", "d"], pipedIn: false },
      { words: ["e"], pipedIn: false },
      { words: ["f"], pipedIn: true },
    ]);
  });
  it("lanza con comillas sin cerrar", () => {
    expect(() => splitCommand(`echo "abc`)).toThrow();
    expect(() => splitCommand(`echo 'abc`)).toThrow();
  });
});

describe("datos sensibles", () => {
  it.each([
    "sqlite3 data/app.db 'select count(*) from users'",
    "sqlite3 'data/app.db' .tables",
    "cat data/app.db",
    "strings data/app.db-wal",
    "cd data && sqlite3 app.db .dump",
    "cp data/app.db /tmp/x",
    "bash -c 'sqlite3 data/app.db .schema'",
    'echo "$(cat data/app.db)"',
    "cat data/a*.db",
    "cat data/app.d?",
    "sqlite3 data/catalog.db 'select * from BATCH_RUNS'",
    "sqlite3 data/catalog.db 'select * from batch_runs'",
    "sqlite3 data/catalog.db .dump",
    "sqlite3 data/catalog.db .tables",
    "echo .dump | sqlite3 data/catalog.db",
    "sqlite3 data/catalog.db < q.sql",
    "sqlite3 $DB 'select 1'",
    "node -e \"new DatabaseSync('data/catalog.db').exec('select * from BATCH_X')\"",
  ])("bloquea: %s", (c) => {
    expect(blocked(c)).toBe(true);
  });

  it.each([
    "sqlite3 data/catalog.db 'select count(*) from titles'",
    "grep -rn BATCH_ server/",
    "ls data",
    "npm run verify",
    "which sqlite3",
    "echo hola",
  ])("permite: %s", (c) => {
    expect(blocked(c)).toBe(false);
  });

  it("bloquea Read/Grep/Glob/Write sobre app.db y permite el resto", () => {
    const call = (tool_name: string, tool_input: object) => decide({ tool_name, tool_input }, "feat/x").allow;
    expect(call("Read", { file_path: "/home/user/lab/alumno/data/app.db" })).toBe(false);
    expect(call("Read", { file_path: "data/app.db-wal" })).toBe(false);
    expect(call("Grep", { pattern: "@", path: "data/app.db" })).toBe(false);
    expect(call("Grep", { pattern: "x", glob: "*.db" })).toBe(false);
    expect(call("Glob", { pattern: "data/app.db" })).toBe(false);
    expect(call("Write", { file_path: "data/app.db" })).toBe(false);
    expect(call("Read", { file_path: "server/index.ts" })).toBe(true);
    // buscar el texto "app.db" en el código no es leer la base
    expect(call("Grep", { pattern: "app\\.db", path: "server" })).toBe(true);
  });
});

describe("git push", () => {
  it.each([
    "git push",
    "git push origin feat/x",
    "git push --force",
    "git -C /x push",
    "git -c core.editor=vi push",
    "git --no-pager push",
    "npm test && git push",
    "git status; git push",
    "env GIT_SSH=x git push",
    "sudo git push",
    "/usr/bin/git push",
    "bash -c 'git push'",
    "sh -lc \"git push origin main\"",
    "eval 'git push'",
    "echo $(git push)",
    'echo "$(git push)"',
    "echo `git push`",
    "(git push)",
    "git\\\n push",
  ])("bloquea: %s", (c) => {
    expect(blocked(c)).toBe(true);
  });

  it.each(["git status", "git pull", "git log --oneline", 'echo "git push"', "git diff push.txt"])("permite: %s", (c) => {
    expect(blocked(c)).toBe(false);
  });
});

describe("git commit", () => {
  it("permite en rama con formato", () => {
    expect(blocked("git commit -m x", "feat/harness")).toBe(false);
    expect(blocked("git add a.ts && git commit -m x", "fix/login-roto")).toBe(false);
  });

  it.each(["main", "master", "feat", "Feat/X", "feat/x_y", "feat/a/b"])("bloquea en rama %s", (b) => {
    expect(blocked("git commit -m x", b)).toBe(true);
  });

  it("bloquea si no se conoce la rama", () => {
    expect(blocked("git commit -m x", null)).toBe(true);
    expect(blocked("git commit -m x", "")).toBe(true);
  });

  it.each([
    "git checkout main && git commit -m x",
    "git switch main; git commit -m x",
    "cd ../otro && git commit -m x",
    "git -C ../otro commit -m x",
    "git --git-dir=../o/.git commit -m x",
    "GIT_DIR=../o/.git git commit -m x",
    "git rebase main && git commit -m x",
    "bash -c 'git checkout main && git commit -m x'",
  ])("bloquea (no sabe en qué rama cae): %s", (c) => {
    expect(blocked(c, "feat/harness")).toBe(true);
  });

  it("no pide rama para comandos que no son commit", () => {
    expect(blocked("git status", null)).toBe(false);
    expect(blocked("ls", "main")).toBe(false);
  });

  it("bloquea commit-tree en rama mala también", () => {
    expect(blocked("git commit-tree abc", "main")).toBe(true);
  });
});

describe("no puede decidir -> bloquea", () => {
  it.each([null, undefined, 3, "x", [], {}, { tool_name: "Bash" }, { tool_name: "Bash", tool_input: {} },
    { tool_name: "Bash", tool_input: { command: 5 } }, { tool_input: { command: "ls" } }])("entrada %j", (i) => {
    expect(decide(i, "feat/x").allow).toBe(false);
  });
  it("comando con comillas sin cerrar", () => {
    expect(blocked(`echo "hola`)).toBe(true);
  });
  it("shells anidados: sigue el anidamiento razonable y bloquea el excesivo", () => {
    const wrap = (c: string) => `bash -c '${c.replace(/'/g, `'\\''`)}'`;
    const nest = (c: string, n: number): string => (n === 0 ? c : nest(wrap(c), n - 1));
    expect(blocked(nest("git status", 2))).toBe(false);
    expect(blocked(nest("git push", 3))).toBe(true);
    expect(blocked(nest("git status", 8))).toBe(true); // demasiado profundo: no puede decidir
  });
  it("herramienta desconocida: permite (no es asunto de esta regla)", () => {
    expect(decide({ tool_name: "WebSearch", tool_input: { query: "x" } }, null).allow).toBe(true);
  });
  it("el motivo es un texto no vacío", () => {
    const d = bash("git push");
    expect(d.allow === false && d.reason.length > 10).toBe(true);
  });
});
