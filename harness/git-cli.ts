// Adaptador fino entre los git hooks (.githooks/) y las reglas (git-rules.ts).
//   commit-branch [--branch=NOMBRE]   ¿se puede hacer commit en esa rama? (sin flag: rama desconocida)
//   new-branches                      stdin: un nombre de rama por línea (las que se están creando)
//   secrets [--text]                  stdin: diff unificado (con --text: un mensaje de commit)
// Salida: 0 permite; 1 rechaza (motivo por stderr). Cualquier fallo -> 1.
// Nunca imprime el secreto entero: solo fichero, línea, tipo y 4 caracteres.
import { readFileSync } from "node:fs";
import { checkCommitBranch, checkNewBranches, scanAddedLines, scanText } from "./git-rules.ts";
import type { Decision } from "./rules.ts";

function report(d: Decision): number {
  if (d.allow) return 0;
  process.stderr.write(`git-hook: ${d.reason}\n`);
  return 1;
}

function main(): number {
  const [cmd, ...flags] = process.argv.slice(2);

  if (cmd === "commit-branch") {
    const f = flags.find((a) => a.startsWith("--branch="));
    return report(checkCommitBranch(f ? f.slice("--branch=".length) || null : null));
  }

  if (cmd === "new-branches") {
    const names = readFileSync(0, "utf8").split("\n").filter((n) => n !== "");
    return report(checkNewBranches(names));
  }

  if (cmd === "secrets") {
    const input = readFileSync(0, "utf8");
    const where = flags.includes("--text")
      ? scanText(input).map((h) => ({ at: `mensaje de commit, línea ${h.line}`, ...h.hit }))
      : scanAddedLines(input).map((h) => ({ at: `${h.file}:${h.line}`, kind: h.kind, preview: h.preview }));
    if (where.length === 0) return 0;
    const lines = where.map((h) => `  ${h.at}  ${h.kind}  ${h.preview}`).join("\n");
    process.stderr.write(
      `git-hook: el commit lleva algo con forma de clave o token:\n${lines}\n` +
        `Quítalo (usa una variable de entorno). Si es un falso positivo, pon "harness:allow-secret" en esa línea.\n`,
    );
    return 1;
  }

  process.stderr.write(`git-hook: subcomando desconocido "${cmd ?? ""}"\n`);
  return 1;
}

try {
  process.exit(main());
} catch (e) {
  process.stderr.write(`git-hook: no puedo decidir (${(e as Error).message}); rechazo por seguridad.\n`);
  process.exit(1);
}
