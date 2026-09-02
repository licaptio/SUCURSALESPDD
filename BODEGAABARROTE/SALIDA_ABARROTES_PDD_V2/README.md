# SALIDA ABARROTES PDD - V32

Estructura preparada para Git/GitHub + Firebase Hosting.

## Que vive en Git
- `public/` aplicacion PWA.
- `scripts/` BAT y PowerShell de administracion.
- `config/FIREBASE_NUEVO_CONFIG.txt` configuracion del SDK Web del Firebase nuevo.
- `firebase.json` y `.firebaserc` cuando ya se genere el vinculo.
- Este README.

## Que se publica en Firebase Hosting
Solo la carpeta `public/`, segun `firebase.json`.

Los BAT, PowerShell, README y archivos de administracion NO se publican en Hosting.

## Primer vinculo a Firebase nuevo
1. Edita `config/FIREBASE_NUEVO_CONFIG.txt`.
2. Pega los seis valores del SDK Web.
3. Guarda el archivo.
4. Ejecuta `scripts\00_CONFIGURAR_FIREBASE_NUEVO.bat`.
5. Ejecuta `scripts\01_PREPARAR_HOSTING_NUEVO.bat`.

Desde ese momento, para publicar cambios normales:
`scripts\02_ACTUALIZAR_HOSTING.bat`

## Seguridad
El archivo de config esta pensado SOLO para la configuracion Web de Firebase.
No guardar aqui service accounts, claves privadas, contrasenas ni tokens administrativos.

## Firebase viejo
Se conserva como perfil `viejo`. Nada de esta preparacion borra Firestore,
Storage, Hosting ni el proyecto anterior. La depuracion se hara despues.
