# AGENTS.md

Netflix Explorer: Node 24, `server/` (API + SQLite), `web/` (Vite), tests con Vitest y Playwright (`e2e/`). Estructura y comandos: ver README.

## Reglas

- **Verificación:** `npm run verify` (typecheck → unitarios → web → build → e2e). Un cambio no está hecho hasta que pasa entero, e2e incluido; no lo des por bueno con etapas sueltas. `verify` falla si una etapa ejecuta 0 tests o hay tests saltados/flaky: no lo esquives ni relajes esas comprobaciones.
- **No te fíes de un test por su nombre:** comprueba que ejercita la conexión/función que usa la app, no una propia.
- **Cambios de pantalla:** además de `verify`, usa la skill `verify-ui` para comprobarlos en el navegador antes de darlos por hechos.
- **Datos sensibles (F6):** no vuelques emails de `data/app.db` en la salida, logs, tests ni commits; usa conteos o filas anonimizadas. Las tablas `BATCH_*` del catálogo no son parte de la app.
- **Git:** añade ficheros por nombre, nunca `git add .`/`-A` (`.env` tiene `TMDB_API_KEY` y sigue sin estar en `.gitignore`) (F8). Trabaja en una rama por cambio, no en `main` (F7).

## Harness

Lo que te juzga y lo que configura tu comportamiento está protegido (reglas en `.claude/settings.json`). No lo modifiques, ni siquiera para que algo pase.

**Prohibido modificar (deny):**
- `data/catalog.db` (el catálogo)
- `e2e/**` y `playwright.config.ts` (tests e2e)
- `tests/architecture/**` (tests de estructura)
- `scripts/verify.mjs` (el script de verify)
- `.claude/**` y `CLAUDE.md` (tus propios ajustes)
- `curso/**` (herramientas del curso)
- `git commit` y `git push`: los commits y pushes los hace el usuario

**Preguntar antes (ask):**
- Añadir, quitar o actualizar dependencias (`npm install/add/uninstall/update`, cambios en `package.json` o `package-lock.json`)
- Leer o tocar `data/app.db`

Si un cambio parece requerir tocar algo protegido, para y díselo al usuario.
