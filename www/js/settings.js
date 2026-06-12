const DEFAULT_SETTINGS = {
  theme: 'system',
  fontFamily: 'default',
  fontSize: 'normal',
  autoNext: true,
  animSpeed: 'normal',
  autoCheckUpdate: true
};
function loadSettings() {
  try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(settingsKey()) || '{}')); }
  catch (e) { return DEFAULT_SETTINGS; }
}
function saveSettings(s) { localStorage.setItem(settingsKey(), JSON.stringify(s)); }

const FONT_LINKS = {
  handwriting: 'https://fonts.googleapis.cn/css2?family=Ma+Shan+Zheng&display=swap',
  wenkai: 'https://fonts.googleapis.cn/css2?family=LXGW+WenKai&display=swap',
  serif: 'https://fonts.googleapis.cn/css2?family=Noto+Serif+SC:wght@400;700&display=swap'
};

function applySettings() {
  const s = loadSettings();
  const root = document.documentElement;

  let t = s.theme;
  if (t === 'system') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', t);

  root.setAttribute('data-font-family', s.fontFamily);
  Object.keys(FONT_LINKS).forEach(key => {
    const id = 'font-link-' + key;
    const exists = document.getElementById(id);
    if (s.fontFamily === key && !exists) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = FONT_LINKS[key];
      document.head.appendChild(link);
    }
  });

  root.setAttribute('data-font-size', s.fontSize);

  const map = {
    slow: { dur: '.6s', trans: '40px', rot: '4deg' },
    normal: { dur: '.4s', trans: '30px', rot: '3deg' },
    fast: { dur: '.22s', trans: '20px', rot: '2deg' }
  };
  const cfg = map[s.animSpeed] || map.normal;
  root.style.setProperty('--anim-dur', cfg.dur);
  root.style.setProperty('--anim-translate', cfg.trans);
  root.style.setProperty('--anim-rotate', cfg.rot);

  updateSettingChips(s);
}

function updateSettingChips(s) {
  document.querySelectorAll('.settings-chips').forEach(group => {
    group.querySelectorAll('.settings-chip').forEach(btn => {
      const parent = btn.parentElement.id;
      let active = false;
      if (parent === 'theme-options') active = btn.dataset.val === s.theme;
      if (parent === 'font-options') active = btn.dataset.val === s.fontFamily;
      if (parent === 'size-options') active = btn.dataset.val === s.fontSize;
      if (parent === 'auto-options') active = btn.dataset.val === String(s.autoNext);
      if (parent === 'speed-options') active = btn.dataset.val === s.animSpeed;
      if (parent === 'update-options') active = btn.dataset.val === String(s.autoCheckUpdate);
      btn.classList.toggle('active', active);
    });
  });
}

function setSetting(key, val) {
  const s = loadSettings();
  if (key === 'autoNext' || key === 'autoCheckUpdate') val = val === 'true' || val === true;
  s[key] = val;
  saveSettings(s);
  applySettings();
}

function openSettingsPage() {
  showPage('page-settings', 'forward');
  applySettings();
}

/* ========== 版本更新检查 ========== */

const GITHUB_OWNER = 'Everett406';
const GITHUB_REPO = 'jiwei-tiku';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24小时

function getCurrentVersion() {
  // 优先从 AndroidBridge 获取原生版本号
  if (window.AndroidBridge && typeof window.AndroidBridge.getAppVersion === 'function') {
    try {
      return window.AndroidBridge.getAppVersion();
    } catch (e) {
      console.warn('获取原生版本失败:', e);
    }
  }
  // 回退：从 localStorage 读取上次记录的版本
  return localStorage.getItem('app_version') || '2.2.0';
}

function compareVersion(v1, v2) {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);
  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

async function checkForUpdate(force = false) {
  const s = loadSettings();
  if (!force && !s.autoCheckUpdate) return;

  const lastCheck = parseInt(localStorage.getItem('last_update_check') || '0');
  const now = Date.now();
  if (!force && now - lastCheck < UPDATE_CHECK_INTERVAL) return;

  localStorage.setItem('last_update_check', String(now));

  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!resp.ok) throw new Error('请求失败');
    const release = await resp.json();
    const latestVersion = release.tag_name.replace(/^v/, '');
    const currentVersion = getCurrentVersion();

    if (compareVersion(latestVersion, currentVersion) > 0) {
      // 有新版本
      const apkAsset = release.assets.find(a => a.name.endsWith('.apk'));
      const downloadUrl = apkAsset ? apkAsset.browser_download_url : null;
      showUpdateDialog(latestVersion, release.body || '', downloadUrl);
    } else if (force) {
      showToast('当前已是最新版本');
    }
  } catch (e) {
    console.error('检查更新失败:', e);
    if (force) showToast('检查更新失败，请稍后重试');
  }
}

function showUpdateDialog(version, changelog, downloadUrl) {
  showModal('hint', `发现新版本 v${version}\n\n${changelog}\n\n是否前往下载？`);
  // 覆盖确定按钮行为
  modalCb = () => {
    hideModal();
    if (downloadUrl && window.AndroidBridge && typeof window.AndroidBridge.downloadApk === 'function') {
      window.AndroidBridge.downloadApk(downloadUrl, `积微题库-v${version}.apk`);
      showToast('已开始下载，完成后将自动安装');
    } else if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    } else {
      showToast('下载链接不可用');
    }
  };
}

function downloadUpdate(url, version) {
  hideModal();
  if (!url) {
    showToast('下载链接不可用');
    return;
  }
  if (window.AndroidBridge && typeof window.AndroidBridge.downloadApk === 'function') {
    window.AndroidBridge.downloadApk(url, `积微题库-v${version}.apk`);
    showToast('已开始下载，完成后将自动安装');
  } else {
    window.open(url, '_blank');
  }
}
