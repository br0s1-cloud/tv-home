# Brosi Home

A custom Google TV home screen: just your apps, clock, weather, and DC sports scores, with no ads.

- `app/`: a tiny Android "shell" that registers as the TV's Home screen. It loads the UI in a full-screen WebView and lets the page open apps, switch HDMI inputs, open Settings, and fetch data.
- `web/`: the actual interface (HTML/CSS/JS), served from GitHub Pages. **Edit `web/config.js` to change teams, weather city, or default app order.** The TV picks up changes without a reinstall.

Every push to `main` deploys the UI to Pages and builds `brosi-home.apk` into the **latest** release.

## Remote controls

| Button | Does |
|---|---|
| D-pad / OK | Move / open |
| Menu (or the Edit chip) | Edit layout: OK picks up an app, ◀ ▶ moves it, ▼ hides/shows it, Back saves |
| Back | Return focus to the first app |
| Home | Always comes back here |

## Install (from a Mac on the same Wi-Fi)

```bash
brew install --cask android-platform-tools
adb connect <TV-IP>:5555
curl -L -o ~/Downloads/brosi-home.apk https://github.com/<you>/tv-home/releases/latest/download/brosi-home.apk
adb install -r ~/Downloads/brosi-home.apk
```

## Make it the Home screen

Test it first by opening **Brosi Home** from the regular app list. Once it works, run this:

```bash
adb shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
adb shell pm disable-user --user 0 com.google.android.tungsten.setupwraith
adb shell input keyevent KEYCODE_HOME   # pick Brosi Home if asked
```

## Undo (restores the stock Google TV home)

```bash
adb shell pm enable com.google.android.apps.tv.launcherx
adb shell pm enable com.google.android.tungsten.setupwraith
```
A factory reset also restores everything. Nothing is rooted or deleted.
