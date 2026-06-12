package com.rikka.jiwei;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {

    private long currentDownloadId = -1;
    private BroadcastReceiver downloadReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyNavBarColor("#F9F6F1");
        getBridge().getWebView().addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        setupSystemBars();
    }

    @Override
    protected void onStart() {
        super.onStart();
        registerDownloadReceiver();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (downloadReceiver != null) {
            try {
                unregisterReceiver(downloadReceiver);
            } catch (Exception e) {
                // 可能未注册或已注销
            }
            downloadReceiver = null;
        }
    }

    private void registerDownloadReceiver() {
        if (downloadReceiver != null) return;
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id == currentDownloadId) {
                    checkDownloadAndInstall(id);
                }
            }
        };
        registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
    }

    private void checkDownloadAndInstall(long downloadId) {
        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) return;
        
        Cursor cursor = dm.query(new DownloadManager.Query().setFilterById(downloadId));
        if (cursor != null && cursor.moveToFirst()) {
            int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int uriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
            if (statusIdx >= 0 && uriIdx >= 0) {
                int status = cursor.getInt(statusIdx);
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    String uriString = cursor.getString(uriIdx);
                    installApk(Uri.parse(uriString));
                }
            }
            cursor.close();
        }
    }

    private void installApk(Uri apkUri) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        Uri contentUri;
        if (apkUri.getScheme().equals("file")) {
            File file = new File(apkUri.getPath());
            contentUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
        } else {
            contentUri = apkUri;
        }
        intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    private void setupSystemBars() {
        Window window = getWindow();
        if (window == null) return;
        View decorView = window.getDecorView();

        // Android 10+：移除导航栏和内容之间的强制对比阴影线
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        // 状态栏设为 App 背景色，同时图标用深色
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(Color.parseColor("#F9F6F1"));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int flags = decorView.getSystemUiVisibility();
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            decorView.setSystemUiVisibility(flags);
        }

        // 将整个窗口背景设为 App 背景色，避免 WebView 边缘露出系统默认黑色/白色
        decorView.setBackgroundColor(Color.parseColor("#F9F6F1"));

        // WebView 背景色也设为一致颜色
        getBridge().getWebView().setBackgroundColor(Color.parseColor("#F9F6F1"));
    }

    private void applyNavBarColor(String color) {
        Window window = getWindow();
        if (window != null) {
            window.setNavigationBarColor(Color.parseColor(color));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                int navBarColor = Color.parseColor(color);
                double luminance = (0.299 * Color.red(navBarColor) + 0.587 * Color.green(navBarColor) + 0.114 * Color.blue(navBarColor)) / 255;
                View decorView = window.getDecorView();
                int flags = decorView.getSystemUiVisibility();
                if (luminance > 0.5) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                } else {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
                decorView.setSystemUiVisibility(flags);
            }
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void setNavBarColor(String color) {
            runOnUiThread(() -> applyNavBarColor(color));
        }

        @JavascriptInterface
        public void openTemplateWithSystemApp() {
            runOnUiThread(() -> {
                try {
                    File cacheDir = new File(getCacheDir(), "shared_templates");
                    cacheDir.mkdirs();
                    File outFile = new File(cacheDir, "积微-题库模板.xlsx");
                    InputStream is = getAssets().open("public/template.xlsx");
                    FileOutputStream fos = new FileOutputStream(outFile);
                    byte[] buffer = new byte[1024];
                    int read;
                    while ((read = is.read(buffer)) != -1) {
                        fos.write(buffer, 0, read);
                    }
                    fos.close();
                    is.close();

                    Uri uri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        outFile
                    );

                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                    if (intent.resolveActivity(getPackageManager()) == null) {
                        Intent shareIntent = new Intent(Intent.ACTION_SEND);
                        shareIntent.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                        shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
                        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(shareIntent, "分享模板"));
                    } else {
                        startActivity(intent);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    Toast.makeText(MainActivity.this, "打开失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void downloadApk(String url, String fileName) {
            runOnUiThread(() -> {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setTitle("积微更新下载");
                    request.setDescription("正在下载最新版本...");
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                    request.setMimeType("application/vnd.android.package-archive");
                    
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) {
                        currentDownloadId = dm.enqueue(request);
                        Toast.makeText(MainActivity.this, "开始下载更新...", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    Toast.makeText(MainActivity.this, "下载失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "unknown";
            }
        }
    }
}
