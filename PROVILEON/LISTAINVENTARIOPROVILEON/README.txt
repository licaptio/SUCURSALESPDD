LISTA PROVILEON - Inventario semanal y Conteo Diario

Ejecutar en Windows:
1. Dar doble clic en EJECUTAR_PROVI_LEON.bat.
2. Mantener abierta la ventana negra mientras se usa el sistema.
3. El navegador abrirá automáticamente index.html.

También puede iniciarse manualmente con: python server.py

CORRECCIONES DE ESTA ENTREGA:
- Se agregó la función normalizarTexto que impedía cargar el reporte.
- server.py sirve siempre esta carpeta y abre index.html.
- Si el puerto 3000 está ocupado, busca otro disponible hasta el 3019.
- Se agregó EJECUTAR_PROVI_LEON.bat para abrirlo con doble clic.

Rutas principales:
- /TIENDAS/PROVILEON/inventario1
- /TIENDAS/PROVILEON/ventas
- /TIENDAS/PROVILEON/SURTIDOTRANS
- /TIENDAS/PROVILEON/ajustes_inventario
- /TIENDAS/PROVILEON/DEVOLUCIONES
- /TIENDAS/PROVILEON/MERMAS
- /TIENDAS/PROVILEON/configuracion_equivalencias
- /TIENDAS/PROVILEON/CONTEO_DIARIO
- /productos

Esta versión no consulta TECNOTRANSF ni colecciones de intercambios.

Módulo Conteo Diario:
- Se abre desde el botón Conteo diario del reporte.
- Muestra código, descripción y existencia total calculada.
- Permite seleccionar artículos y guardar listas reutilizables.
- Las listas pueden editarse, eliminarse y generar un PDF impreso.
- El PDF no muestra existencias teóricas; solo Código, Descripción y espacio de Conteo.


PROVILEON
Punto cero: 01/07/2026 (inventario inicial = 0)
Ajustes: /TIENDAS/PROVILEON/ajustes_inventario
El ultimo conteo fisico se usa como nueva base del articulo.

ACTUALIZACION PUNTO CERO / AJUSTES (28-08-2026)
- PUNTO CERO fijo: 01/07/2026 = 0.
- El selector de semanas queda bloqueado desde la semana que contiene el punto cero; no permite retroceder más.
- La pantalla principal muestra: PUNTO CERO 01-07-2026.
- Los ajustes solicitan fecha, hora y conteo físico.
- La existencia teórica se reconstruye con los movimientos desde el punto cero hasta la fecha/hora seleccionadas.
- AJUSTE = CONTEO FISICO - EXISTENCIA TEORICA.
- Los AJU se acumulan como diferencias; NO sustituyen el punto cero ni se convierten en nueva base.
