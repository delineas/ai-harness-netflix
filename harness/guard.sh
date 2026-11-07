#!/usr/bin/env bash
# Hook PreToolUse. Lee el JSON del hook por stdin, mira la rama con git en el
# cwd que trae, y delega la decisión en harness/rules.ts (vía cli.ts).
# Exit 0 = permite, 2 = bloquea (motivo por stderr).
# OJO: en un hook, exit 1 NO bloquea. Por eso todo fallo termina en 2.

fail() {
  echo "guard: $1; bloqueo por seguridad." >&2
  exit 2
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || fail "no encuentro mi directorio"

input="$(cat)" || fail "no pude leer stdin"

cwd="$(printf '%s' "$input" | node "$here/cli.ts" --cwd)" || fail "entrada ilegible (JSON inválido)"

# Rama actual; vacía si HEAD está suelto, no es un repo o no hay cwd.
branch=""
if [ -n "$cwd" ] && [ -d "$cwd" ]; then
  branch="$(git -C "$cwd" symbolic-ref --short -q HEAD 2>/dev/null)" || branch=""
fi

args=()
[ -n "$branch" ] && args+=("--branch=$branch")

printf '%s' "$input" | node "$here/cli.ts" "${args[@]}"
rc=$?

case "$rc" in
  0) exit 0 ;;
  2) exit 2 ;;
  *) fail "error interno (código $rc)" ;;
esac
