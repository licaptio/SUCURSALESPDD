package mx.proveedora.salidapdd;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
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
                        .setNegativeButton("Cancelar", (dialog, which) -> {
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
    public String printBase64(String dataBase64, String jobJson) {
        JSONObject out = baseResult();
        BluetoothSocket socket = null;
        ExecutorService executor = Executors.newSingleThreadExecutor();
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

            Future<BluetoothSocket> connectFuture = executor.submit(() -> connectSocket(target));
            try {
                socket = connectFuture.get(12, TimeUnit.SECONDS);
            } catch (java.util.concurrent.TimeoutException timeout) {
                connectFuture.cancel(true);
                return fail(out, "CONNECT_TIMEOUT", "La impresora no respondió al conectar.").toString();
            }

            if (socket == null || !socket.isConnected()) return fail(out, "CONNECT_FAILED", "No se pudo abrir la conexión con la impresora.").toString();

            OutputStream os = socket.getOutputStream();
            os.write(bytes);
            os.flush();
            Thread.sleep(180);

            saveDevice(device);
            out.put("ok", true);
            out.put("bytesSent", bytes.length);
            out.put("device", deviceJson(safeName(device), device.getAddress()));
            out.put("paperMm", job.optInt("paperMm", 58));
            out.put("protocol", job.optString("protocol", "ESC/POS"));
            out.put("folio", job.optString("folio", ""));
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
            executor.shutdownNow();
        }
        return out.toString();
    }

    private BluetoothSocket connectSocket(BluetoothDevice device) throws Exception {
        // No hacemos discovery: trabajamos únicamente con dispositivos ya emparejados.
        // Así evitamos pedir BLUETOOTH_SCAN en Android 12+.
        Exception firstError = null;

        try {
            BluetoothSocket secure = device.createRfcommSocketToServiceRecord(SPP_UUID);
            secure.connect();
            return secure;
        } catch (Exception e) {
            firstError = e;
        }

        try {
            BluetoothSocket insecure = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            insecure.connect();
            return insecure;
        } catch (Exception ignored) {}

        try {
            Method m = device.getClass().getMethod("createRfcommSocket", int.class);
            BluetoothSocket channelOne = (BluetoothSocket) m.invoke(device, 1);
            channelOne.connect();
            return channelOne;
        } catch (Exception last) {
            if (firstError != null) throw firstError;
            throw last;
        }
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
            out.put("version", "V44");
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
