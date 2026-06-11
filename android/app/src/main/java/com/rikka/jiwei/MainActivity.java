package com.rikka.jiwei;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyNavBarColor("#F9F6F1");
        getBridge().getWebView().addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        setupSystemBars();
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
    }
}
