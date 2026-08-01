PROVSOFT - MERMAS CON TELEGRAM PARA GITHUB PAGES

ARCHIVOS
- index.html: estructura limpia.
- styles.css: estilos.
- app.js: catálogo, formulario, Firestore, firma y PDF.
- config.js: Firebase y datos de Telegram.
- telegram.js: envío directo del PDF mediante sendDocument.

CONFIGURACIÓN
1. Abre config.js.
2. Captura TELEGRAM_BOT_TOKEN.
3. Captura TELEGRAM_CHAT_ID.
4. Si el grupo usa temas, captura TELEGRAM_TOPIC_ID; en caso contrario déjalo vacío.
5. Sube los archivos a GitHub Pages conservando la misma estructura.

ADVERTENCIA DE SEGURIDAD
GitHub Pages es alojamiento estático. TELEGRAM_BOT_TOKEN queda visible en el JavaScript público.
Cualquier persona que obtenga el token podría utilizar el bot. Para producción es preferible usar
un backend, Cloudflare Worker, Firebase Function o servidor propio.

El flujo guarda primero la merma en Firestore, genera el PDF, intenta enviarlo a Telegram y después
descarga el archivo. Si Telegram falla, la merma permanece guardada.
