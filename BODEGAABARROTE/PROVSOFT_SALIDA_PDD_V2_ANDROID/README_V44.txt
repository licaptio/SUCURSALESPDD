PROVSOFT - SALIDA ABARROTES PDD V44 ANDROID
============================================

OBJETIVO
- App Android nativa contenedora de la V43/V44 web.
- Impresión directa Bluetooth Classic/SPP a térmicas ESC/POS de 58 mm.
- NO usa RawBT.

PUENTE DISPONIBLE EN JAVASCRIPT
window.ProvsoftAndroidPrinter

Métodos:
- selectPrinter()         -> muestra dispositivos Bluetooth YA EMPAREJADOS y guarda uno.
- listPairedPrinters()    -> devuelve JSON con dispositivos emparejados.
- getStatus()             -> estado Bluetooth + impresora guardada.
- printBase64(data, job)  -> envía los bytes ESC/POS por RFCOMM/SPP.

FLUJO DE PRIMERA PRUEBA
1) En Android: Ajustes > Bluetooth > emparejar la impresora 58 mm.
2) Abrir PROVSOFT Salida PDD.
3) Autorizar "Dispositivos cercanos" si Android lo solicita.
4) Menú > Impresora 58 mm > Seleccionar impresora.
5) Elegir la POS-58 / QIAN / Nextep / etc.
6) Ejecutar IMPRIMIR PRUEBA.

COMPATIBILIDAD
- minSdk 23 (Android 6+)
- targetSdk 35
- Bluetooth Classic RFCOMM/SPP.
- ESC/POS 58 mm.
- Se intenta conexión SPP estándar y dos fallbacks comunes.

IMPORTANTE
- La impresora debe estar emparejada antes desde Ajustes de Android.
- Esta V44 NO escanea dispositivos nuevos; sólo usa los ya emparejados.
- Si la impresora es BLE-only o usa protocolo propietario, requerirá otro driver.
- El ticket, logo y firma siguen generándose en JavaScript; Android sólo transmite bytes.

ABRIR EN ANDROID STUDIO
1) File > Open > seleccionar la carpeta PROVSOFT_SALIDA_PDD_V44_ANDROID.
2) Esperar Gradle Sync.
3) Conectar teléfono Android con Depuración USB habilitada.
4) Run > Run 'app'.

APK DEBUG
Después de compilar:
app/build/outputs/apk/debug/app-debug.apk

NOTA DEL ENTORNO DE ENTREGA
Este paquete contiene el proyecto Android completo. En el entorno donde fue armado
no está instalado Android SDK, por lo que aquí no se generó el APK binario.
Android Studio instalará/sincronizará las dependencias necesarias en el equipo de desarrollo.
