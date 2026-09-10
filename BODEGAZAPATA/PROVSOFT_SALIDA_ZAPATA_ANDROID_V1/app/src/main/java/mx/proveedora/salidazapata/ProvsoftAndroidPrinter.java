package mx.proveedora.salidazapata;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ParcelUuid;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class ProvsoftAndroidPrinter {
    private final ExecutorService sppDiagnosticExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean sppDiagnosticRunning = false;
    private volatile String sppDiagnosticLastJson = "";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String PREFS = "provsoft_printer";
    private static final String PREF_ADDR = "device_address";
    private static final String PREF_NAME = "device_name";

    private final Activity activity;
    private final BluetoothAdapter bluetoothAdapter;
    private final SharedPreferences prefs;

    public ProvsoftAndroidPrinter(Activity activity) {
        this.activity = activity;
        this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public String getStatus() {
        JSONObject out = baseResult();
        try {
            if (bluetoothAdapter == null) return fail(out, "NO_BLUETOOTH", "Este equipo no tiene Bluetooth.").toString();
            if (!hasConnectPermission()) return fail(out, "PERMISSION_DENIED", "Falta permiso para dispositivos cercanos/Bluetooth.").toString();
            if (!bluetoothAdapter.isEnabled()) return fail(out, "BLUETOOTH_OFF", "Bluetooth está apagado.").toString();

            String address = prefs.getString(PREF_ADDR, "");
            String name = prefs.getString(PREF_NAME, "");
            out.put("ok", true);
            out.put("bluetooth", "ON");
            if (!address.isEmpty()) out.put("device", deviceJson(name, address));
            else out.put("device", JSONObject.NULL);
        } catch (Exception e) {
            fail(out, "STATUS_ERROR", e.getMessage());
        }
        return out.toString();
    }

    @JavascriptInterface
    public String listPairedPrinters() {
        JSONObject out = baseResult();
        JSONArray devices = new JSONArray();
        try {
            if (bluetoothAdapter == null) return fail(out, "NO_BLUETOOTH", "Este equipo no tiene Bluetooth.").toString();
            if (!hasConnectPermission()) return fail(out, "PERMISSION_DENIED", "Falta permiso para dispositivos cercanos/Bluetooth.").toString();
            if (!bluetoothAdapter.isEnabled()) return fail(out, "BLUETOOTH_OFF", "Bluetooth está apagado.").toString();

            for (BluetoothDevice d : getBondedDevicesSorted()) {
                devices.put(deviceJson(safeName(d), d.getAddress()));
            }
            out.put("ok", true);
            out.put("devices", devices);
            out.put("count", devices.length());
        } catch (Exception e) {
            fail(out, "LIST_ERROR", e.getMessage());
        }
        return out.toString();
    }

    @JavascriptInterface
    public String selectPrinter() {
        JSONObject out = baseResult();
        try {
            if (bluetoothAdapter == null) return fail(out, "NO_BLUETOOTH", "Este equipo no tiene Bluetooth.").toString();
            if (!hasConnectPermission()) return fail(out, "PERMISSION_DENIED", "Autoriza Bluetooth/Dispositivos cercanos y vuelve a intentar.").toString();
            if (!bluetoothAdapter.isEnabled()) return fail(out, "BLUETOOTH_OFF", "Enciende Bluetooth y vuelve a intentar.").toString();

            final List<BluetoothDevice> devices = getBondedDevicesSorted();
            if (devices.isEmpty()) return fail(out, "NO_PAIRED_DEVICES", "Primero empareja la impresora en Ajustes de Android > Bluetooth.").toString();

            if (devices.size() == 1) {
                BluetoothDevice d = devices.get(0);
                saveDevice(d);
                out.put("ok", true);
                out.put("device", deviceJson(safeName(d), d.getAddress()));
                return out.toString();
            }

            final CountDownLatch latch = new CountDownLatch(1);
            final AtomicReference<BluetoothDevice> selected = new AtomicReference<>(null);
            final AtomicReference<Boolean> cancelled = new AtomicReference<>(false);

            activity.runOnUiThread(() -> {
                String[] labels = new String[devices.size()];
                for (int i = 0; i < devices.size(); i++) {
                    BluetoothDevice d = devices.get(i);
                    labels[i] = safeName(d) + "\n" + d.getAddress();
                }
                new AlertDialog.Builder(activity)
                        .setTitle("Seleccionar impresora Bluetooth")
                        .setItems(labels, (dialog, which) -> {
                            selected.set(devices.get(which));
                            latch.countDown();
                        })
                        .setNegativeButton("✕ CERRAR", (dialog, which) -> {
                            cancelled.set(true);
                            latch.countDown();
                        })
                        .setOnCancelListener(dialog -> {
                            cancelled.set(true);
                            latch.countDown();
                        })
                        .show();
            });

            boolean finished = latch.await(60, TimeUnit.SECONDS);
            BluetoothDevice d = selected.get();
            if (!finished) return fail(out, "SELECT_TIMEOUT", "Se agotó el tiempo para seleccionar impresora.").toString();
            if (cancelled.get() || d == null) return fail(out, "NO_DEVICE", "No se seleccionó impresora.").toString();

            saveDevice(d);
            out.put("ok", true);
            out.put("device", deviceJson(safeName(d), d.getAddress()));
        } catch (Exception e) {
            fail(out, "SELECT_ERROR", e.getMessage());
        }
        return out.toString();
    }


    @JavascriptInterface
    public String bluetoothDiagnostic() {
        JSONObject out = baseResult();
        try {
            if (bluetoothAdapter == null) return fail(out, "NO_BLUETOOTH", "Este equipo no tiene Bluetooth.").toString();
            if (!hasConnectPermission()) return fail(out, "PERMISSION_DENIED", "Falta permiso Bluetooth/Dispositivos cercanos.").toString();
            if (!bluetoothAdapter.isEnabled()) return fail(out, "BLUETOOTH_OFF", "Bluetooth está apagado.").toString();

            String address = prefs.getString(PREF_ADDR, "");
            if (address.isEmpty()) return fail(out, "NO_DEVICE", "Selecciona una impresora antes del diagnóstico.").toString();

            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
            out.put("ok", true);
            out.put("device", deviceJson(safeName(device), device.getAddress()));
            out.put("bondState", bondStateName(device.getBondState()));
            out.put("deviceType", deviceTypeName(device.getType()));
            out.put("bluetoothClass", device.getBluetoothClass() == null ? JSONObject.NULL : device.getBluetoothClass().toString());
            out.put("expectedSppUuid", SPP_UUID.toString());

            JSONArray cached = uuidArray(device.getUuids());
            out.put("cachedUuids", cached);

            final CountDownLatch latch = new CountDownLatch(1);
            final AtomicReference<ParcelUuid[]> fetched = new AtomicReference<>(null);
            final AtomicReference<String> fetchError = new AtomicReference<>(null);

            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (!BluetoothDevice.ACTION_UUID.equals(intent.getAction())) return;
                    BluetoothDevice changed;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        changed = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
                    } else {
                        changed = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    }
                    if (changed == null || !device.getAddress().equals(changed.getAddress())) return;
                    fetched.set(changed.getUuids());
                    latch.countDown();
                }
            };

            boolean registered = false;
            try {
                IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_UUID);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
                } else {
                    activity.registerReceiver(receiver, filter);
                }
                registered = true;
                boolean started = device.fetchUuidsWithSdp();
                out.put("sdpStarted", started);
                if (started) {
                    boolean received = latch.await(9, TimeUnit.SECONDS);
                    out.put("sdpBroadcastReceived", received);
                    if (!received) fetchError.set("No llegó ACTION_UUID dentro de 9 segundos.");
                } else {
                    fetchError.set("Android no inició fetchUuidsWithSdp().");
                }
            } catch (Exception e) {
                fetchError.set(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            } finally {
                if (registered) {
                    try { activity.unregisterReceiver(receiver); } catch (Exception ignored) {}
                }
            }

            ParcelUuid[] finalUuids = fetched.get();
            if (finalUuids == null) finalUuids = device.getUuids();
            JSONArray uuids = uuidArray(finalUuids);
            out.put("uuids", uuids);
            out.put("sppAdvertised", containsUuid(finalUuids, SPP_UUID));
            out.put("fetchError", fetchError.get() == null ? JSONObject.NULL : fetchError.get());
            out.put("lastConnectMethod", prefs.getString("last_connect_method", ""));
            out.put("message", "Diagnóstico Bluetooth completado.");
        } catch (Exception e) {
            fail(out, "BT_DIAGNOSTIC_ERROR", e.getMessage());
        }
        return out.toString();
    }

    @JavascriptInterface
    public String startSppConnectionDiagnostic() {
        JSONObject out = new JSONObject();
        try {
            if (sppDiagnosticRunning) {
                out.put("ok", true);
                out.put("running", true);
                out.put("message", "Diagnóstico SPP ya está en curso.");
                return out.toString();
            }
            sppDiagnosticRunning = true;
            sppDiagnosticLastJson = "";
            sppDiagnosticExecutor.execute(() -> {
                try {
                    sppDiagnosticLastJson = sppConnectionDiagnostic();
                } catch (Exception e) {
                    try {
                        JSONObject err = new JSONObject();
                        err.put("ok", false);
                        err.put("code", "SPP_ASYNC_ERROR");
                        err.put("message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                        sppDiagnosticLastJson = err.toString();
                    } catch (Exception ignored) {}
                } finally {
                    sppDiagnosticRunning = false;
                }
            });
            out.put("ok", true);
            out.put("running", true);
            out.put("message", "Diagnóstico SPP iniciado en segundo plano.");
        } catch (Exception e) {
            sppDiagnosticRunning = false;
            try { out.put("ok", false); out.put("running", false); out.put("message", e.getMessage()); } catch (Exception ignored) {}
        }
        return out.toString();
    }

    @JavascriptInterface
    public String getSppConnectionDiagnosticStatus() {
        JSONObject out = new JSONObject();
        try {
            out.put("ok", true);
            out.put("running", sppDiagnosticRunning);
            if (!sppDiagnosticRunning && sppDiagnosticLastJson != null && !sppDiagnosticLastJson.isEmpty()) {
                out.put("result", new JSONObject(sppDiagnosticLastJson));
            }
        } catch (Exception e) {
            try { out.put("ok", false); out.put("running", false); out.put("message", e.getMessage()); } catch (Exception ignored) {}
        }
        return out.toString();
    }

    @JavascriptInterface
    public String sppConnectionDiagnostic() {
        JSONObject out = baseResult();
        JSONArray stages = new JSONArray();
        BluetoothSocket socket = null;
        long startedAt = System.currentTimeMillis();
        try {
            stage(stages, "START", true, "V52 diagnóstico SPP asíncrono", startedAt);
            if (bluetoothAdapter == null) return failWithStages(out, stages, "NO_BLUETOOTH", "Este equipo no tiene Bluetooth.", startedAt).toString();
            if (!hasConnectPermission()) return failWithStages(out, stages, "PERMISSION_DENIED", "Falta permiso Bluetooth/Dispositivos cercanos.", startedAt).toString();
            if (!bluetoothAdapter.isEnabled()) return failWithStages(out, stages, "BLUETOOTH_OFF", "Bluetooth está apagado.", startedAt).toString();

            String address = prefs.getString(PREF_ADDR, "");
            if (address.isEmpty()) return failWithStages(out, stages, "NO_DEVICE", "Selecciona una impresora antes del diagnóstico SPP.", startedAt).toString();
            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
            out.put("device", deviceJson(safeName(device), device.getAddress()));
            stage(stages, "DEVICE", true, safeName(device) + " / " + device.getAddress(), startedAt);

            if (device.getBondState() != BluetoothDevice.BOND_BONDED)
                return failWithStages(out, stages, "NOT_BONDED", "La impresora no está emparejada (BONDED).", startedAt).toString();
            stage(stages, "BOND", true, "BONDED", startedAt);

            try { bluetoothAdapter.cancelDiscovery(); } catch (Exception ignored) {}
            stage(stages, "CANCEL_DISCOVERY", true, "Discovery cancelado", startedAt);
            Thread.sleep(500);

            List<String> errors = new ArrayList<>();
            // V51: solo los dos métodos que corresponden al UUID SPP anunciado por SDP.
            // Cada uno tiene timeout duro corto para evitar congelamientos prolongados.
            socket = tryConnectWithStages("SPP_INSECURE", () -> device.createInsecureRfcommSocketToServiceRecord(SPP_UUID), 5000, errors, stages, startedAt);
            if (socket == null)
                socket = tryConnectWithStages("SPP_SECURE", () -> device.createRfcommSocketToServiceRecord(SPP_UUID), 5000, errors, stages, startedAt);

            if (socket == null || !socket.isConnected()) {
                out.put("ok", false);
                out.put("code", "SPP_CONNECT_FAILED");
                out.put("message", "No se logró abrir SPP en la prueba rápida V51.");
                out.put("errors", new JSONArray(errors));
                out.put("stages", stages);
                out.put("elapsedMs", System.currentTimeMillis() - startedAt);
                return out.toString();
            }

            stage(stages, "CONNECT_OK", true, prefs.getString("last_connect_method", ""), startedAt);
            OutputStream os = socket.getOutputStream();
            stage(stages, "OUTPUT_STREAM", os != null, "OutputStream disponible", startedAt);
            out.put("ok", true);
            out.put("code", "SPP_OK");
            out.put("connectMethod", prefs.getString("last_connect_method", ""));
            out.put("stages", stages);
            out.put("elapsedMs", System.currentTimeMillis() - startedAt);
            out.put("message", "SPP conectado correctamente.");
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            failWithStages(out, stages, "SPP_DIAGNOSTIC_ERROR", msg, startedAt);
        } finally {
            try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        }
        return out.toString();
    }

    @JavascriptInterface
    public String printBase64(String dataBase64, String jobJson) {
        JSONObject out = baseResult();
        BluetoothSocket socket = null;
        try {
            if (bluetoothAdapter == null) return fail(out, "NO_BLUETOOTH", "Este equipo no tiene Bluetooth.").toString();
            if (!hasConnectPermission()) return fail(out, "PERMISSION_DENIED", "Falta permiso Bluetooth/Dispositivos cercanos.").toString();
            if (!bluetoothAdapter.isEnabled()) return fail(out, "BLUETOOTH_OFF", "Bluetooth está apagado.").toString();
            if (dataBase64 == null || dataBase64.trim().isEmpty()) return fail(out, "EMPTY_DATA", "El ticket ESC/POS está vacío.").toString();

            JSONObject job = new JSONObject(jobJson == null || jobJson.trim().isEmpty() ? "{}" : jobJson);
            JSONObject deviceFromJob = job.optJSONObject("device");
            String address = deviceFromJob != null ? firstNonEmpty(deviceFromJob.optString("address"), deviceFromJob.optString("id")) : "";
            if (address.isEmpty()) address = prefs.getString(PREF_ADDR, "");
            if (address.isEmpty()) return fail(out, "NO_DEVICE", "Selecciona una impresora antes de imprimir.").toString();

            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
            final byte[] bytes = Base64.decode(dataBase64, Base64.DEFAULT);
            final BluetoothDevice target = device;

            // connectSocket() ya controla un timeout independiente por cada método.
            // No usamos un timeout global: en V46 el límite global de 12 s podía
            // cancelar la conexión antes de llegar a los fallbacks RFCOMM.
            socket = connectSocket(target);

            if (socket == null || !socket.isConnected()) return fail(out, "CONNECT_FAILED", "No se pudo abrir la conexión con la impresora.").toString();

            OutputStream os = socket.getOutputStream();

            // V57: envío definitivo para Printer001. Texto pausado + imágenes GS v 0 atómicas.
            // Enviar logo + texto + firma en un único write() puede hacer que la
            // impresora procese la primera imagen y descarte el resto. Enviamos
            // el flujo ESC/POS de forma pausada y damos tiempo extra después de
            // cada comando raster GS v 0 (logo/firma).
            SendStats sendStats = writeEscPosPaced(os, bytes);

            saveDevice(device);
            out.put("ok", true);
            out.put("bytesSent", sendStats.bytesSent);
            out.put("chunksSent", sendStats.chunksSent);
            out.put("rastersSent", sendStats.rastersSent);
            out.put("device", deviceJson(safeName(device), device.getAddress()));
            out.put("paperMm", job.optInt("paperMm", 58));
            out.put("protocol", job.optString("protocol", "ESC/POS"));
            out.put("folio", job.optString("folio", ""));
            out.put("connectMethod", prefs.getString("last_connect_method", ""));
            out.put("message", "Ticket enviado por Bluetooth.");
        } catch (SecurityException e) {
            fail(out, "PERMISSION_DENIED", e.getMessage());
        } catch (IllegalArgumentException e) {
            fail(out, "BAD_DEVICE", "Dirección Bluetooth inválida.");
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            fail(out, "PRINT_ERROR", msg);
        } finally {
            try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        }
        return out.toString();
    }

    private static class SendStats {
        int bytesSent = 0;
        int chunksSent = 0;
        int rastersSent = 0;
    }

    /**
     * Envío ESC/POS compatible con miniprinters de buffer reducido.
     * Detecta GS v 0 (1D 76 30 m xL xH yL yH + raster) para aplicar
     * pacing más conservador a imágenes y una pausa de procesamiento.
     */
    private SendStats writeEscPosPaced(OutputStream os, byte[] data) throws Exception {
        SendStats stats = new SendStats();
        int pos = 0;
        int plainStart = 0;

        while (pos + 7 < data.length) {
            // GS v 0: 1D 76 30 m xL xH yL yH d1...dk
            if ((data[pos] & 0xFF) == 0x1D &&
                (data[pos + 1] & 0xFF) == 0x76 &&
                (data[pos + 2] & 0xFF) == 0x30) {

                if (pos > plainStart) {
                    writePacedRange(os, data, plainStart, pos - plainStart, 192, 12, stats);
                }

                int widthBytes = (data[pos + 4] & 0xFF) | ((data[pos + 5] & 0xFF) << 8);
                int height = (data[pos + 6] & 0xFF) | ((data[pos + 7] & 0xFF) << 8);
                long rasterPayload = (long) widthBytes * (long) height;
                long rasterTotalLong = 8L + rasterPayload;
                int available = data.length - pos;
                int rasterTotal = (int) Math.min((long) available, rasterTotalLong);

                // Si el encabezado no es razonable, lo tratamos como datos normales.
                if (widthBytes <= 0 || height <= 0 || rasterTotal < 8 || rasterTotalLong > Integer.MAX_VALUE) {
                    pos++;
                    continue;
                }

                Log.d("ProvsoftPrinter", "ESC/POS GS v 0 atomic raster: " + widthBytes + " bytes/row x " + height + " rows = " + rasterTotal + " bytes");
                // V56: Printer001 confirmó que GS v 0 es su modo gráfico correcto.
                // El encabezado + payload raster se manda como una sola unidad lógica;
                // NO insertamos pausas dentro del bitmap para evitar que el firmware
                // interprete bytes de imagen como texto.
                os.write(data, pos, rasterTotal);
                os.flush();
                stats.bytesSent += rasterTotal;
                stats.chunksSent++;
                stats.rastersSent++;
                // Tiempo para que el cabezal procese logo/firma antes de continuar.
                Thread.sleep(450);

                pos += rasterTotal;
                plainStart = pos;
                continue;
            }
            pos++;
        }

        if (plainStart < data.length) {
            writePacedRange(os, data, plainStart, data.length - plainStart, 192, 12, stats);
        }
        os.flush();
        Thread.sleep(220);
        Log.d("ProvsoftPrinter", "ESC/POS enviado: bytes=" + stats.bytesSent + ", chunks=" + stats.chunksSent + ", rasters=" + stats.rastersSent);
        return stats;
    }

    private void writePacedRange(OutputStream os, byte[] data, int offset, int length,
                                 int chunkSize, long pauseMs, SendStats stats) throws Exception {
        int end = offset + length;
        int p = offset;
        while (p < end) {
            int n = Math.min(chunkSize, end - p);
            os.write(data, p, n);
            os.flush();
            stats.bytesSent += n;
            stats.chunksSent++;
            p += n;
            if (p < end && pauseMs > 0) Thread.sleep(pauseMs);
        }
    }

    private BluetoothSocket connectSocket(BluetoothDevice device) throws Exception {
        // V57: Printer001 ya fue validada físicamente con SPP_INSECURE.
        // Para una impresión real NO recorremos canales RFCOMM: eso sólo alarga
        // el fallo y puede dejar intentos Bluetooth pendientes en el firmware.
        // Hacemos un intento SPP_INSECURE, una pausa de recuperación y un reintento.
        List<String> errors = new ArrayList<>();
        BluetoothSocket socket;

        try { bluetoothAdapter.cancelDiscovery(); } catch (Exception ignored) {}
        try { Thread.sleep(900); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }

        socket = tryConnect("SPP_INSECURE", () -> device.createInsecureRfcommSocketToServiceRecord(SPP_UUID), 5500, errors);
        if (socket != null) return socket;

        // Algunas miniprinters tardan en liberar el canal serie después de una
        // conexión anterior. Esperamos y repetimos exactamente el método probado.
        try { Thread.sleep(1400); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        try { bluetoothAdapter.cancelDiscovery(); } catch (Exception ignored) {}
        socket = tryConnect("SPP_INSECURE_RETRY", () -> device.createInsecureRfcommSocketToServiceRecord(SPP_UUID), 6500, errors);
        if (socket != null) return socket;

        // Último recurso estándar, sin escanear canales RFCOMM privados.
        socket = tryConnect("SPP_SECURE", () -> device.createRfcommSocketToServiceRecord(SPP_UUID), 5000, errors);
        if (socket != null) return socket;

        throw new Exception("No fue posible abrir SPP con la impresora seleccionada. Intentos: " + String.join(" | ", errors));
    }

    private interface SocketFactory {
        BluetoothSocket create() throws Exception;
    }

    private BluetoothSocket tryConnect(String methodName, SocketFactory factory, long timeoutMs, List<String> errors) {
        ExecutorService one = Executors.newSingleThreadExecutor();
        final AtomicReference<BluetoothSocket> socketRef = new AtomicReference<>(null);
        try {
            Future<BluetoothSocket> f = one.submit(() -> {
                BluetoothSocket s = factory.create();
                socketRef.set(s);
                s.connect();
                return s;
            });
            BluetoothSocket connected = f.get(timeoutMs, TimeUnit.MILLISECONDS);
            if (connected != null && connected.isConnected()) {
                prefs.edit().putString("last_connect_method", methodName).apply();
                return connected;
            }
            errors.add(methodName + ": sin conexión");
        } catch (java.util.concurrent.TimeoutException e) {
            BluetoothSocket s = socketRef.get();
            try { if (s != null) s.close(); } catch (Exception ignored) {}
            errors.add(methodName + ": timeout");
        } catch (Exception e) {
            BluetoothSocket s = socketRef.get();
            try { if (s != null) s.close(); } catch (Exception ignored) {}
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            String msg = cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
            errors.add(methodName + ": " + msg);
        } finally {
            one.shutdownNow();
        }
        return null;
    }


    private BluetoothSocket tryConnectWithStages(String methodName, SocketFactory factory, long timeoutMs,
                                                       List<String> errors, JSONArray stages, long startedAt) {
        stage(stages, methodName + "_START", true, "Intentando conexión (timeout " + timeoutMs + " ms)", startedAt);
        BluetoothSocket s = tryConnect(methodName, factory, timeoutMs, errors);
        if (s != null && s.isConnected()) {
            stage(stages, methodName + "_OK", true, "Conectado", startedAt);
            return s;
        }
        String last = errors.isEmpty() ? "Falló" : errors.get(errors.size() - 1);
        stage(stages, methodName + "_FAIL", false, last, startedAt);
        return null;
    }

    private void stage(JSONArray stages, String name, boolean ok, String detail, long startedAt) {
        try {
            JSONObject s = new JSONObject();
            s.put("name", name);
            s.put("ok", ok);
            s.put("detail", detail == null ? "" : detail);
            s.put("ms", System.currentTimeMillis() - startedAt);
            stages.put(s);
        } catch (Exception ignored) {}
    }

    private JSONObject failWithStages(JSONObject out, JSONArray stages, String code, String message, long startedAt) {
        fail(out, code, message);
        try {
            out.put("stages", stages);
            out.put("elapsedMs", System.currentTimeMillis() - startedAt);
        } catch (Exception ignored) {}
        return out;
    }

    private JSONArray uuidArray(ParcelUuid[] uuids) throws Exception {
        JSONArray arr = new JSONArray();
        if (uuids != null) {
            for (ParcelUuid u : uuids) {
                if (u != null) arr.put(u.getUuid().toString());
            }
        }
        return arr;
    }

    private boolean containsUuid(ParcelUuid[] uuids, UUID wanted) {
        if (uuids == null) return false;
        for (ParcelUuid u : uuids) {
            if (u != null && wanted.equals(u.getUuid())) return true;
        }
        return false;
    }

    private String bondStateName(int state) {
        if (state == BluetoothDevice.BOND_BONDED) return "BONDED";
        if (state == BluetoothDevice.BOND_BONDING) return "BONDING";
        return "NONE";
    }

    private String deviceTypeName(int type) {
        if (type == BluetoothDevice.DEVICE_TYPE_CLASSIC) return "CLASSIC";
        if (type == BluetoothDevice.DEVICE_TYPE_LE) return "BLE";
        if (type == BluetoothDevice.DEVICE_TYPE_DUAL) return "DUAL";
        return "UNKNOWN";
    }

    private boolean hasConnectPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT)
                        == PackageManager.PERMISSION_GRANTED;
    }

    private List<BluetoothDevice> getBondedDevicesSorted() {
        Set<BluetoothDevice> bonded = bluetoothAdapter.getBondedDevices();
        List<BluetoothDevice> list = new ArrayList<>(bonded == null ? Collections.emptySet() : bonded);
        list.sort(Comparator.comparing(this::safeName, String.CASE_INSENSITIVE_ORDER));
        return list;
    }

    private String safeName(BluetoothDevice d) {
        try {
            String n = d.getName();
            return (n == null || n.trim().isEmpty()) ? "Bluetooth " + d.getAddress() : n;
        } catch (SecurityException e) {
            return "Impresora Bluetooth";
        }
    }

    private void saveDevice(BluetoothDevice d) {
        prefs.edit()
                .putString(PREF_ADDR, d.getAddress())
                .putString(PREF_NAME, safeName(d))
                .apply();
    }

    private JSONObject deviceJson(String name, String address) throws Exception {
        JSONObject d = new JSONObject();
        d.put("id", address);
        d.put("address", address);
        d.put("name", name == null ? "Impresora Bluetooth" : name);
        return d;
    }

    private JSONObject baseResult() {
        JSONObject out = new JSONObject();
        try {
            out.put("bridge", "ProvsoftAndroidPrinter");
            out.put("version", "V52");
        } catch (Exception ignored) {}
        return out;
    }

    private JSONObject fail(JSONObject out, String reason, String message) {
        try {
            out.put("ok", false);
            out.put("reason", reason);
            out.put("message", message == null ? reason : message);
        } catch (Exception ignored) {}
        return out;
    }

    private String firstNonEmpty(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a.trim();
        if (b != null && !b.trim().isEmpty()) return b.trim();
        return "";
    }
}
