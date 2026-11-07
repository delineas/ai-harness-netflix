// Reglas del hook PreToolUse. Funciones puras: sin fs, sin git, sin process.
// La rama actual llega como argumento (la mira harness/guard.sh).
//
// Bloquea:
//   1. leer datos personales / tablas internas (data/app.db, tablas BATCH_*)
//   2. git push
//   3. git commit fuera de una rama con formato tipo/nombre-con-guiones
// Si no puede decidir (entrada ilegible, comando que no sabe analizar,
// rama desconocida al hacer commit...) bloquea: nunca deja pasar por duda.
//
// Es una red contra accidentes del modelo, no un sandbox: no ve variables
// (`g=git; $g push`), alias de git ni rutas construidas a trozos.

export type Decision = { allow: true } | { allow: false; reason: string };

const block = (reason: string): Decision => ({ allow: false, reason });
const ALLOW: Decision = { allow: true };

/** tipo/nombre-con-guiones, todo en minúsculas: feat/harness, fix/login-roto */
export const BRANCH_FORMAT = /^[a-z][a-z0-9]*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidBranch(branch: string): boolean {
  return BRANCH_FORMAT.test(branch);
}

// ---------------------------------------------------------------- shell

export type Segment = { words: string[]; pipedIn: boolean };

/**
 * Parte un comando de shell en segmentos (separados por ; & | salto de línea
 * ( ) y comillas invertidas) y palabras, quitando comillas.
 * Lanza Error si las comillas no cierran: no se puede analizar.
 */
export function splitCommand(command: string): Segment[] {
  const segments: Segment[] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  let pendingPipe = false; // el separador anterior era una tubería

  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endSegment = (piped: boolean) => {
    endWord();
    if (words.length > 0) {
      segments.push({ words, pipedIn: pendingPipe });
      pendingPipe = piped;
    } else {
      pendingPipe ||= piped;
    }
    words = [];
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      if (end < 0) throw new Error("comilla simple sin cerrar");
      word += command.slice(i + 1, end);
      inWord = true;
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < command.length) {
        if (command[j] === "\\" && j + 1 < command.length) {
          word += command[j + 1];
          j += 2;
        } else if (command[j] === '"') {
          closed = true;
          break;
        } else {
          word += command[j];
          j++;
        }
      }
      if (!closed) throw new Error("comilla doble sin cerrar");
      inWord = true;
      i = j;
    } else if (c === "\\") {
      if (command[i + 1] === "\n") {
        i++; // continuación de línea
        endWord();
      } else if (i + 1 < command.length) {
        word += command[i + 1];
        inWord = true;
        i++;
      }
    } else if (c === "|") {
      endSegment(true);
    } else if (c === ";" || c === "&" || c === "\n" || c === "(" || c === ")" || c === "`") {
      endSegment(false);
    } else if (c === " " || c === "\t" || c === "\r") {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endSegment(false);
  return segments;
}

const basename = (w: string) => w.slice(w.lastIndexOf("/") + 1);

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const WRAPPERS = new Set(["env", "command", "sudo", "exec", "time", "nice", "nohup", "xargs", "timeout", "builtin"]);
const BRANCH_CHANGERS = new Set(["checkout", "switch", "branch", "rebase", "worktree", "symbolic-ref", "bisect"]);
const GIT_OPTS_WITH_ARG = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"]);

type GitCall = { sub: string; redirected: boolean };
type Analysis = {
  segments: Segment[];
  git: GitCall[];
  contextChange: boolean; // cd/pushd o un git que cambia de rama
};

/** Palabra que hace de comando en un segmento (salta VAR=x y envoltorios). */
function commandWord(words: string[]): string | undefined {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) i++;
    else if (WRAPPERS.has(basename(w))) i++;
    else if (i > 0 && (w.startsWith("-") || /^\d+$/.test(w))) i++; // opciones del envoltorio
    else return basename(w);
  }
  return undefined;
}

export function analyzeCommand(command: string, depth = 0): Analysis {
  if (depth > 5) throw new Error("demasiado anidamiento de shells");
  const segments = splitCommand(command);
  const out: Analysis = { segments: [...segments], git: [], contextChange: false };
  const merge = (inner: Analysis) => {
    out.segments.push(...inner.segments);
    out.git.push(...inner.git);
    out.contextChange ||= inner.contextChange;
  };

  for (const seg of segments) {
    const { words } = seg;
    const redirectedByEnv = words.some((w) => /^GIT_(DIR|WORK_TREE)=/.test(w));

    words.forEach((w, i) => {
      const base = basename(w);
      if (base === "cd" || base === "pushd" || base === "popd") out.contextChange = true;

      if (base === "git") {
        let redirected = redirectedByEnv;
        let j = i + 1;
        while (j < words.length && words[j].startsWith("-")) {
          const opt = words[j];
          const name = opt.split("=")[0];
          if (name === "-C" || name === "--git-dir" || name === "--work-tree") redirected = true;
          j += GIT_OPTS_WITH_ARG.has(opt) ? 2 : 1;
        }
        const sub = words[j];
        if (sub !== undefined) {
          out.git.push({ sub, redirected });
          if (BRANCH_CHANGERS.has(sub)) out.contextChange = true;
        }
      }

      // bash -c "...", eval "...": analizar el texto que ejecutan
      if (SHELLS.has(base)) {
        const k = words.findIndex((x, idx) => idx > i && /^-[A-Za-z]*c[A-Za-z]*$/.test(x));
        if (k >= 0 && words[k + 1] !== undefined) merge(analyzeCommand(words[k + 1], depth + 1));
      }
      if (base === "eval") merge(analyzeCommand(words.slice(i + 1).join(" "), depth + 1));

      // $(...) o `...` dentro de una palabra entrecomillada
      if (w.includes("$(") || w.includes("`")) merge(analyzeCommand(w, depth + 1));
    });
  }
  return out;
}

