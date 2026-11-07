---
name: verify-ui
description: Comprueba en el navegador real cualquier cambio visible de la interfaz (web/) antes de decir que está hecho. Úsala al tocar pantallas, componentes, estilos o lo que el usuario ve.
---

# verify-ui

Un cambio de pantalla no está hecho hasta que lo has visto funcionar en el navegador. Los tests no bastan.

1. Arranca la app: `PORT=3100 npm start` en segundo plano (construye y sirve `web/` + API). Si el puerto está ocupado, usa otro.
2. Abre la página con el navegador (skill `claude-in-chrome`, o Playwright si no hay Chrome) en `http://localhost:3100`.
3. Ejercita el flujo cambiado como lo haría un usuario: buscar, filtrar, abrir el detalle, etc. Comprueba también el caso límite más cercano (vacío, error, título sin datos).
4. Mira la consola del navegador: no debe haber errores ni peticiones fallidas nuevas.
5. Haz una captura y revisa que el resultado es el esperado (texto, maquetación, valores coherentes entre tarjeta y detalle).
6. Para el servidor y ejecuta `npm run verify` completo.

Al informar, di qué flujo probaste y qué viste. Si no pudiste abrir el navegador, dilo explícitamente: no declares el cambio de pantalla como verificado.

No volques emails ni datos de `data/app.db` en capturas o salida.
