package com.brosi.tvhome;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Keeps a tiny listener alive so that whenever the TV wakes up (or boots),
 * Brosi Home shows the "Choose your experience" picker. Google TV stays the
 * system default; this only offers a choice.
 */
public class BrosiService extends Service {

    static final String EXTRA_BOOT = "boot";
    private static final String CHANNEL = "brosi";

    private final Handler main = new Handler(Looper.getMainLooper());
    private BroadcastReceiver screenReceiver;
    private long lastShown = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Brosi Home", NotificationManager.IMPORTANCE_MIN);
            if (nm != null) nm.createNotificationChannel(ch);
            nb = new Notification.Builder(this, CHANNEL);
        } else {
            nb = new Notification.Builder(this);
        }
        Notification n = nb.setContentTitle("Brosi Home")
                .setContentText("Ready to show the picker when the TV turns on")
                .setSmallIcon(R.mipmap.ic_launcher)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(1, n);
        }

        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                // Give Google TV a moment to finish waking so the picker lands on top.
                showPicker(1800);
            }
        };
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(screenReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screenReceiver, f);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getBooleanExtra(EXTRA_BOOT, false)) {
            showPicker(5000);
        }
        return START_STICKY;
    }

    private void showPicker(long delayMs) {
        long now = System.currentTimeMillis();
        if (now - lastShown < 8000) return; // ignore duplicate wake events
        lastShown = now;
        main.postDelayed(() -> {
            try {
                Intent i = new Intent(this, MainActivity.class)
                        .putExtra(MainActivity.EXTRA_PICK, true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                startActivity(i);
            } catch (Exception ignored) { }
        }, delayMs);
    }

    @Override
    public void onDestroy() {
        if (screenReceiver != null) unregisterReceiver(screenReceiver);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static void start(Context c, boolean fromBoot) {
        Intent i = new Intent(c, BrosiService.class).putExtra(EXTRA_BOOT, fromBoot);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { }
    }
}
