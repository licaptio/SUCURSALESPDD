PROVSOFT · RUTA VENTA 1 · NUEVA VERSIÓN

EJECUCIÓN
1. Ejecuta server.py.
2. Abre la dirección indicada por el servidor.
3. Usa Ctrl+F5 la primera vez.

RUTAS FIRESTORE
- /TIENDAS/RUTA1/INVENTARIOS
- /almacenes/Almacen_Ruta_1/entradas
- /ventas_rutav2 (filtro rutaId = Almacen_Ruta_1)
- /TIENDAS/RUTA1/AJUSTE
- /TIENDAS/RUTA1/CONTEO_DIARIO

FUNCIONES
- Inventario semanal domingo a sábado.
- Inventario inicial acumulado.
- Entradas, ventas y ajustes.
- Historial de ajustes.
- Conteo físico independiente.
- Exportación Excel.
- Impresión / PDF.
- Caché en memoria e IndexedDB.

La configuración de rutas está centralizada en assets/js/config.js.

ACTUALIZACIÓN COMPACTA
- Título simplificado a INVENTARIO RUTA VENTA 1.
- Acciones agrupadas en menú desplegable.
- Tipografía y espacios reducidos para ampliar la tabla.
- Eliminadas las filas de sumatorias inferiores.
- Eliminadas columnas Total Entradas, Total Ajustes y Total Salidas.
- Conservada únicamente Existencia Teórica Final.
- Código y Nombre quedan fijos durante el desplazamiento horizontal.
- Selector semanal limitado desde la semana del inventario inicial.
- Barras de desplazamiento horizontal y vertical conservadas.
