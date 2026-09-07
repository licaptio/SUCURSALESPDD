PROVEEDORA TRANSFERENCIAS PWA V7 - COLUMNAS REAL

CORRECCIÓN:
El ZIP anterior conservó por error el index.html V5 y por eso no mostraba las dos columnas.

ESTA VERSIÓN:
- Mitad izquierda: PENDIENTES.
- Mitad derecha: SURTIDAS.
- Línea roja vertical exacta al centro.
- Cada lado ordenado de más reciente a más antiguo.
- Listas verticales independientes.
- En móvil se apilan.

IMPORTANTE PARA GITHUB:
Este ZIP ya viene con los archivos DIRECTAMENTE en la raíz.
Sube/reemplaza index.html, config.js, manifest.json, sw.js y assets/.
No uses la carpeta V5 anterior.

Después de publicar:
1. Ctrl + F5.
2. Si la PWA está instalada y no cambia, ciérrala por completo y vuelve a abrir.

CAMBIOS V3 - FUENTES DE TRANSFERENCIAS
--------------------------------------
Se integraron las siguientes fuentes Firestore:
- /TIENDAS/ALLENDE 1/transferencias1
- /TIENDAS/ALLENDE 2/SOLTRAN
- /TIENDAS/MONTEMORELOS/SOLTRAN
- /TIENDAS/OSITO/SOLTRAN
- /TIENDAS/PROVILEON/SOLTRAN
- /TIENDAS/RIO VERDE/SOLTRAN
- /TIENDAS/CENTRAL/SOLTRAN

Se eliminó limit(100) de los listeners Firestore.
Se eliminó el límite visual de 20 registros por estado.
Los documentos se siguen separando por estatus raíz: SURTIDO vs pendientes.
Cache PWA actualizado a proveedora-transferencias-v8.


CAMBIO V4 - PAGINACION SURTIDAS
- La columna SURTIDAS muestra 30 documentos por pagina.
- Botones Anterior/Siguiente muestran el siguiente bloque de 30.
- Pendientes continúan visibles sin paginación.
- El contador conserva el total de surtidas recibidas en tiempo real.
- Cache PWA actualizado a proveedora-transferencias-v9.

V5: paginación Firestore real. Pendientes se consultan aparte; surtidas se cargan en bloques de 30 por colección y sólo se solicitan más al avanzar. Ya no se descargan las 512 surtidas al abrir.

V6 - CORRECCION ERROR "THE QUERY REQUIRES AN INDEX"
----------------------------------------------------
La consulta de SURTIDAS combina:
- where('estatus', '==', 'SURTIDO')
- orderBy('fecha_surtido', 'desc')

Firestore requiere un indice compuesto para esa combinacion.

Esta version incluye DOS medidas:
1) Fallback automatico: si el indice aun no existe, la PWA carga los documentos SURTIDO,
   los ordena localmente y sigue funcionando sin mostrar el error rojo como fallo operativo.
2) firestore.indexes.json con los indices correctos para SOLTRAN y transferencias1.

INDICES RECOMENDADOS:
- SOLTRAN: estatus ASCENDING + fecha_surtido DESCENDING
- transferencias1: estatus ASCENDING + fecha_surtido DESCENDING

Una vez creados/desplegados los indices, la PWA vuelve automaticamente a la consulta optimizada
con paginacion Firestore real y deja de usar el fallback.
