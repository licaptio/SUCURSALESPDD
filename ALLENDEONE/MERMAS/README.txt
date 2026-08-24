PROVSOFT - MERMAS ALLENDE 1

Versión normalizada al estándar visual/operativo común de PROVSOFT, conservando identidad propia de ALLENDE 1.

- Tienda fija: ALLENDE 1.
- Destino operativo: MATRIZ.
- Folio: MER-ALLENDE1-AAAAMMDD-HHMM-####.
- Firestore: /TIENDAS/ALLENDE 1/MERMAS/{folio}.
- Flujo: Datos -> Captura POS -> Finalizar.
- Carrito permite modificar y eliminar.
- Firma obligatoria justo antes de guardar.
- Catálogo automático diario.
- Sin internet usa catálogo local existente.
- Solicitudes offline quedan pendientes y sincronizan al volver internet.
- IndexedDB/localStorage independientes de otras apps.
