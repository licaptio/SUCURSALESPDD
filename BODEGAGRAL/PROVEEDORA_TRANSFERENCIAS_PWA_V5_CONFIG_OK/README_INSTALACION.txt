PROVEEDORA TRANSFERENCIAS PWA V5 - CONFIG OK

CORRECCIÓN:
- Se agregó config.js, que faltaba y provocaba:
  Failed to load resource: 404 config.js
- La aplicación ya puede inicializar Firebase.
- Service Worker actualizado a V5.

PARA PUBLICAR EN GITHUB PAGES:
Sube TODO el contenido de esta carpeta, incluyendo:
  index.html
  config.js
  manifest.json
  sw.js
  assets/

IMPORTANTE:
No subas solamente index.html. config.js debe quedar exactamente junto a index.html.

FLUJO PWA:
- Desde navegador: carga breve -> Instalar / Continuar en navegador.
- Si eliges Continuar: entra a la app.
- Si aceptas instalar: instala y entra.
- Si ya está instalada: entra directo.
