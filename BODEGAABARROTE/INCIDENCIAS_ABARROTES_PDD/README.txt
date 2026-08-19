INCIDENCIAS ABARROTES PDD - V1

RUTA FIRESTORE
/almacenes/abarrotespdd/incidencias/{incidenciaId}

RUTA STORAGE
gs://inventariopv-643f1.firebasestorage.app/incidenciasalmacenes/abarrotespdd/{AAAA}/{MM}/{folio}/incidencia.jpg

FUNCIONAMIENTO
1. Abrir la app.
2. Levantar incidencia.
3. Escribir o dictar proveedor.
4. Tomar fotografía obligatoria.
5. Escribir/dictar comentario opcional.
6. Revisar.
7. Guardar.
8. La foto se sube a Storage.
9. La incidencia se guarda en Firestore con estado PENDIENTE.
10. Después del guardado se intenta Telegram.

TELEGRAM
Editar:
assets/js/telegram-config.js

Cambiar:
enabled: true
botToken: "..."
chatId: "..."

SEGURIDAD IMPORTANTE
Esta aplicación no usa usuario/contraseña.
Por lo tanto las reglas de Firestore y Storage deben permitir únicamente lo necesario para esta ruta.
No abras todo el proyecto con allow read, write: if true.

Telegram dentro del navegador expone el token a quien inspeccione el código.
Para una instalación controlada puede funcionar igual que otras apps internas, pero para máxima seguridad conviene mover Telegram a una Cloud Function.

CAMARA
En celular se usa un input con capture="environment".
En la mayoría de navegadores móviles abrirá la cámara trasera.

VOZ
Usa SpeechRecognition / webkitSpeechRecognition con idioma es-MX.
Chrome/Android normalmente tiene mejor compatibilidad.
