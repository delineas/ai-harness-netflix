// Adaptador fino entre guard.sh y las reglas (rules.ts).
//   stdin: JSON del hook.
//   --cwd            imprime el campo cwd del JSON y sale (lo usa guard.sh para mirar la rama)
//   --branch=NOMBRE  rama actual; sin el flag la rama es desconocida
// Salida: 0 permite; 2 bloquea (motivo por stderr). Cualquier fallo -> 2.
import { readFileSync } from "node:fs";
import { decide } from "./rules.ts";

function main(): number {
  const args = process.argv.slice(2);
  const input: unknown = JSON.parse(readFileSync(0, "utf8"));

  if (args.includes("--cwd")) {
    const cwd = typeof input === "object" && input !== null ? (input as { cwd?: unknown }).cwd : undefined;
    process.stdout.write(typeof cwd === "string" ? cwd : "");
    return 0;
  }

  const flag = args.find((a) => a.startsWith("--branch="));
  const branch = flag ? flag.slice("--branch=".length) || null : null;

  const d = decide(input, branch);
  if (d.allow) return 0;
  process.stderr.write(`guard: ${d.reason}\n`);
  return 2;
}

try {
  process.exit(main());
} catch (e) {
  process.stderr.write(`guard: no puedo decidir (${(e as Error).message}); bloqueo por seguridad.\n`);
  process.exit(2);
}
