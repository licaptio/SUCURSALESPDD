PROVSOFT - DEVOLUCIONES A MATRIZ CON TELEGRAM

ARCHIVOS
- index.html
- styles.css
- app.js
- config.js
- telegram.js

FUNCIONAMIENTO
1. Guarda la devolución en Firestore.
2. Genera y descarga el PDF.
3. Envía el mismo PDF al Telegram personal configurado.
4. Si Telegram falla, la devolución permanece guardada en Firestore.

CONFIGURACIÓN
Revisa config.js:
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- TELEGRAM_TOPIC_ID

IMPORTANTE
El token es visible porque GitHub Pages ejecuta todo desde el navegador.
Si el token ya fue publicado o compartido, revócalo en BotFather y reemplázalo.
