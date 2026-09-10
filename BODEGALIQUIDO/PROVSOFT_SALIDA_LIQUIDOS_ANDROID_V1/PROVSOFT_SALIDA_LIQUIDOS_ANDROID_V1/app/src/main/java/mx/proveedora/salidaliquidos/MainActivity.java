package mx.proveedora.salidaliquidos;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.IOException;
import java.util.List;

public class MainActivity extends Activity {
    private static final int REQ_BT_CONNECT = 4101;
    private static final int REQ_FILE_CHOOSER = 4102;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri pendingCameraUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " PROVSOFT-LIQUIDOS-ANDROID-V1");

        WebView.setWebContentsDebuggingEnabled(true);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    android.webkit.WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = filePathCallback;
                openImageChooser();
                return true;
            }
        });

        webView.addJavascriptInterface(new ProvsoftAndroidPrinter(this), "ProvsoftAndroidPrinter");
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");

        requestBluetoothPermissionIfNeeded();
    }

    private void requestBluetoothPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                        != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.BLUETOOTH_CONNECT},
                    REQ_BT_CONNECT
            );
        }
    }

    private void openImageChooser() {
        // V60: esta app usa el selector de archivos únicamente para TOMAR FOTO.
        // No se crea ACTION_CHOOSER ni se mezcla Galería + Cámara: abre cámara directa.
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);

        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) {
                throw new IOException("No se pudo crear cache/camera");
            }

            File photo = File.createTempFile("pdd_", ".jpg", dir);
            Uri cameraUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    photo
            );

            pendingCameraUri = cameraUri;
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // Fija una cámara del sistema para impedir el diálogo repetitivo "Abrir con..."
            // en equipos que tienen más de una app capaz de atender ACTION_IMAGE_CAPTURE.
            String cameraPackage = findSystemCameraPackage(camera);
            if (cameraPackage != null) {
                camera.setPackage(cameraPackage);
            }

            if (camera.resolveActivity(getPackageManager()) == null) {
                throw new IOException("No hay aplicación de cámara disponible");
            }

            startActivityForResult(camera, REQ_FILE_CHOOSER);
        } catch (Exception e) {
            pendingCameraUri = null;
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
            }
        }
    }

    private String findSystemCameraPackage(Intent cameraIntent) {
        PackageManager pm = getPackageManager();
        List<ResolveInfo> handlers = pm.queryIntentActivities(cameraIntent, PackageManager.MATCH_DEFAULT_ONLY);

        // Primero se prioriza una aplicación instalada como app del sistema/OEM.
        for (ResolveInfo info : handlers) {
            if (info.activityInfo == null || info.activityInfo.applicationInfo == null) continue;
            int flags = info.activityInfo.applicationInfo.flags;
            boolean systemApp = (flags & ApplicationInfo.FLAG_SYSTEM) != 0
                    || (flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
            if (systemApp) return info.activityInfo.packageName;
        }

        // Si el fabricante no marca su cámara como sistema, fija el primer handler real.
        for (ResolveInfo info : handlers) {
            if (info.activityInfo != null && info.activityInfo.packageName != null) {
                return info.activityInfo.packageName;
            }
        }
        return null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE_CHOOSER || fileCallback == null) return;

        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            } else if (pendingCameraUri != null) {
                result = new Uri[]{pendingCameraUri};
            }
        }

        fileCallback.onReceiveValue(result);
        fileCallback = null;
        pendingCameraUri = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
