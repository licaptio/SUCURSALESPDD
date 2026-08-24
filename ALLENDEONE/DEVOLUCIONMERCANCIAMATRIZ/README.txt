PROVSOFT - DEVOLUCIONES ALLENDE 1

Versión normalizada al estándar visual/operativo común de PROVSOFT, conservando identidad propia de ALLENDE 1.

- Tienda origen fija: ALLENDE 1.
- Destino: MATRIZ.
- Folio: DEV-ALLENDE1-AAAAMMDD-HHMM-####.
- Firestore: /TIENDAS/ALLENDE 1/DEVOLUCIONES/{folio}.
- Flujo: Datos -> Captura POS -> Finalizar.
- Carrito permite modificar y eliminar.
- Firma obligatoria justo antes de guardar.
- Catálogo automático diario.
- Sin internet usa catálogo local existente.
- Devoluciones offline quedan pendientes y sincronizan al volver internet.
- IndexedDB/localStorage independientes de otras apps.
