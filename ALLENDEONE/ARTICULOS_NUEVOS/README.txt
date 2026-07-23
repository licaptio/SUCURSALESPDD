APP ARTÍCULOS NUEVOS
====================

FUNCIONAMIENTO OPTIMIZADO
-------------------------
- Consulta los 50 productos más recientes.
- Conserva en IndexedDB únicamente la metadata de productos_fotos_meta.
- Relaciona fotografías por código, equivalencias y concepto.
- Descarga sólo una fotografía por cada artículo mostrado.
- Reutiliza desde IndexedDB las imágenes que ya fueron descargadas.
- No descarga las más de 2,000 fotografías del catálogo completo.

ACTUALIZAR CATÁLOGO
-------------------
El botón "Actualizar catálogo" vuelve a descargar la metadata de
productos_fotos_meta, pero sólo descarga las imágenes necesarias para los
50 artículos actuales.

EJECUCIÓN LOCAL
---------------
Ejecuta server.py o sirve la carpeta mediante GitHub Pages.
