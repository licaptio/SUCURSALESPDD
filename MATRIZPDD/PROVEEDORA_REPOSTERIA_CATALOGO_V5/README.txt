PROVEEDORA REPOSTERIA CATALOGO V3

NUEVO EN V3
- Catálogo Firestore en tiempo real con onSnapshot.
- No usa polling ni recarga el catálogo por intervalos.
- La consulta mantiene un solo listener sobre catalogoReposteria == true.
- Firestore envía el catálogo inicial y luego únicamente los documentos modificados/agregados/eliminados.
- activo se valida localmente para evitar requerir un índice compuesto adicional.
- Ráfagas de cambios se agrupan 120 ms antes de redibujar la interfaz.
- Las fotos NO tienen listener global: se consultan bajo demanda desde productos_fotos_meta y se guardan en memoria para no generar lecturas innecesarias.
- Si cambia un producto, solo se invalida su caché de fotos.

EJECUCIÓN
1. Doble clic en INICIAR_CATALOGO.bat
2. El servidor abre la página en el navegador.
3. Mantener la ventana del servidor abierta mientras se usa el catálogo.

ARCHIVOS
- index.html
- assets/app.js
- assets/firebase-config.js
- assets/styles-base.css
- assets/styles-desktop.css
- assets/styles-mobile.css
- assets/logo-proveedora.jpg
- server.py
- INICIAR_CATALOGO.bat

VERSIONADO
Cada modificación se entrega en una carpeta y ZIP nuevos: V1, V2, V3, etc.

V5
- Modal de PC compactado para verse completo con Chrome al 100% de zoom.
- La foto principal del modal cambia automáticamente cada 3 segundos si hay más de una.
- Click/toque sobre la foto principal avanza a la siguiente foto.
- Click en miniaturas cambia la foto y reinicia el temporizador de 3 segundos.
