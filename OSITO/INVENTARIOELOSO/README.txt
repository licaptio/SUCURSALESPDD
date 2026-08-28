LISTA OSITO - Inventario semanal y Conteo Diario

Ejecutar:
1. Abrir una terminal en esta carpeta.
2. Ejecutar: python server.py
3. Abrir la dirección indicada por el servidor.

Rutas principales:
- /TIENDAS/OSITO/inventario1
- /TIENDAS/OSITO/ventas
- /TIENDAS/OSITO/SURTIDOTRANS
- /TIENDAS/OSITO/ajustes_inventario
- /TIENDAS/OSITO/DEVOLUCIONES
- /TIENDAS/OSITO/MERMAS
- /TIENDAS/OSITO/configuracion_equivalencias
- /TIENDAS/OSITO/CONTEO_DIARIO
- /productos

Esta versión no consulta TECNOTRANSF ni colecciones de intercambios.

Módulo Conteo Diario:
- Se abre desde el botón Conteo diario del reporte.
- Muestra código, descripción y existencia total calculada.
- Permite seleccionar artículos y guardar listas reutilizables.
- Las listas pueden editarse, eliminarse y generar un PDF impreso.
- El PDF no muestra existencias teóricas; solo Código, Descripción y espacio de Conteo.


PUNTO CERO OSITO: 01/07/2026
AJUSTES: /TIENDAS/OSITO/ajustes_inventario
PUNTO CERO FIJO: 01/07/2026 = 0. Los movimientos anteriores se ignoran. Los ajustes posteriores NO crean un nuevo punto cero: se captura físico + fecha + hora, se calcula el teórico a ese instante y se guarda únicamente la diferencia AJU = físico - teórico.
