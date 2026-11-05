package com.brosi.tvhome;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.tv.TvContract;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Brosi Home: a thin native shell. The whole UI is a web page (GitHub Pages,
 * with a bundled offline copy). This class only exposes what a web page
 * can't do on its own: list/launch apps, list/open HDMI inputs, open
 * Settings, and fetch URLs without CORS limits.
 */
public class MainActivity extends Activity {

    private static final String ASSET_URL = "file:///android_asset/index.html";
    static final String EXTRA_PICK = "pick";
    private static final String STOCK_HOME = "com.google.android.apps.tv.launcherx";

    private volatile String launchMode = "";
    /** True while Brosi Home is the screen in front. */
    static volatile boolean resumed = false;

    private WebView web;
    private boolean usingFallback = false;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(8);
    private final Map<String, String> iconCache = new HashMap<>();
    private BroadcastReceiver packageReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getIntent() != null && getIntent().getBooleanExtra(EXTRA_PICK, false)) launchMode = "pick";
        BrosiService.start(this, false);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        // Layout is sized to the screen; ignore the TV's system font-size setting.
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // Only our own UI may load inside the launcher.
                return !isOwnUrl(req.getUrl().toString());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) fallBack();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse resp) {
                if (req.isForMainFrame() && resp.getStatusCode() >= 400) fallBack();
            }
        });

        String remote = BuildConfig.UI_URL;
        if (remote == null || remote.isEmpty()) {
            usingFallback = true;
            web.loadUrl(ASSET_URL);
        } else {
            web.loadUrl(remote);
        }
        web.requestFocus();

        packageReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                iconCache.clear();
                js("window.onAppsChanged && window.onAppsChanged()");
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(packageReceiver, f, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(packageReceiver, f);
        }
    }

    private boolean isOwnUrl(String url) {
        if (url.startsWith("file:///android_asset/")) return true;
        String remote = BuildConfig.UI_URL;
        return remote != null && !remote.isEmpty() && url.startsWith(remote);
    }

    private void fallBack() {
        if (usingFallback) return;
        usingFallback = true;
        main.post(() -> web.loadUrl(ASSET_URL));
    }

    private void js(String code) {
        main.post(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        js("window.onNativeResume && window.onNativeResume()");
        // If we booted offline, try the live UI again once we're back on screen.
        if (usingFallback && !BuildConfig.UI_URL.isEmpty()) {
            pool.submit(() -> {
                if (reachable(BuildConfig.UI_URL)) {
                    usingFallback = false;
                    main.post(() -> web.loadUrl(BuildConfig.UI_URL));
                }
            });
        }
    }

    @Override
    protected void onPause() {
        resumed = false;
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra(EXTRA_PICK, false)) {
            js("window.onNativePick && window.onNativePick()");
        } else {
            // Home pressed while we're already in front.
            js("window.onNativeHome && window.onNativeHome()");
        }
    }

    @Override
    public void onBackPressed() {
        // A home screen never exits; let the UI decide what Back means.
        js("window.onNativeBack && window.onNativeBack()");
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        if (e.getAction() == KeyEvent.ACTION_DOWN && (k == KeyEvent.KEYCODE_MENU || k == KeyEvent.KEYCODE_SETTINGS)) {
            js("window.onNativeMenu && window.onNativeMenu()");
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onDestroy() {
        if (packageReceiver != null) unregisterReceiver(packageReceiver);
        pool.shutdownNow();
        super.onDestroy();
    }

    private boolean reachable(String url) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(4000);
            c.setReadTimeout(4000);
            c.setRequestMethod("HEAD");
            int code = c.getResponseCode();
            c.disconnect();
            return code < 400;
        } catch (Exception ex) {
            return false;
        }
    }

    /** Renders a drawable to a PNG data URL. If h > 0, renders at exactly w x h; else scales to max width w. */
    private static String drawableToDataUrl(Drawable d, int w, int h) {
        Bitmap bmp;
        if (h > 0) {
            bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, w, h);
            d.draw(c);
        } else if (d instanceof BitmapDrawable && ((BitmapDrawable) d).getBitmap() != null) {
            bmp = ((BitmapDrawable) d).getBitmap();
        } else {
            int iw = d.getIntrinsicWidth() > 0 ? d.getIntrinsicWidth() : 320;
            int ih = d.getIntrinsicHeight() > 0 ? d.getIntrinsicHeight() : 180;
            bmp = Bitmap.createBitmap(iw, ih, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, iw, ih);
            d.draw(c);
        }
        if (h <= 0 && bmp.getWidth() > w) {
            int nh = Math.round(bmp.getHeight() * (w / (float) bmp.getWidth()));
            bmp = Bitmap.createScaledBitmap(bmp, w, Math.max(1, nh), true);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    /** Methods callable from JavaScript as window.Android.* */
    private class Bridge {

        @JavascriptInterface
        public String getApps() {
            PackageManager pm = getPackageManager();
            JSONArray arr = new JSONArray();
            Set<String> seen = new HashSet<>();
            seen.add(getPackageName());
            String[] categories = {Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER};
            for (String cat : categories) {
                Intent q = new Intent(Intent.ACTION_MAIN).addCategory(cat);
                List<ResolveInfo> list = pm.queryIntentActivities(q, 0);
                for (ResolveInfo ri : list) {
                    String pkg = ri.activityInfo.packageName;
                    if (seen.contains(pkg)) continue;
                    seen.add(pkg);
                    try {
                        JSONObject o = new JSONObject();
                        o.put("pkg", pkg);
                        o.put("label", ri.loadLabel(pm).toString());
                        o.put("tv", Intent.CATEGORY_LEANBACK_LAUNCHER.equals(cat));
                        arr.put(o);
                    } catch (Exception ignored) { }
                }
            }
            return arr.toString();
        }

        /**
         * Returns the app's own artwork: its icon, plus (for adaptive icons) the
         * foreground symbol and background layer separately, and its TV banner.
         * The UI shows the symbol big on a tile tinted from the background.
         */
        @JavascriptInterface
        public String getIcon(String pkg) {
            synchronized (iconCache) {
                if (iconCache.containsKey(pkg)) return iconCache.get(pkg);
            }
            PackageManager pm = getPackageManager();
            // Rendered icons are saved to disk per app version, so later launches skip the work.
            java.io.File file = null;
            try {
                android.content.pm.PackageInfo pi = pm.getPackageInfo(pkg, 0);
                long ver = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
                java.io.File dir = new java.io.File(getCacheDir(), "icons2");
                if (!dir.exists()) dir.mkdirs();
                file = new java.io.File(dir, pkg + "_" + ver + ".json");
                if (file.exists()) {
                    String s = new String(java.nio.file.Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
                    synchronized (iconCache) { iconCache.put(pkg, s); }
                    return s;
                }
            } catch (Exception ignored) { }

            JSONObject o = new JSONObject();
            try {
                Intent tv = pm.getLeanbackLaunchIntentForPackage(pkg);
                Intent phone = pm.getLaunchIntentForPackage(pkg);
                Drawable icon = null;
                try {
                    if (tv != null) icon = pm.getActivityIcon(tv);
                    else if (phone != null) icon = pm.getActivityIcon(phone);
                } catch (Exception ignored) { }
                if (icon == null) icon = pm.getApplicationIcon(pkg);

                if (Build.VERSION.SDK_INT >= 26 && icon instanceof AdaptiveIconDrawable) {
                    AdaptiveIconDrawable a = (AdaptiveIconDrawable) icon;
                    if (a.getForeground() != null) o.put("fg", drawableToDataUrl(a.getForeground(), 216, 216));
                    if (a.getBackground() != null) o.put("bg", drawableToDataUrl(a.getBackground(), 24, 24));
                }
                if (!o.has("fg")) o.put("src", drawableToDataUrl(icon, 160, 160));
                o.put("type", "icon");
            } catch (Exception e) {
                return "{}";
            }
            String s = o.toString();
            synchronized (iconCache) { iconCache.put(pkg, s); }
            if (file != null) {
                try { java.nio.file.Files.write(file.toPath(), s.getBytes(StandardCharsets.UTF_8)); } catch (Exception ignored) { }
            }
            return s;
        }

        @JavascriptInterface
        public boolean launch(String pkg) {
            PackageManager pm = getPackageManager();
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i == null) i = pm.getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            final Intent go = i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            main.post(() -> {
                try { startActivity(go); } catch (Exception ignored) { }
            });
            return true;
        }

        @JavascriptInterface
        public String getInputs() {
            JSONArray arr = new JSONArray();
            try {
                TvInputManager tim = (TvInputManager) getSystemService(Context.TV_INPUT_SERVICE);
                if (tim == null) return "[]";
                for (TvInputInfo info : tim.getTvInputList()) {
                    if (!info.isPassthroughInput()) continue;
                    if (info.isHidden(MainActivity.this)) continue;
                    CharSequence custom = info.loadCustomLabel(MainActivity.this);
                    CharSequence label = (custom != null && custom.length() > 0) ? custom : info.loadLabel(MainActivity.this);
                    JSONObject o = new JSONObject();
                    o.put("id", info.getId());
                    o.put("label", label == null ? "Input" : label.toString());
                    o.put("type", info.getType());
                    arr.put(o);
                }
            } catch (Exception ignored) { }
            return arr.toString();
        }

        @JavascriptInterface
        public boolean openInput(String id) {
            Uri uri = TvContract.buildChannelUriForPassthroughInput(id);
            Intent i = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(getPackageManager()) == null) return false;
            main.post(() -> {
                try { startActivity(i); } catch (Exception ignored) { }
            });
            return true;
        }

        @JavascriptInterface
        public void openSettings() {
            main.post(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void httpGet(String url, String cbId) {
            pool.submit(() -> {
                String err = "";
                String body = "";
                try {
                    if (!url.startsWith("https://")) throw new IllegalArgumentException("https only");
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(10000);
                    c.setRequestProperty("Accept", "application/json, text/html, application/xml;q=0.9, */*;q=0.8");
                    // Some sites (YouTube) serve a stripped page to unknown clients.
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; Smart TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36");
                    c.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
                    int code = c.getResponseCode();
                    InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while (in != null && (n = in.read(buf)) > 0) out.write(buf, 0, n);
                    body = out.toString(StandardCharsets.UTF_8.name());
                    if (code >= 400) err = "HTTP " + code;
                    c.disconnect();
                } catch (Exception e) {
                    err = String.valueOf(e.getMessage());
                }
                js("window.__nativeCb && window.__nativeCb(" + JSONObject.quote(cbId) + ","
                        + JSONObject.quote(err) + "," + JSONObject.quote(body) + ")");
            });
        }

        /** Open a web link in a specific app, e.g. a YouTube video in the YouTube TV app. */
        @JavascriptInterface
        public boolean openUrl(String url, String pkg) {
            if (url == null || !url.startsWith("https://")) return false;
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (pkg != null && !pkg.isEmpty()) {
                i.setPackage(pkg);
                if (i.resolveActivity(getPackageManager()) == null) i.setPackage(null);
            }
            if (i.resolveActivity(getPackageManager()) == null) return false;
            final Intent go = i;
            main.post(() -> {
                try { startActivity(go); } catch (Exception ignored) { }
            });
            return true;
        }

        /** The user chose an experience; stop re-showing the picker until the next wake. */
        @JavascriptInterface
        public void pickerDone() {
            BrosiService.pickerHandled = true;
        }

        /** "pick" once if we were opened by the wake/boot listener, else "". */
        @JavascriptInterface
        public String takeLaunchMode() {
            String m = launchMode;
            launchMode = "";
            return m;
        }

        /** Hand the screen over to the stock Google TV home. */
        @JavascriptInterface
        public boolean openStockHome() {
            PackageManager pm = getPackageManager();
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setPackage(STOCK_HOME);
            if (i.resolveActivity(pm) == null) i = pm.getLeanbackLaunchIntentForPackage(STOCK_HOME);
            if (i == null) i = pm.getLaunchIntentForPackage(STOCK_HOME);
            if (i == null) return false;
            final Intent go = i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            main.post(() -> {
                try { startActivity(go); } catch (Exception ignored) { }
            });
            return true;
        }

        @JavascriptInterface
        public String info() {
            try {
                JSONObject o = new JSONObject();
                o.put("version", BuildConfig.VERSION_NAME);
                o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("offline", usingFallback);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }
    }
}
