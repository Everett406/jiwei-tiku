# 积微 (Jiwei) — 通用刷题 APP

> 一个基于 Capacitor + 原生 Web 技术栈构建的 Android 刷题应用。支持多题库管理、顺序/随机练习、错题本、模拟考试，以及 JSON/Excel 自定义导入。

---

## 项目简介

本项目最初是为无人机装调试题库设计的辅助工具，现已进化为**通用题库生成器**——任何有 Excel 或 JSON 的人，都可以在一分钟内创建自己的刷题库。

- **应用名称**：积微
- **包名**：`com.rikka.jiwei`
- **旧版共存**：旧应用（包名 `com.uav.dronequiz`）可继续保留，两者数据独立

---

## 技术栈

- **前端**：HTML5 + CSS3 + ES6+ JavaScript（无框架）
- **混合层**：Capacitor 6
- **原生层**：Android SDK 34 / Gradle 8.2.1 / AGP 8.2.1
- **数据**：嵌入式 `data.js` + `localStorage` 持久化 + `SheetJS` 解析 Excel

---

## 核心功能

- ✅ **多题库管理** — 增删改题库，每个题库独立进度、错题、考试记录
- ✅ **顺序/随机练习** — 支持选项乱序、手势滑动切题
- ✅ **错题本** — 自动收录，支持批量移除和单独复习
- ✅ **模拟考试** — 自定义题量，自动平衡判断/单选比例，计时提交
- ✅ **JSON / Excel 导入** — 标准 7 列 Excel 格式（题干 | A | B | C | D | E | 答案）
- ✅ **AI 提示词辅助** — 内置一键复制 Prompt，教 AI 把任意 PDF/Word/Excel 转成标准格式
- ✅ **模板分享** — Android 端调用系统级分享，可用 WPS/微信/QQ 等打开空白模板

---

## 已集成的原生能力

- ✅ 震动反馈（Haptics）— 答题正确/错误提示
- ✅ 本地通知（Local Notifications）— 考试结束推送成绩
- ✅ 状态栏适配（Status Bar）— 跟随亮/暗主题
- ✅ 返回键拦截（App）— 返回首页而非直接退出
- ✅ 原生启动屏（Splash Screen）
- ✅ 导航栏颜色自定义（`AndroidBridge.setNavBarColor`）
- ✅ 模板文件系统分享（`AndroidBridge.openTemplateWithSystemApp`）

---

## 目录结构

```
drone_apk_build/
├── android/              # Capacitor 生成的 Android 工程
├── www/                  # Web 资源（构建前同步到 android/app/src/main/assets/public）
│   ├── css/              # 样式模块
│   │   ├── base.css      # 基础/重置 + 布局
│   │   ├── components.css# 组件级样式
│   │   └── utils.css     # 工具类/动画
│   ├── js/               # 业务逻辑模块
│   │   ├── state.js      # 全局状态与常量
│   │   ├── utils.js      # 通用工具函数
│   │   ├── storage.js    # localStorage 封装 + 数据迁移
│   │   ├── settings.js   # 设置相关
│   │   ├── modal.js      # 弹窗/提示
│   │   ├── home.js       # 首页 + 导入 + AI 提示词
│   │   ├── practice.js   # 练习模式
│   │   ├── exam.js       # 考试模式
│   │   ├── import.js     # 导入逻辑
│   │   └── main.js       # 初始化与全局事件绑定
│   ├── index.html        # 入口页面
│   ├── data.js           # 默认嵌入式题库
│   ├── template.xlsx     # 空白导入模板
│   ├── xlsx.full.min.js  # SheetJS（Excel 解析）
│   ├── manifest.json     # PWA 配置
│   └── sw.js             # Service Worker
├── app.js                # 历史遗留单文件（已拆分至 js/）
├── style.css             # 历史遗留单文件（已拆分至 css/）
├── capacitor.config.json # Capacitor 配置
└── package.json          # Node 依赖
```

---

## 快速开始

### 环境要求
- Node.js 18+
- Android SDK 34
- Gradle 8.2.1
- OpenJDK 17

### 安装与构建

```bash
# 1. 安装依赖
npm install

# 2. 若修改了 www/ 下任何文件，必须同步到 Android assets
# （Capacitor 推荐方式）
npx cap copy android

# 或手动复制（当 rsync 不可用时）
rm -rf android/app/src/main/assets/public/*
cp -r www/css www/js www/res www/index.html www/data.js www/template.xlsx www/xlsx.full.min.js \
  android/app/src/main/assets/public/

# 3. 构建 Debug APK
cd android
./gradlew app:assembleDebug

# 4. 构建 Release APK（已配置签名）
./gradlew app:assembleRelease
```

> ⚠️ **重要**：每次修改 `www/` 内的代码后，务必执行 `capacitor copy android`（或手动 `cp -r`）再打包，否则 APK 会包含旧版本的 Web 资源。此前曾因漏掉此步骤导致 APK 仍显示旧版“无人机装调” branding。

---

## 数据格式

### Excel 导入模板列说明

| 列 | 字段 | 说明 |
|---|---|---|
| 1 | 题干 | 题目内容 |
| 2 | 选项A | 第一个选项 |
| 3 | 选项B | 第二个选项 |
| 4 | 选项C | 第三个选项（可选）|
| 5 | 选项D | 第四个选项（可选）|
| 6 | 选项E | 第五个选项（可选）|
| 7 | 答案 | 正确选项字母（A-E）或中文词（正确/错误/对/错）|

- **判断题**：只需 A/B 两列，答案填 `正确/错误/对/错` 或 `A/B`
- **单选题**：至少 A/B 两列，最多 A-E

### JSON 格式示例

```json
[
  {
    "question": "无人机按用途分类可分为军用和______无人机。",
    "A": "民用",
    "B": "商用",
    "C": "工业",
    "D": "消费级",
    "answer": "A"
  },
  {
    "question": "多旋翼无人机通常使用电动机作为动力装置。",
    "A": "正确",
    "B": "错误",
    "answer": "A"
  }
]
```

---

## 数据迁移

首次启动时，若检测到旧版 `drone_*` localStorage 数据，会自动创建默认题库 **“无人机装调（默认）”**，并将旧进度、错题、考试记录迁移进去。旧版应用本身不受影响。

---

## 版本信息

- **v2.0** — 通用化 rebranding、多题库、Excel 导入、AI 提示词、模板系统分享
- **APK 体积**：约 4.3 MB
- **Release APK 路径**：`android/app/build/outputs/apk/release/app-release.apk`

---

## 作者

*尚家辉（赴野）*
