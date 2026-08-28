LISTA PROVILEON - Inventario semanal y Conteo Diario

Ejecutar:
1. Abrir una terminal en esta carpeta.
2. Ejecutar: python server.py
3. Abrir la dirección indicada por el servidor.

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
