LISTA ALLENDE - Inventario semanal y Conteo Diario

Ejecutar:
1. Abrir una terminal en esta carpeta.
2. Ejecutar: python server.py
3. Abrir la dirección indicada por el servidor.

Módulo Conteo Diario:
- Se abre desde el botón "Conteo diario" del reporte.
- Muestra código, descripción y existencia total calculada.
- Permite seleccionar artículos y guardar listas reutilizables.
- Firebase: /TIENDAS/ALLENDE 1/CONTEO_DIARIO
- Las listas pueden editarse, eliminarse y generar un PDF impreso.
- El PDF no muestra existencias teóricas; solo Código, Descripción y espacio de Conteo.
- No se guarda historial de impresiones.

MEJORAS 2026-08-05
- Filtro de tabla instantáneo por código o descripción, sin volver a consultar Firebase.
- Captura de ajustes por lote.
- Los artículos se agregan primero a una lista pendiente.
- El lote completo se guarda con Firestore batch.
- La caché se limpia y la tabla se recalcula una sola vez al finalizar el lote.
