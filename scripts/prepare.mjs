// Max Editor — prepara os arquivos do app Android (usado pelo GitHub Actions)
//   node scripts/prepare.mjs web      → copia o site para ./www (conteúdo do APK)
//   node scripts/prepare.mjs android  → ajusta permissões, ícones, nome e versão do projeto Android
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mode = process.argv[2];
const ver = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

if (mode === 'web') {
  const www = path.join(root, 'www');
  fs.rmSync(www, { recursive: true, force: true });
  fs.mkdirSync(www, { recursive: true });
  for (const f of ['index.html', 'manifest.webmanifest', 'version.json']) fs.copyFileSync(path.join(root, f), path.join(www, f));
  for (const d of ['css', 'js', 'assets']) copyDir(path.join(root, d), path.join(www, d));
  fs.rmSync(path.join(www, 'assets', 'android-icons'), { recursive: true, force: true });
  console.log('www pronto (versão ' + ver + ')');
} else if (mode === 'android') {
  const app = path.join(root, 'android', 'app');
  const res = path.join(app, 'src', 'main', 'res');

  // --- permissões ---
  const mf = path.join(app, 'src', 'main', 'AndroidManifest.xml');
  let x = fs.readFileSync(mf, 'utf8');
  const perms = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-feature android:name="android.hardware.microphone" android:required="false" />',
  ];
  for (const p of perms) {
    const name = /android:name="([^"]+)"/.exec(p)[1];
    if (!x.includes(`"${name}"`)) x = x.replace(/<application/, `${p}\n    <application`);
  }
  fs.writeFileSync(mf, x);


  // --- plugin nativo de permissões (pede de verdade, com tela do Android) ---
  const javaDir = path.join(app, 'src', 'main', 'java', 'com', 'maxeditor', 'app');
  fs.mkdirSync(javaDir, { recursive: true });
  fs.writeFileSync(path.join(javaDir, 'MaxPermissionsPlugin.java'), `package com.maxeditor.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
  name = "MaxPermissions",
  permissions = {
    @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }),
    @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
    @Permission(alias = "media", strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
  }
)
public class MaxPermissionsPlugin extends Plugin {

  private JSObject status() {
    JSObject o = new JSObject();
    o.put("sdk", Build.VERSION.SDK_INT);
    o.put("mic", getPermissionState("mic").toString());
    if (Build.VERSION.SDK_INT >= 33) {
      o.put("media", getPermissionState("media").toString());
      o.put("notifications", getPermissionState("notifications").toString());
    } else {
      o.put("storage", getPermissionState("storage").toString());
    }
    return o;
  }

  @PluginMethod
  public void check(PluginCall call) {
    call.resolve(status());
  }

  @PluginMethod
  public void request(PluginCall call) {
    String[] aliases = Build.VERSION.SDK_INT >= 33
      ? new String[] { "mic", "media", "notifications" }
      : new String[] { "mic", "storage" };
    requestPermissionForAliases(aliases, call, "permsDone");
  }

  @PermissionCallback
  private void permsDone(PluginCall call) {
    call.resolve(status());
  }

  @PluginMethod
  public void storageInfo(PluginCall call) {
    try {
      android.os.StatFs s = new android.os.StatFs(getContext().getFilesDir().getAbsolutePath());
      JSObject o = new JSObject();
      o.put("total", s.getTotalBytes());
      o.put("free", s.getAvailableBytes());
      call.resolve(o);
    } catch (Exception e) {
      call.reject("statfs");
    }
  }

  @PluginMethod
  public void openSettings(PluginCall call) {
    Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    i.setData(Uri.fromParts("package", getContext().getPackageName(), null));
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(i);
    call.resolve();
  }

  @PluginMethod
  public void notify(PluginCall call) {
    try {
      Context c = getContext();
      if (Build.VERSION.SDK_INT >= 26) {
        NotificationChannel ch = new NotificationChannel("maxeditor", "Max Editor", NotificationManager.IMPORTANCE_DEFAULT);
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
      }
      NotificationCompat.Builder b = new NotificationCompat.Builder(c, "maxeditor")
        .setSmallIcon(c.getApplicationInfo().icon)
        .setContentTitle(call.getString("title", "Max Editor"))
        .setContentText(call.getString("body", ""))
        .setAutoCancel(true);
      NotificationManagerCompat.from(c).notify(1001, b.build());
    } catch (Exception e) {
      // sem permissão de notificação: ignora
    }
    call.resolve();
  }
}
`);
  fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), `package com.maxeditor.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(MaxPermissionsPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`);

  // --- ícones ---
  const iconsSrc = path.join(root, 'assets', 'android-icons');
  for (const d of fs.readdirSync(iconsSrc)) if (fs.statSync(path.join(iconsSrc, d)).isDirectory()) copyDir(path.join(iconsSrc, d), path.join(res, d));
  const any = path.join(res, 'mipmap-anydpi-v26');
  fs.rmSync(any, { recursive: true, force: true });
  fs.mkdirSync(any, { recursive: true });
  const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/max_icon_bg"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
  fs.writeFileSync(path.join(any, 'ic_launcher.xml'), adaptive);
  fs.writeFileSync(path.join(any, 'ic_launcher_round.xml'), adaptive);
  fs.mkdirSync(path.join(res, 'values'), { recursive: true });
  fs.writeFileSync(path.join(res, 'values', 'max_colors.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="max_icon_bg">' + (fs.existsSync(path.join(iconsSrc, 'bgcolor.txt')) ? fs.readFileSync(path.join(iconsSrc, 'bgcolor.txt'), 'utf8').trim() : '#17122E') + '</color>\n</resources>\n');

  // --- nome e versão ---
  const sf = path.join(res, 'values', 'strings.xml');
  if (fs.existsSync(sf)) {
    let s = fs.readFileSync(sf, 'utf8');
    s = s.replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1Max Editor$2').replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, '$1Max Editor$2');
    fs.writeFileSync(sf, s);
  }
  const gf = path.join(app, 'build.gradle');
  let g = fs.readFileSync(gf, 'utf8');
  const code = Number(process.env.GITHUB_RUN_NUMBER || 1);
  g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${ver}"`);
  fs.writeFileSync(gf, g);
  console.log(`android ajustado: versionName ${ver}, versionCode ${code}`);
} else {
  console.error('uso: node scripts/prepare.mjs web|android');
  process.exit(1);
}
