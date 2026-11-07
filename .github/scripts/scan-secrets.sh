#!/usr/bin/env bash
# Respaldo en CI de pre-commit y commit-msg (que `git commit --no-verify` se salta).
# Escanea lo añadido y los mensajes del rango del push / PR con el MISMO escáner que los hooks
# (harness/git-cli.ts secrets). Sin copia propia de patrones.
# Entorno: EVENT (pull_request | otro) PR_BASE PR_HEAD BEFORE (push) GITHUB_SHA
set -euo pipefail

zero="0000000000000000000000000000000000000000"
empty_tree="4b825dc642cb6eb9a060e54bf8d69288fbee4904"

if [ "${EVENT:-}" = "pull_request" ]; then
  head="$PR_HEAD"
  base="$(git merge-base "$PR_BASE" "$head")"
else
  head="$GITHUB_SHA"
  base="${BEFORE:-$zero}"
  # Rama nueva o push forzado (el commit anterior ya no está): desde donde se separa de main.
  if [ "$base" = "$zero" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
    base="$(git merge-base origin/main "$head" 2>/dev/null || echo "$empty_tree")"
  fi
fi

if [ "$base" = "$empty_tree" ]; then log_range="$head"; else log_range="$base..$head"; fi
echo "Escaneando $log_range"

git -c core.quotepath=false diff --no-color --no-ext-diff --no-textconv -U0 --diff-filter=ACMR "$base" "$head" \
  | node harness/git-cli.ts secrets
git log --format=%B "$log_range" | node harness/git-cli.ts secrets --text
