// Reglas de los git hooks (.githooks/). Funciones puras: sin fs, sin git, sin process.
// La regla de nombres de rama es la misma que usa el hook de Claude (rules.ts).
//
// Rechazan:
//   1. un commit en main, en HEAD suelto o en una rama con mal nombre
//   2. crear una rama con mal nombre (hook reference-transaction)
//   3. un commit cuyo diff o mensaje lleve algo con forma de clave de API o token
//
// Es una red contra accidentes, no una garantía: `git commit --no-verify` se
// salta pre-commit y commit-msg (por eso hace falta también CI), y una clave
// sin forma reconocible no se detecta.

import { isValidBranch, type Decision } from "./rules.ts";

const block = (reason: string): Decision => ({ allow: false, reason });
const ALLOW: Decision = { allow: true };

// ------------------------------------------------------------------ ramas

const FORMAT_HINT = "tipo/nombre-con-guiones, en minúsculas (p. ej. feat/mi-cambio)";

/** Comprobación de pre-commit: ¿se puede hacer un commit en esta rama? */
export function checkCommitBranch(branch: string | null): Decision {
  if (!branch) {
    return block("No puedo saber la rama actual (¿HEAD suelto?): no se hace commit a ciegas. Crea una rama antes.");
  }
  if (!isValidBranch(branch)) {
    return block(`Rama "${branch}": los commits solo van en ramas con formato ${FORMAT_HINT}. Crea una rama antes.`);
  }
  return ALLOW;
}

/**
 * Comprobación al crear ramas. `main` se deja crear (un clon nuevo la crea al
 * hacer `git switch main`); en ella ya no se puede hacer commit.
 */
export function checkNewBranches(names: string[]): Decision {
  const bad = names.filter((n) => n !== "main" && !isValidBranch(n));
  if (bad.length === 0) return ALLOW;
  return block(`Rama ${bad.map((n) => `"${n}"`).join(", ")} rechazada: el nombre debe tener formato ${FORMAT_HINT}.`);
}

// ----------------------------------------------------------------- secretos

export type SecretHit = { kind: string; preview: string };
export type FileHit = SecretHit & { file: string; line: number };

/** Para aceptar un falso positivo concreto: poner esta marca en la misma línea. */
export const ALLOW_MARKER = "harness:allow-secret";

const PLACEHOLDER = /example|your|xxx|changeme|placeholder|dummy|fake|redacted|sample|\*\*\*/i;

/** Un valor asignado a algo llamado KEY/TOKEN/...: ¿parece una clave y no un nombre o un texto? */
function plausibleValue(v: string): boolean {
  if (v.length < 16) return false;
  if (!/\d/.test(v) || !/[A-Za-z]/.test(v)) return false;
  if (PLACEHOLDER.test(v)) return false;
  if (/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/.test(v)) return false; // process.env.X, import.meta.env.X
  return true;
}

// Formatos con prefijo propio: bastan por sí solos.
const KNOWN: { kind: string; re: RegExp }[] = [
  { kind: "clave privada (cabecera PEM)", re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  { kind: "clave de Stripe", re: /\b[sr]k_(?:live|test)_[0-9A-Za-z]{16,}/ },
  { kind: "token de GitHub", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/ },
  { kind: "clave de Anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: "clave tipo OpenAI (sk-...)", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { kind: "clave de acceso de AWS", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: "token de Slack", re: /\bxox[abeprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "clave de Google", re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

// Valor largo y con pinta de aleatorio asignado a un nombre que dice key/token/secret/...
const ASSIGNED = /(?:API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?([A-Za-z0-9_\-+/=.]{16,})/gi;
const BEARER = /\bBearer\s+([A-Za-z0-9._~+/-]{16,}=*)/g;

export function maskValue(v: string): string {
  return `${v.slice(0, 4)}… (${v.length} caracteres)`;
}

/** Primer secreto de una línea, con el valor enmascarado; null si no hay o lleva la marca de excepción. */
export function findSecret(line: string): SecretHit | null {
  if (line.includes(ALLOW_MARKER)) return null;
  for (const { kind, re } of KNOWN) {
    const m = re.exec(line);
    if (m) return { kind, preview: kind.startsWith("clave privada") ? "-----BEGIN…" : maskValue(m[0]) };
  }
  for (const m of line.matchAll(ASSIGNED)) {
    if (plausibleValue(m[1])) return { kind: "valor asignado a una clave/token", preview: maskValue(m[1]) };
  }
  for (const m of line.matchAll(BEARER)) {
    if (plausibleValue(m[1])) return { kind: "cabecera Bearer", preview: maskValue(m[1]) };
  }
  return null;
}

/** Secretos en un texto libre (mensaje de commit). Las líneas que empiezan por # son comentarios de git. */
export function scanText(text: string): { line: number; hit: SecretHit }[] {
  const out: { line: number; hit: SecretHit }[] = [];
  text.split("\n").forEach((l, i) => {
    if (l.startsWith("#")) return;
    const hit = findSecret(l);
    if (hit) out.push({ line: i + 1, hit });
  });
  return out;
}

/**
 * Secretos en las líneas AÑADIDAS de un diff unificado (`git diff --cached -U0`).
 * Las líneas borradas y el contexto no cuentan: quitar una clave no se castiga.
 */
export function scanAddedLines(diff: string): FileHit[] {
  const out: FileHit[] = [];
  let file = "?";
  let line = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) {
      const p = l.slice(4).split("\t")[0];
      file = p === "/dev/null" ? "?" : p.replace(/^b\//, "");
    } else if (l.startsWith("--- ") || l.startsWith("diff ")) {
      // cabeceras
    } else if (l.startsWith("@@")) {
      const m = /\+(\d+)/.exec(l);
      line = m ? Number(m[1]) : 0;
    } else if (l.startsWith("+")) {
      const hit = findSecret(l.slice(1));
      if (hit) out.push({ file, line, ...hit });
      line++;
    }
  }
  return out;
}
