APP SALIDAS ZAPATA - PROVSOFT

Archivos:
- index.html
- styles.css
- config.js
- app.js

Lee configuración desde:
/almacenes/almacen_zapata/configuracion/catalogo_guiado

Guarda salidas en:
/almacenes/almacen_zapata/salidas1.0/{folio}

Incluye:
- IndexedDB borrador
- Catálogo activo cacheado
- Configuración guiada por íconos
- Búsqueda directa
- Carrito
- Notas generales antes de firmas
- Firmas canvas
- PDF
- Historial local
- Configuración para activar/desactivar departamentos y familias


CORRECCION 2026-07-03:
- normCod ya no elimina ceros a la izquierda. Evita borrar artículos como 020039 vs 20039.
- Si falla internet, no borra el catálogo local guardado.
- Service Worker v6 para forzar actualización.
- index.html corregido.
- Se agregaron iconos PWA y server.py local.

PARA USAR LOCAL:
1. Abre CMD en esta carpeta.
2. Ejecuta: python server.py
3. Abre: http://localhost:8000


CAMBIO 1.0.4 - SINCRONIZACION SIMPLE
- La app carga primero el catalogo local desde IndexedDB.
- Luego escucha /almacenes/almacen_zapata/configuracion/catalogo_guiado con onSnapshot.
- Si oficina cambia el catalogo en Firebase, la PWA lo detecta y actualiza IndexedDB.
- No usa catalogo_version ni versionado manual.
- Si no hay internet, produccion sigue usando el ultimo catalogo local.
