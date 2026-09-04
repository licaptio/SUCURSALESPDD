MONITOR TRANSFERENCIAS PROVSOFT - PWA V2

COMPORTAMIENTO DE INICIO
1. Al abrir en Chrome o Edge aparece una pantalla breve "Cargando sistema...".
2. Después muestra:
   - Instalar en esta PC
   - Continuar en navegador
3. Si el navegador permite instalación PWA, el botón "Instalar en esta PC" abre el aviso oficial.
4. Si el usuario cancela, puede continuar usando la aplicación normalmente en el navegador.
5. Una vez abierta como PWA instalada (modo standalone), la pantalla de instalación se omite y entra directo.

IMPORTANTE
La PWA debe ejecutarse desde HTTPS (por ejemplo Firebase Hosting) o localhost.
No funciona correctamente abriendo index.html directamente con doble clic usando file://.

ARCHIVOS
- index.html
- manifest.json
- sw.js
- assets/
