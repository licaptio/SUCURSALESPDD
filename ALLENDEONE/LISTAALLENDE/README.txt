PROVSOFT - Reporte semanal modular

Contenido:
- index.html
- js/loading.js
- js/cacheDB.js

Prueba recomendada:
1. Levanta esta carpeta con servidor local. Ejemplo:
   python -m http.server 5500

2. Abre:
   http://localhost:5500

3. Primera carga: baja Firebase y guarda movimientos en IndexedDB.
4. Segunda carga/cambio de semana: usa caché local.
5. Botón "Actualizar datos": borra caché de la tienda actual y vuelve a descargar Firebase.

Nota:
No abras el index.html directo con file:// porque los módulos ES pueden bloquearse. Usa servidor local.
