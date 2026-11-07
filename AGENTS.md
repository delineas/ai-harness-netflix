# AGENTS.md

Netflix Explorer: Node 24, `server/` (API + SQLite), `web/` (Vite), tests con Vitest. Estructura y comandos: ver README.

## Reglas

- **Verificación:** no existe `npm run check`. Antes de dar algo por hecho, ejecuta `npm run typecheck && npm test && npm run test:web && npm run build`. Un `test:web` en verde no prueba nada: `tests/web/` está vacío y usa `--passWithNoTests` (F4).
- **No te fíes de un test por su nombre:** comprueba que ejercita la conexión/función que usa la app, no una propia. "catalog connection is read-only" abre su propia conexión (F1).
- **Catálogo de solo lectura:** `openCatalog()` debe abrirse con `{ readOnly: true }`; no escribas nunca en `data/catalog.db` (F1).
- **"Semanas en el top 10":** una sola definición compartida por tarjeta y detalle, según `specs/spec-03-top10-history.md`. No toques una de las dos consultas de `server/titles.ts` aislada (F2).
- **Frontera `web/` ↔ `server/`:** `web/` no importa de `server/` (hoy `web/src/format.ts` lo hace). No añadas más imports así (F3).
- **Servidor estático:** en `server/static.ts` comprueba que el fichero existe (404) y maneja `error` del stream; un `ENOENT` sin capturar tumba el proceso (F5).
- **Datos sensibles:** no vuelques emails de `data/app.db` en la salida, logs, tests ni commits; usa conteos o filas anonimizadas. Las tablas `BATCH_*` del catálogo no son parte de la app (F6).
- **Git:** añade ficheros por nombre, nunca `git add .`/`-A` (`.env` tiene `TMDB_API_KEY` y no está en `.gitignore`) (F8). Trabaja en una rama por cambio, no en `main` (F7).
