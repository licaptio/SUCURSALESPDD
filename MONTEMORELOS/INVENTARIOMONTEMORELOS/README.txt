LISTA MONTEMORELOS - Inventario semanal y Conteo Diario

Ejecutar:
1. Abrir una terminal en esta carpeta.
2. Ejecutar: python server.py
3. Abrir la dirección indicada por el servidor.

Rutas principales:
- /TIENDAS/MONTEMORELOS/inventario1
- /TIENDAS/MONTEMORELOS/ventas
- /TIENDAS/MONTEMORELOS/SURTIDOTRANS
- /TIENDAS/MONTEMORELOS/AJUSTES
- /TIENDAS/MONTEMORELOS/DEVOLUCIONES
- /TIENDAS/MONTEMORELOS/MERMAS
- /TIENDAS/MONTEMORELOS/configuracion_equivalencias
- /TIENDAS/MONTEMORELOS/CONTEO_DIARIO
- /productos

Esta versión no consulta TECNOTRANSF ni colecciones de intercambios.

Módulo Conteo Diario:
- Se abre desde el botón Conteo diario del reporte.
- Muestra código, descripción y existencia total calculada.
- Permite seleccionar artículos y guardar listas reutilizables.
- Las listas pueden editarse, eliminarse y generar un PDF impreso.
- El PDF no muestra existencias teóricas; solo Código, Descripción y espacio de Conteo.


Módulo Ajustes de Inventario:
- Se abre desde el botón Capturar ajuste del reporte.
- Busca artículos por código o descripción.
- Toma la existencia teórica actual y captura el conteo físico correcto.
- Permite guardar varios artículos por lote.
- Guarda y consulta en /TIENDAS/MONTEMORELOS/AJUSTES.
- El último ajuste funciona como nueva base del inventario y se identifica como AJU en el pivot.


MEJORAS VISUALES 2026-08-17:
- Vista principal compacta con selector semanal, fechas inicio/fin y buscador.
- Opciones del reporte agrupadas en menú de tres puntos.
- Negativos parpadean en rojo y ajustes en azul.
- Cantidades con 2 decimales.
- Barras vertical/horizontal optimizadas; barra horizontal inferior sincronizada.
- IndexedDB exclusiva: PROVSOFT_INVENTARIO_MONTEMORELOS_DB.
