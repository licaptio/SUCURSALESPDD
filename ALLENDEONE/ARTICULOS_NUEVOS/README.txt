APP ARTÍCULOS NUEVOS — CATÁLOGO LOCAL INDEXEDDB
================================================

FUNCIONAMIENTO
--------------
1. Consulta los 50 productos más recientes de Firestore.
2. La primera vez descarga completa la colección productos_fotos_meta.
3. Guarda ese catálogo en IndexedDB.
4. Relaciona fotografías por ID, codigoBarra, codigo, codigo_barra y concepto.
5. Guarda en IndexedDB la foto principal de cada documento.
6. Las imágenes del catálogo completo se sincronizan en segundo plano con 4 descargas simultáneas.
7. En las siguientes aperturas utiliza primero IndexedDB.

ACTUALIZAR CATÁLOGO
-------------------
El botón "Actualizar catálogo" vuelve a descargar productos_fotos_meta y actualiza IndexedDB.

ARCHIVOS IMPORTANTES
--------------------
js/indexeddb.js  Base local para metadatos y blobs de imágenes.
js/firebase.js   Descarga productos nuevos y el catálogo completo de fotos.
js/app.js        Relación, caché, sincronización y paginación.

EJECUCIÓN
---------
Ejecuta server.py y abre http://localhost:8000
Después de reemplazar una versión anterior, usa Ctrl + F5.

NOTA
----
La primera sincronización puede tardar debido al número y tamaño de las imágenes.
La pantalla se muestra sin esperar a que termine la descarga completa en segundo plano.