// ---------------------------------------------------------- datos sensibles

const SENSITIVE_DB = /(^|[^A-Za-z0-9_])app\.db(-wal|-shm|-journal)?($|[^A-Za-z0-9_])/i;

/** ¿Esta ruta/glob puede apuntar a data/app.db? */
export function pointsAtAppDb(path: string): boolean {
  if (SENSITIVE_DB.test(path)) return true;
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (/[*?[]/.test(last) && last !== "") {
    // glob en el último componente: ¿casa con app.db?
    const re = new RegExp(
      "^" +
        last
          .replace(/[.+^${}()|\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".") +
        "$",
    );
    if (re.test("app.db")) return true;
  }
  return false;
}

const DB_HINT = /sqlite|\.db\b|DatabaseSync/i;

function checkSqlite(seg: Segment): Decision {
  const joined = seg.words.join(" ");
  if (seg.pipedIn || seg.words.some((w) => w.startsWith("<"))) {
    return block("sqlite3 recibe comandos por stdin/redirección: no puedo ver qué lee. Pásalos como argumento.");
  }
  if (/(^|\s)-(init|cmd)\b/.test(joined) && /\.\w+/.test(joined)) {
    return block("sqlite3 con -init/-cmd: no puedo decidir qué ejecuta.");
  }
  if (/batch/i.test(joined)) return block("Las tablas BATCH_* son internas: no las leas.");
  if (!seg.words.some((w) => w.endsWith("catalog.db"))) {
    return block("sqlite3 sin una base explícita (data/catalog.db): no puedo decidir qué lee.");
  }
  if (seg.words.some((w) => /^\.[a-z]/i.test(w.trim()) || /(^|[\s;])\.[a-z]+/i.test(w))) {
    return block("sqlite3 con comandos punto (.dump, .tables, .schema...) puede volcar tablas internas.");
  }
  if (/\battach\b/i.test(joined)) return block("sqlite3 con ATTACH: no puedo decidir qué base abre.");
  return ALLOW;
}

// -------------------------------------------------------------------- bash

export function decideBash(command: string, branch: string | null): Decision {
  let a: Analysis;
  try {
    a = analyzeCommand(command);
  } catch (e) {
    return block(`No puedo analizar el comando (${(e as Error).message}); lo bloqueo por seguridad.`);
  }

  // 1. datos sensibles
  for (const seg of a.segments) {
    if (seg.words.some(pointsAtAppDb)) {
      return block("data/app.db contiene datos personales (F6): no lo leas. Usa conteos o filas anonimizadas desde el código de la app.");
    }
    if (commandWord(seg.words) === "sqlite3") {
      const d = checkSqlite(seg);
      if (!d.allow) return d;
    }
  }
  if (SENSITIVE_DB.test(command)) {
    return block("data/app.db contiene datos personales (F6): no lo leas.");
  }
  if (/BATCH_/i.test(command) && DB_HINT.test(command)) {
    return block("Las tablas BATCH_* del catálogo son internas: no las leas.");
  }

  // 2. git push
  if (a.git.some((g) => g.sub === "push")) {
    return block("git push lo hace el usuario, no Claude.");
  }

  // 3. git commit
  if (a.git.some((g) => g.sub === "commit" || g.sub === "commit-tree")) {
    if (a.git.some((g) => g.redirected) || a.contextChange) {
      return block("El commit va junto a un cambio de rama/directorio (cd, checkout, -C...): no sé en qué rama caería. Hazlo en comandos separados.");
    }
    if (!branch) {
      return block("No puedo saber la rama actual (¿HEAD suelto o fuera de un repo?): no hago commit a ciegas.");
    }
    if (!isValidBranch(branch)) {
      return block(`Rama "${branch}": los commits solo van en ramas con formato tipo/nombre-con-guiones (p. ej. feat/mi-cambio). Crea una rama antes.`);
    }
  }
  return ALLOW;
}

// ------------------------------------------------------------ otras tools

// Campos de cada tool que son rutas (no el contenido buscado).
const PATH_FIELDS: Record<string, string[]> = {
  Read: ["file_path"],
  Grep: ["path", "glob"],
  Glob: ["pattern", "path"],
  Edit: ["file_path"],
  Write: ["file_path"],
  NotebookEdit: ["notebook_path"],
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Punto de entrada. `input` es el JSON del hook ya parseado; `branch` la rama
 * actual en el cwd (null si no se pudo averiguar).
 */
export function decide(input: unknown, branch: string | null): Decision {
  if (!isObject(input)) return block("Entrada del hook ilegible (no es un objeto JSON).");
  const { tool_name: tool, tool_input: toolInput } = input;
  if (typeof tool !== "string" || tool === "") return block("Entrada del hook sin tool_name.");
  if (!isObject(toolInput)) return block("Entrada del hook sin tool_input.");

  if (tool === "Bash") {
    const command = toolInput.command;
    if (typeof command !== "string") return block("Bash sin command: no puedo decidir.");
    return decideBash(command, branch);
  }

  for (const field of PATH_FIELDS[tool] ?? []) {
    const value = toolInput[field];
    if (typeof value === "string" && pointsAtAppDb(value)) {
      return block("data/app.db contiene datos personales (F6): no lo leas.");
    }
  }
  return ALLOW;
}
