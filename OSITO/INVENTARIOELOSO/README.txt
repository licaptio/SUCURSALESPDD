LISTA OSITO - Inventario semanal y Conteo Diario

Ejecutar en Windows:
1. Dar doble clic en EJECUTAR_OSO.bat.
2. Mantener abierta la ventana negra mientras se usa el sistema.
3. El navegador abrirá automáticamente OSITOINVE.html.

También puede iniciarse manualmente con: python server.py

CORRECCIONES DE ESTA ENTREGA:
- Se agregó la función normalizarTexto que impedía cargar el reporte.
- server.py abre el archivo correcto OSITOINVE.html.
- El servidor funciona sin importar desde qué carpeta se ejecute.
- Si el puerto 3000 está ocupado, busca otro disponible hasta el 3019.
- Se agregó EJECUTAR_OSO.bat para abrirlo con doble clic.

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
