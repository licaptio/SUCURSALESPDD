PROVSOFT - CORRECCION INVENTARIO MODAL

Ejecucion:
1. Descomprimir carpeta.
2. Revisar assets/js/config.js si quieres cambiar keys de Firebase.
3. Ejecutar:
   python server.py

Flujo:
- Inicio
- Nuevo movimiento
- Modal 1: fecha entrada, fecha movimiento, hora, usuario, motivo, observaciones
- Modal 2: busqueda predictiva de articulos creados desde entradas/salidas del almacen
- Captura fisico, calcula diferencia y pregraba en carrito
- Carrito oculto/revisable
- Grabar movimiento completo en:
  /almacenes/almacen_zapata/ajustes_inventario/{folio}/PARTIDAS


CAMBIOS VERSION MODAL CORREGIDA:
- Se quitó el botón duplicado + Nuevo movimiento del encabezado superior en Inicio.
- El flujo queda guiado por Inicio / Nuevo movimiento / Movimientos grabados.
- En el carrito se agregó botón + Agregar partida para documentos nuevos o ya grabados.
- Al abrir un movimiento grabado puedes agregar más partidas, editar existentes, eliminar partidas y guardar cambios.
