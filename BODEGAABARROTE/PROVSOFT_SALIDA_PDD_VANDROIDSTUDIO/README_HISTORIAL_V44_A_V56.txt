PROVSOFT SALIDA PDD - HISTORIAL UNIFICADO V44 A V56
====================================================

Este archivo consolida los README técnicos incluidos en las versiones V44, V46, V48, V49, V51, V52, V53, V54, V55 y V56.


====================================================
README V44
====================================================
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

V47: corrige timeout global que interrumpía fallbacks RFCOMM y hace visible/confirmada la impresora seleccionada en la UI.


====================================================
README V46
====================================================
PROVSOFT SALIDA PDD V46 - BLUETOOTH COMPATIBILITY

Cambio principal:
- Timeout independiente por cada método de conexión Bluetooth.
- SPP seguro.
- SPP inseguro.
- RFCOMM directo canales 1 a 5.
- Cierre forzado del socket cuando un intento expira.
- Reporte del método de conexión exitoso.

Objetivo de prueba: TechZone TZBEP03 / Bluetooth Printer, 58 mm ESC/POS.


====================================================
README V48
====================================================
PROVSOFT SALIDA PDD V48 - DIAGNOSTICO BLUETOOTH PROFUNDO

Cambios:
- Corrige identificacion visual de version a V48.
- Mantiene seleccion visible de impresora (nombre + MAC).
- Agrega boton DIAGNOSTICO BLUETOOTH.
- Consulta datos del dispositivo emparejado: bond state, tipo Classic/BLE/Dual y clase Bluetooth.
- Ejecuta fetchUuidsWithSdp() y espera ACTION_UUID hasta 9 segundos.
- Lista UUID/servicios anunciados por la impresora.
- Marca si el UUID SPP estandar 00001101-0000-1000-8000-00805F9B34FB es anunciado.
- Reporta errores SDP y ultimo metodo de conexion exitoso.

Prueba recomendada:
1. Instalar V48 desde Android Studio.
2. Ir a Impresora 58 mm.
3. Confirmar que aparezca Bluetooth Printer y su MAC.
4. Tocar DIAGNOSTICO BLUETOOTH.
5. Enviar captura completa del resultado.


====================================================
README V49
====================================================
PROVSOFT SALIDA PDD V49 - SPP CONNECTION TRACE

Cambios sobre V48:
- Diagnóstico nativo SPP por etapas.
- cancelDiscovery() antes de abrir RFCOMM.
- Pausa de estabilización de 650 ms.
- SPP insecure primero, luego SPP secure.
- Nuevo fallback createInsecureRfcommSocket(channel) 1..3.
- Fallback secure channel 1..3.
- Botón PRUEBA CONEXIÓN SPP sin enviar papel.
- Registro de etapa, tiempo y método de conexión.

Objetivo: TechZone TZBEP03 / Bluetooth Printer 58 mm ESC/POS.


====================================================
README V51
====================================================
V51 SPP QUICK HARD-TIMEOUT DIAGNOSTIC
- Diagnostic SPP is synchronous but bounded to ~11 seconds maximum.
- Only tests the two real UUID-SPP socket modes announced by the printer: insecure and secure.
- Each connect attempt is guarded by Future.get(timeout) and forced socket.close().
- Removed long channel sweep from diagnostic to prevent apparent hangs.
- Printing engine remains unchanged from V50/V49.


====================================================
README V52
====================================================
V52 - Corrección del puente SPP asíncrono

Problema encontrado en V50/V51:
El código Java ya incluía startSppConnectionDiagnostic() y getSppConnectionDiagnosticStatus(), pero app.js seguía llamando sppConnectionDiagnostic() de forma síncrona. Por eso la UI aparentaba congelarse.

V52:
- app.js inicia el diagnóstico con startSppConnectionDiagnostic().
- Sondea getSppConnectionDiagnosticStatus() cada 500 ms.
- Timeout de recuperación del lado JS: 18 s.
- Mantiene timeout duro nativo por intento SPP.


====================================================
README V53
====================================================
PROVSOFT SALIDA PDD V53 - FIX REAL DEL PUENTE SPP

Corrección encontrada con Logcat:
Uncaught (in promise) ReferenceError: getAndroidPrinterBridge is not defined

El diagnóstico V52 nunca alcanzaba a llamar al puente Android porque app.js usaba un nombre de función inexistente.
V53 cambia esa llamada a getNativePrinterBridge(), que sí existe y es la misma función usada por selección, diagnóstico Bluetooth e impresión.

También se actualizó el cache-buster de app.js y la etiqueta visual a V53 ANDROID.


====================================================
README V54
====================================================
PROVSOFT SALIDA PDD V54 - ESC/POS PACED 58 MM

Objetivo:
- Mantener SPP_INSECURE ya validado con Printer001.
- Evitar saturar el buffer Bluetooth/ESC-POS de miniprinters 58 mm.
- Enviar datos en bloques de 192 bytes con pequeñas pausas.
- Detectar raster GS v 0 (logo/firma), hacer flush y esperar 380 ms después de cada imagen.
- La prueba de impresión V54 desactiva el comando de corte aunque haya quedado activado en configuración.

Prueba:
1. Emparejar y seleccionar Printer001.
2. Abrir Impresora 58 mm.
3. Pulsar IMPRIMIR PRUEBA.
4. Debe salir logo Y continuar con texto/partidas.


====================================================
README V55
====================================================
PROVSOFT SALIDA PDD V55 - PRUEBA COMPATIBILIDAD GRAFICA 58 MM

Objetivo:
- Mantener Printer001 / SPP_INSECURE ya validado.
- Probar tres dialectos gráficos ESC/POS sin cambiar Bluetooth.

Botón nuevo: PRUEBA GRÁFICA V55
A) GS v 0 (raster actual)
B) ESC * modo 33 (24-dot double density)
C) ESC * modo 1 (8-dot double density)

Cada método imprime su etiqueta antes y FIN A/B/C después.
El método que muestre correctamente el logo será usado en la siguiente versión para logo y firma.


====================================================
README V56
====================================================
PROVSOFT SALIDA PDD V56 - TICKET FINAL 58 MM

Cambios:
- Perfil confirmado: Printer001 / Bluetooth Classic SPP_INSECURE / ESC-POS 58 mm.
- Logo y firma usan GS v 0, confirmado físicamente en Printer001.
- Cada comando raster GS v 0 se envía completo, sin pausas internas.
- El texto conserva pacing por bloques para evitar saturar el buffer Bluetooth.
- Corte automático deshabilitado: la impresora usa corte manual.
- Se retiraron de Configuración los botones de diagnóstico/prueba ya innecesarios.
- Permanecen: seleccionar/cambiar impresora, columnas, autoimpresión, logo, firma y guardar.
- V56 preparada para ticket real: logo + datos + partidas + firma + cierre.

