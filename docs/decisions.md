# Decisiones y reglas de negocio

Reglas de las specs 1 (catálogo) y 2 (reseñas). Las marcadas **[decisión]** no estaban cerradas en las specs y se fijan aquí. Los números salen de `data/catalog.db` (netflixdb v1.0.70). Ninguna regla de este documento cambia código por sí sola.

## Spec 1 · Catálogo

- **R1. Catálogo de solo lectura.** La app nunca escribe en `data/catalog.db`. (Hoy `openCatalog()` no lo impone: F1.)
- **R2. Qué datos se usan.** Solo `movie`, `tv_show`, `season` y `view_summary`. Las tablas `BATCH_*` y `episode` (vacía) no cuentan.
- **R3. Dos clases de fila en `view_summary`.** `SEMI_ANNUALLY` = informes de visionado (horas). `WEEKLY` = listas semanales del top 10 (`view_rank`, `cumulative_weeks_in_top10`). Nunca se mezclan en un mismo cálculo.
- **R4. Una película enlaza por `view_summary.movie_id`; una serie no tiene cifras propias:** sus cifras salen de sus temporadas (`view_summary.season_id` → `season.tv_show_id`).
- **R5. Horas vistas de un título** = suma de `hours_viewed` de sus filas `SEMI_ANNUALLY`. Para una serie, suma de todas sus temporadas. Sin filas = 0.
- **R6. Cabecera global:** nº de películas, nº de series y suma de `hours_viewed` de todas las filas `SEMI_ANNUALLY`.
- **R7. Búsqueda** por título: subcadena sin distinguir mayúsculas; `%`, `_` y `\` se tratan como texto literal.
- **R8. Filtro por tipo:** `all`, `movie` o `show`. Un valor desconocido equivale a `all`.
- **R9. Orden:** por título (sin distinguir mayúsculas) o por horas vistas descendente. Desempate siempre por título, tipo e id, para que la paginación sea estable.
- **R10. Paginación** de 24 títulos; una página no válida equivale a la 1. `total` cuenta los títulos que casan, no los de la página.
- **R11. Identidad de un título = (tipo, id).** Un `id` de película y uno de serie pueden coincidir; nunca se usa el `id` solo.
- **R12. Detalle:** mismas cifras que la tarjeta; para una serie, además sus temporadas ordenadas por `season_number` con sus horas. Un título inexistente da 404.
- **R13. Estados de la UI:** sin resultados → «No titles match your search.»; error de API → mensaje visible, nunca pantalla en blanco.
- **R14. Semanas en el top 10 [decisión, ver más abajo]:** una sola definición, la misma en tarjeta y detalle.
- **R15. Año de estreno [decisión, ver más abajo]:** la serie tiene el año de su primera temporada con fecha; sin fecha, «desconocido».

## Spec 2 · Reseñas

- **R16. Las reseñas viven en `data/app.db`,** nunca en el catálogo.
- **R17. Los emails son datos personales:** ninguna respuesta de la API ni pantalla los muestra (criterio de aceptación: ninguna respuesta contiene `@`).
- **R18. Una reseña nueva nace `pending`** y no aparece en ningún listado público hasta que un moderador la aprueba.
- **R19. Solo se listan las reseñas `approved`** de un título (autor por nombre, nota y texto), de más reciente a más antigua.
- **R20. Validación al crear:** `rating` entero de 1 a 5; texto obligatorio tras `trim` y de 2000 caracteres como máximo; el usuario debe existir; el título debe existir en el catálogo (si no, 404).
- **R21. Moderación:** solo un usuario con rol `moderator`, identificado por la cabecera `X-User-Id`, puede listar las pendientes y cambiar el estado. Cualquier otro recibe `403`.
- **R22. Estados permitidos al moderar:** `approved` o `rejected`. Cualquier otro valor, o una reseña inexistente, da `400`.
- **R23. Una reseña se identifica por `title_kind` + `title_id`,** como en R11.

## R14 · Semanas en el top 10

**Definición elegida.** Número de semanas que el título ha estado en el top 10 semanal, tal como lo cuenta Netflix: `MAX(cumulative_weeks_in_top10)` sobre sus filas `WEEKLY`; 0 si nunca entró.

- **Película:** el `MAX` de sus filas.
- **Serie:** el `MAX` sobre todas sus temporadas, es decir, las semanas de la temporada que más tiempo estuvo. No se suman temporadas: dos temporadas en la lista la misma semana contarían dos veces esa semana.

**Por qué, con datos.**

1. `cumulative_weeks_in_top10` es el acumulado oficial de Netflix y no tiene nulos en las 6.911 filas `WEEKLY`. Contar filas solo cuenta las semanas que están en el dataset.
2. El dataset de listas semanales empieza el 2023-06-12 y llega al 2026-10-04. Un título que ya estaba en la lista antes de esa fecha tiene la primera fila con acumulado > 1, y las semanas anteriores no existen como filas.
3. Caso de F2, *Through My Window* (movie 177): 5 filas semanales, la primera ya con acumulado 14 (2023-06-19) y la última con 18. Entró 13 semanas antes de que empiece el dataset. Contar filas da 5; el valor real es 18.
4. Para películas, la diferencia es exactamente eso: en las 1.487 películas que alguna vez entraron, las 115 en que difieren son las mismas 115 cuyo primer registro ya traía acumulado > 1. Contar filas nunca da más que el `MAX` (0 casos de `filas > MAX`) y no hay semanas duplicadas.

**Cuántos títulos cambian respecto a la otra definición (contar filas `WEEKLY`, que es lo que hace hoy la tarjeta):**

| | Títulos en el top 10 | Cambian |
|---|---|---|
| Películas | 1.487 | 115 (7,7 %) |
| Series | 915 | 166 (18,1 %) |
| **Total** | **2.402** | **281 (11,7 %)** |

Los títulos que nunca entraron valen 0 con ambas definiciones y no cambian. En el detalle no cambia nada: ya usa `MAX`.

**Limitaciones de la elección en series (alternativas descartadas).** Sumar el máximo de cada temporada (suma de acumulados) difiere de la elegida en 227 de las 915 series, y contaría dos veces las semanas en que dos temporadas coinciden (p. ej. *Stranger Things*: 29 con `MAX` frente a 112 sumando temporadas). Contar semanas distintas dentro del dataset difiere en 157 series y pierde las semanas anteriores a 2023-06-12. El `MAX` es una cota inferior si dos temporadas ocupan semanas distintas; se acepta por ser simple, coincidir con lo que Netflix publica por temporada y no inflar cifras. La decisión sobre «temporadas como una línea o una por temporada» del spec 3 puede reabrir esto.

## R15 · Series y filtro por año

Hoy no hay filtro por año en la API, pero la tarjeta muestra el año y el spec 3 o futuras mejoras podrían filtrarlo. Lo que dicen los datos:

- **`tv_show.release_date` es nulo en las 4.862 series.** Tomar el año de la serie, como hace `titles.ts` (`year(t.release_date)`), da «desconocido» para todas. Un filtro por año basado en ese campo excluiría todas las series, sin error alguno.
- La fecha solo está en `season.release_date`, y es nula en 5.344 de las 8.874 temporadas. 2.265 series tienen al menos una temporada con fecha; **2.597 series (53 %) no tienen año por ningún camino.**
- 579 de las 2.265 series con fecha tienen temporadas en años distintos (p. ej. *Bridgerton*: 2020, 2022, 2024), así que «el año de una serie» no es único.
- Las películas tampoco están completas: 10.440 de 12.214 (85 %) no tienen fecha.

**Decisión.** El año de una serie es el de su primera temporada con fecha (`MIN(season.release_date)`). Un filtro por año:

- compara con ese año; no con `tv_show.release_date`;
- deja fuera de cualquier año concreto a los títulos sin fecha (series y películas), y la UI debe decirlo («Sin año») en vez de ocultarlos en silencio;
- no mezcla series y temporadas: se filtran series, aunque sus temporadas tengan otros años.

Si se prefiere «la serie aparece en todos los años en que estrenó una temporada», es otra decisión que habría que tomar y documentar aparte.
