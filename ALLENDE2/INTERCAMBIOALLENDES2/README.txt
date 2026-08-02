PROVSOFT INTERCAMBIOS - ASSETS + INDEXEDDB + TELEGRAM

IndexedDB:
- Primero carga el catálogo local.
- Si ya existe catálogo, NO descarga Firebase.
- Solo consulta Firebase cuando IndexedDB está vacío.

Telegram:
- Envía PDF al solicitar intercambio.
- Vigila el documento y envía otro PDF cuando el estado cambie a AUTORIZADO, APROBADO o INTERCAMBIO_AUTORIZADO.
- La vigilancia de autorización funciona mientras la página permanezca abierta.

Archivos: index.html, styles.css, app.js, config.js, telegram.js.
Conserva logo.png en la misma carpeta.


Adaptación ALLENDE 2:
- Solicita: ALLENDE 2.
- Contesta: ALLENDE 1.
- Ruta Firestore: /TIENDAS/ALLENDE 2/intercambios2/{folio}.
