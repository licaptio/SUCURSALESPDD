PROVSOFT - MERMAS CENTRAL

Estructura adaptada con el mismo esquema de la app de Mermas Allende:
- mermacentral.html: interfaz.
- styles.css: estilos separados.
- app.js: catálogo, formulario, IndexedDB, Firestore, firma, PDF y Telegram.
- config.js: Firebase y configuración de Telegram.
- telegram.js: envío del PDF a Telegram.

CONFIGURACIÓN CENTRAL
- Tienda fija: CENTRAL.
- Ruta Firestore: /TIENDAS/CENTRAL/MERMAS/{folio}
- Destino operativo: MATRIZ.
- Borrador local independiente: provsoft_merma_central_borrador.
- IndexedDB independiente: provsoft_catalogo_mermas_central.
- Catálogo: colección productos, filtrando activo == true.

No genera movimientos ni salidas de inventario al levantar la solicitud; únicamente registra la solicitud de merma.

Actualización offline-first:
- El catálogo se actualiza una vez por día automáticamente cuando hay internet.
- Si no hay internet y existe catálogo local, la app abre con la última copia disponible.
- Si el equipo nunca ha descargado catálogo, requiere internet para la primera carga.
- Las solicitudes generadas sin internet se guardan localmente como PENDIENTE_FIREBASE.
- Al volver internet, la app actualiza el catálogo pendiente y sincroniza automáticamente las mermas pendientes con /TIENDAS/CENTRAL/MERMAS/{folio}.
- El encabezado muestra cuántas solicitudes están pendientes.
