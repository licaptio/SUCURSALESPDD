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
