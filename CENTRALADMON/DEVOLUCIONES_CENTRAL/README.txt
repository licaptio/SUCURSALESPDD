PROVSOFT - DEVOLUCIONES CENTRAL

Flujo operativo:
- Datos -> Captura POS -> Finalizar.
- Buscador superior y carrito inferior.
- Cada partida permite modificar o eliminar.
- La firma se solicita únicamente antes de guardar.

Datos y sincronización:
- Tienda origen fija: CENTRAL.
- Destino: MATRIZ.
- Folio: DEV-CENTRAL-AAAAMMDD-HHMM-####.
- Ruta Firestore: /TIENDAS/CENTRAL/DEVOLUCIONES/{folio}.
- Catálogo: colección productos, activo == true.
- Actualización automática diaria; sin botón manual.
- IndexedDB: provsoft_catalogo_devoluciones_central.
- Si no hay internet y existe catálogo local, la app sigue operando.
- Las devoluciones sin conexión quedan pendientes localmente y se sincronizan al volver internet.
- Telegram usa la configuración existente de config.js.
- No aplica inventario al levantar la devolución; queda pendiente de recepción/revisión en MATRIZ.

FIXES DE SEGURIDAD CENTRAL:
- Recuperación de borrador fuerza siempre tienda CENTRAL.
- Folios recuperados solo se aceptan si comienzan con DEV-CENTRAL-.
- Un folio heredado o inválido se reemplaza por uno nuevo válido de CENTRAL.
- Sincronización offline/Telegram usa tiendaOrigen CENTRAL correctamente.
- No existe fallback ALLENDE.
