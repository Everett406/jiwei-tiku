const DEFAULT_SETTINGS = {
  theme: 'system',
  fontFamily: 'default',
  fontSize: 'normal',
  autoNext: true,
  animSpeed: 'normal'
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
      btn.classList.toggle('active', active);
    });
  });
}

function setSetting(key, val) {
  const s = loadSettings();
  if (key === 'autoNext') val = val === 'true' || val === true;
  s[key] = val;
  saveSettings(s);
  applySettings();
}

function openSettingsPage() {
  showPage('page-settings', 'forward');
  applySettings();
}
