#!/usr/bin/env bash
# Hook Stop. Si el árbol de trabajo tiene cambios (git status), lanza
# `npm run verify`. Sin cambios: deja parar.
# Exit 0 = deja parar, 2 = bloquea y devuelve el final de la salida a Claude.
# Si ya venimos de un bloqueo (stop_hook_active) y sigue en rojo, deja parar
# con un aviso visible (systemMessage) para no entrar en bucle.

input="$(cat)"

active="$(printf '%s' "$input" | node -e '
let s = "";
process.stdin.on("data", d => s += d).on("end", () => {
  try { console.log(JSON.parse(s).stop_hook_active === true ? "1" : "0"); }
  catch { console.log("0"); }
});')"

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# .env está sin trackear a propósito (F8): se excluye o el árbol nunca estaría limpio.
if [ -z "$(git status --porcelain -- . ':!.env' 2>/dev/null)" ]; then
  exit 0
fi

out="$(mktemp)" || exit 0
trap 'rm -f "$out"' EXIT

if npm run verify >"$out" 2>&1; then
  exit 0
fi

tail_out="$(tail -n 60 "$out")"

if [ "$active" = "1" ]; then
  msg="verify sigue en rojo tras el reintento; se deja parar sin arreglarlo. Final de la salida:
$tail_out"
  printf '%s' "$msg" | node -e '
let s = "";
process.stdin.on("data", d => s += d).on("end", () =>
  console.log(JSON.stringify({ systemMessage: "⚠️ " + s })));'
  exit 0
fi

{
  echo "npm run verify ha fallado. Final de la salida:"
  echo "$tail_out"
} >&2
exit 2
