package com.sitekhata.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONObject;

/**
 * Hosts the Sitekhata web app (built into assets/www by apk/vite.config.ts) in a
 * WebView. Files are served from a fixed https origin so localStorage — where
 * the books are saved — stays put across app updates.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/";
    private static final int REQUEST_SAVE_FILE = 1;
    private static final int REQUEST_PICK_FILE = 2;
    private static final int REQUEST_PICK_CONTACT = 3;

    private WebView webView;
    private ValueCallback<Uri[]> pendingFilePick;
    private byte[] pendingSaveBytes;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
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

        webView.addJavascriptInterface(new Bridge(), "SitekhataAndroid");
        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppChromeClient());

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PICK_CONTACT) {
            deliverContact(resultCode == RESULT_OK && data != null ? data.getData() : null);
        } else if (requestCode == REQUEST_PICK_FILE) {
            if (pendingFilePick != null) {
                pendingFilePick.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                pendingFilePick = null;
            }
        } else if (requestCode == REQUEST_SAVE_FILE) {
            byte[] bytes = pendingSaveBytes;
            pendingSaveBytes = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) {
                return;
            }
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                out.write(bytes);
                Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
            } catch (IOException | NullPointerException e) {
                Toast.makeText(this, "Couldn't save the file", Toast.LENGTH_LONG).show();
            }
        }
    }

    private static Intent imageIntent(Uri uri, String caption) {
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("image/jpeg");
        intent.putExtra(Intent.EXTRA_STREAM, uri);
        if (caption != null && !caption.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, caption);
        intent.setClipData(ClipData.newRawUri("", uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return intent;
    }

    /** Reads the picked phone entry and hands it to src/lib/contacts.ts. */
    private void deliverContact(Uri uri) {
        String json = "null";
        if (uri != null) {
            String[] columns = {
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            };
            try (Cursor cursor = getContentResolver().query(uri, columns, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    JSONObject picked = new JSONObject();
                    picked.put("name", cursor.isNull(0) ? "" : cursor.getString(0));
                    picked.put("phone", cursor.isNull(1) ? "" : cursor.getString(1));
                    json = picked.toString();
                }
            } catch (Exception e) {
                Toast.makeText(this, "Couldn't read that contact", Toast.LENGTH_SHORT).show();
            }
        }
        webView.evaluateJavascript(
                "window.__sitekhataContactPicked && window.__sitekhataContactPicked(" + json + ")", null);
    }

    /** Methods the web app calls as window.SitekhataAndroid.*. */
    private class Bridge {
        /** Opens the system contact picker; no contacts permission needed. */
        @JavascriptInterface
        public void pickContact() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent intent = new Intent(
                            Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
                    try {
                        startActivityForResult(intent, REQUEST_PICK_CONTACT);
                    } catch (RuntimeException e) {
                        Toast.makeText(MainActivity.this, "No contacts app found", Toast.LENGTH_SHORT).show();
                        deliverContact(null);
                    }
                }
            });
        }

        /** Called from apk/android-bridge.ts when the web app downloads a file. */
        @JavascriptInterface
        public void saveFile(final String fileName, final String mimeType, final String contents) {
            askToSave(fileName, mimeType, contents.getBytes(StandardCharsets.UTF_8));
        }

        /** Save binary data (a JPG) through the system "Save to…" picker. */
        @JavascriptInterface
        public void saveBinary(final String fileName, final String mimeType, final String base64) {
            askToSave(fileName, mimeType, Base64.decode(base64, Base64.DEFAULT));
        }

        /**
         * Share an image. With whatsapp=true and a phone number, open WhatsApp
         * straight to that number's chat with the image; otherwise, or if
         * WhatsApp isn't there, open the share sheet.
         */
        @JavascriptInterface
        public void shareImage(
                final String base64, final String fileName, final String caption, final String phone, final boolean whatsapp) {
            final Uri uri;
            try {
                String safeName = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
                File file = new File(ShareProvider.shareDir(MainActivity.this), safeName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + safeName);
            } catch (IOException | IllegalArgumentException e) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this, "Couldn't make the image", Toast.LENGTH_LONG).show();
                    }
                });
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (whatsapp) {
                        for (String pkg : new String[] {"com.whatsapp", "com.whatsapp.w4b"}) {
                            // Image only (no text): WhatsApp attaches the picture to the chat.
                            Intent direct = imageIntent(uri, null);
                            direct.setPackage(pkg);
                            if (phone != null && !phone.isEmpty()) {
                                direct.putExtra("jid", phone + "@s.whatsapp.net");
                            }
                            try {
                                grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            } catch (RuntimeException ignored) {
                                // Not installed / not visible; the intent flag still grants access.
                            }
                            try {
                                startActivity(direct);
                                return;
                            } catch (ActivityNotFoundException | SecurityException ignored) {
                                // Try the next WhatsApp, then the share sheet.
                            }
                        }
                    }
                    Intent chooser = Intent.createChooser(imageIntent(uri, caption), "Send picture");
                    chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(chooser);
                }
            });
        }

        private void askToSave(final String fileName, final String mimeType, final byte[] bytes) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingSaveBytes = bytes;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(mimeType);
                    intent.putExtra(Intent.EXTRA_TITLE, fileName);
                    startActivityForResult(intent, REQUEST_SAVE_FILE);
                }
            });
        }
    }

    private class AppChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
                WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFilePick != null) {
                pendingFilePick.onReceiveValue(null);
            }
            pendingFilePick = callback;
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            // Backups are JSON, but many file managers label them oddly; allow any.
            intent.setType("*/*");
            try {
                startActivityForResult(intent, REQUEST_PICK_FILE);
            } catch (RuntimeException e) {
                pendingFilePick = null;
                callback.onReceiveValue(null);
                return false;
            }
            return true;
        }
    }

    private class AppWebViewClient extends WebViewClient {
        // API 24 overload (minSdk is 24). No @Override: scripts/build-apk.sh
        // compiles against the API 23 stubs, which predate it.
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (HOST.equals(url.getHost())) {
                return false;
            }
            // tel:, WhatsApp and other outside links open in their own apps.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (RuntimeException ignored) {
                // No app can handle it.
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) {
                return null;
            }
            String path = url.getPath() == null ? "" : url.getPath();
            while (path.startsWith("/")) {
                path = path.substring(1);
            }
            if (path.contains("..")) {
                return notFound();
            }
            // Real files (JS, CSS, fonts) by path; every app route gets index.html.
            if (!path.isEmpty() && path.lastIndexOf('.') > path.lastIndexOf('/')) {
                InputStream asset = openAsset("www/" + path);
                return asset == null ? notFound() : ok(mimeFor(path), asset);
            }
            InputStream index = openAsset("www/index.html");
            return index == null ? notFound() : ok("text/html", index);
        }
    }

    private InputStream openAsset(String name) {
        try {
            return getAssets().open(name);
        } catch (IOException e) {
            return null;
        }
    }

    private static WebResourceResponse ok(String mime, InputStream data) {
        boolean text = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json")
                || mime.endsWith("svg+xml");
        return new WebResourceResponse(
                mime, text ? "utf-8" : null, 200, "OK",
                Collections.singletonMap("Cache-Control", "no-cache"), data);
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                Collections.<String, String>emptyMap(), null);
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }
}
