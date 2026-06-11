/* ========== 配置 ========== */
const LS_PREFIX = 'jiwei_';
const PASS_SCORE = 80;

/* ========== 全局状态 ========== */
let QUESTIONS = [];
let libraries = [];
let currentLibId = null;
let currentLibName = '';

let currentMode = '';
let currentList = [];
let currentIndex = 0;
let userAnswers = {};
let checked = {};
let wrongIds = [];
let examTimer = null;
let examSecondsLeft = 0;
let autoNextTimer = null;
let slideDir = '';
let practiceFilter = 'all';
let pendingPracticeMode = '';
let wrongMode = 'remove';
let pendingWrongRemovals = [];
let currentReviewWrongList = [];

let menuLibId = null;
let pendingImportData = null;

/* ========== Storage: Libraries ========== */
function librariesKey() { return LS_PREFIX + 'libraries'; }
function libDataKey(id) { return LS_PREFIX + 'lib_' + id; }
function wrongKey(id) { return LS_PREFIX + 'wrong_' + id; }
function progressKey(mode) { return LS_PREFIX + 'progress_' + currentLibId + '_' + mode; }
function globalKey() { return LS_PREFIX + 'global_' + currentLibId; }
function examHistoryKey() { return LS_PREFIX + 'exam_history_' + currentLibId; }
function settingsKey() { return LS_PREFIX + 'settings'; }

function loadLibraries() {
  try { libraries = JSON.parse(localStorage.getItem(librariesKey()) || '[]'); }
  catch (e) { libraries = []; }
}
function saveLibraries() {
  localStorage.setItem(librariesKey(), JSON.stringify(libraries));
}
function getLibrary(id) {
  try { return JSON.parse(localStorage.getItem(libDataKey(id)) || '[]'); }
  catch (e) { return []; }
}
function saveLibraryData(id, data) {
  localStorage.setItem(libDataKey(id), JSON.stringify(data));
}
function addLibrary(name, questions, doRender = true) {
  const id = 'lib_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const lib = { id, name, count: questions.length, createdAt: Date.now(), updatedAt: Date.now() };
  libraries.unshift(lib);
  saveLibraries();
  saveLibraryData(id, questions);
  if (doRender) renderLibraryList();
  return lib;
}
function deleteLibrary(id) {
  libraries = libraries.filter(l => l.id !== id);
  saveLibraries();
  localStorage.removeItem(libDataKey(id));
  localStorage.removeItem(wrongKey(id));
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(LS_PREFIX + 'progress_' + id + '_')) localStorage.removeItem(k);
    if (k === LS_PREFIX + 'global_' + id) localStorage.removeItem(k);
    if (k === LS_PREFIX + 'exam_history_' + id) localStorage.removeItem(k);
  }
  renderLibraryList();
}
function renameLibrary(id, newName) {
  const lib = libraries.find(l => l.id === id);
  if (lib) {
    lib.name = newName;
    lib.updatedAt = Date.now();
    saveLibraries();
    renderLibraryList();
  }
}

/* ========== Storage: Progress & Wrong ========== */
function loadStorage() {
  if (!currentLibId) return;
  try { wrongIds = JSON.parse(localStorage.getItem(wrongKey(currentLibId)) || '[]'); } catch (e) { wrongIds = []; }
  try { const wm = localStorage.getItem(LS_PREFIX + 'wrong_mode'); if (wm === 'view' || wm === 'remove') wrongMode = wm; } catch (e) {}
}
function saveStorage() {
  if (!currentLibId) return;
  localStorage.setItem(wrongKey(currentLibId), JSON.stringify(wrongIds));
}
function isWrong(id) { return wrongIds.includes(id); }
function addWrong(id) { if (!isWrong(id)) { wrongIds.push(id); saveStorage(); updateStats(); } }
function removeWrong(id) { wrongIds = wrongIds.filter(x => x !== id); saveStorage(); updateStats(); }

function saveGlobal(data) { if (currentLibId) localStorage.setItem(globalKey(), JSON.stringify(data)); }
function loadGlobal() {
  if (!currentLibId) return {};
  try { return JSON.parse(localStorage.getItem(globalKey()) || '{}'); } catch (e) { return {}; }
}
function mergeToGlobal() {
  if (!currentLibId) return;
  const g = loadGlobal();
  g.answers = Object.assign({}, g.answers || {}, userAnswers);
  g.checked = Object.assign({}, g.checked || {}, checked);
  saveGlobal(g);
}
function getGlobalAnswers() { return loadGlobal().answers || {}; }
function getGlobalChecked() { return loadGlobal().checked || {}; }
function updateProgressAnswer(qid, answer) {
  if (!currentLibId) return;
  ['sequence', 'random', 'wrong'].forEach(mode => {
    const p = loadProgress(mode);
    if (p && p.answers) {
      p.answers[qid] = answer;
      p.checked[qid] = true;
      localStorage.setItem(progressKey(mode), JSON.stringify(p));
    }
  });
}

function saveProgress() {
  if (!currentLibId || !currentMode || !['sequence', 'random', 'wrong'].includes(currentMode)) return;
  const data = { index: currentIndex, answers: userAnswers, checked: checked };
  if (currentMode === 'random') data.order = currentList.map(q => q.id);
  if (currentMode === 'wrong') data.pendingWrongRemovals = pendingWrongRemovals;
  localStorage.setItem(progressKey(currentMode), JSON.stringify(data));
  if (currentMode !== 'wrong') mergeToGlobal();
}
function loadProgress(mode) {
  if (!currentLibId) return null;
  try {
    const raw = localStorage.getItem(progressKey(mode));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function clearProgress(mode) {
  if (!currentLibId) return;
  localStorage.removeItem(progressKey(mode));
}

function getDoneCount() {
  const c = getGlobalChecked();
  return Object.keys(c).filter(id => c[id]).length;
}

/* ========== Init & Migration ========== */
async function init() {
  loadLibraries();
  applySettings();

  // 恢复上次选中的题库（可选）
  const lastLib = localStorage.getItem(LS_PREFIX + 'current_lib');
  if (lastLib && libraries.find(l => l.id === lastLib)) {
    // 不自动进入，留在首页
  }

  // 如果没有题库，加载默认题库并迁移旧数据
  if (libraries.length === 0) {
    let defaultData = null;
    if (typeof EMBEDDED_QUESTIONS !== 'undefined' && Array.isArray(EMBEDDED_QUESTIONS)) {
      defaultData = EMBEDDED_QUESTIONS;
    } else {
      try {
        const res = await fetch('data/questions.json');
        defaultData = await res.json();
      } catch (e) {
        console.log('默认题库加载失败', e);
      }
    }
    if (defaultData && defaultData.length > 0) {
      const lib = addLibrary('无人机装调（默认）', normalizeQuestions(defaultData), false);
      migrateOldDataToLib(lib.id);
    }
  }

  renderLibraryList();
  bindSwipe('#page-practice .stage', () => nextQuestion(), () => prevQuestion());
  bindSwipe('#page-exam .stage', () => nextExam(), () => prevExam());
  document.getElementById('modal').addEventListener('click', onModalOverlayClick);
}

function migrateOldDataToLib(libId) {
  // wrong_ids
  let oldWrong = [];
  try { oldWrong = JSON.parse(localStorage.getItem('wrong_ids') || '[]'); } catch(e) {}
  if (oldWrong.length > 0) {
    localStorage.setItem(wrongKey(libId), JSON.stringify(oldWrong));
    localStorage.removeItem('wrong_ids');
  }
  // progress
  ['sequence', 'random', 'wrong'].forEach(mode => {
    const val = localStorage.getItem('drone_progress_' + mode);
    if (val) {
      localStorage.setItem(LS_PREFIX + 'progress_' + libId + '_' + mode, val);
      localStorage.removeItem('drone_progress_' + mode);
    }
  });
  // global
  const oldGlobal = localStorage.getItem('drone_global_progress');
  if (oldGlobal) {
    localStorage.setItem(LS_PREFIX + 'global_' + libId, oldGlobal);
    localStorage.removeItem('drone_global_progress');
  }
  // exam history
  const oldExam = localStorage.getItem('drone_exam_history');
  if (oldExam) {
    localStorage.setItem(LS_PREFIX + 'exam_history_' + libId, oldExam);
    localStorage.removeItem('drone_exam_history');
  }
  // wrong_mode
  const oldWM = localStorage.getItem('wrong_mode');
  if (oldWM) {
    localStorage.setItem(LS_PREFIX + 'wrong_mode', oldWM);
    localStorage.removeItem('wrong_mode');
  }
  // settings
  const oldSettings = localStorage.getItem('drone_settings');
  if (oldSettings) {
    localStorage.setItem(LS_PREFIX + 'settings', oldSettings);
    localStorage.removeItem('drone_settings');
  }
}

/* ========== Library List UI ========== */
function renderLibraryList() {
  const container = document.getElementById('lib-list');
  if (libraries.length === 0) {
    container.innerHTML = '<div class="empty"><span class="empty-icon">📚</span><p>暂无题库，点击上方导入</p></div>';
    return;
  }
  container.innerHTML = libraries.map(lib => {
    const meta = getLibProgressText(lib.id);
    return `<div class="lib-card" onclick="enterLibrary('${lib.id}')">
      <div class="lib-info">
        <div class="lib-name">${escapeHtml(lib.name)}</div>
        <div class="lib-meta">${lib.count} 题 · ${meta}</div>
      </div>
      <div class="lib-actions" onclick="event.stopPropagation(); openLibMenu('${lib.id}')">
        <button class="lib-menu-btn">⋮</button>
      </div>
    </div>`;
  }).join('');
}

function getLibProgressText(libId) {
  const g = loadGlobalById(libId);
  const done = Object.keys(g.checked || {}).length;
  const lib = libraries.find(l => l.id === libId);
  const total = lib ? lib.count : 0;
  if (done === 0) return '尚未开始';
  if (done >= total) return '已完成';
  return '已做 ' + done + ' 题';
}

function loadGlobalById(libId) {
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + 'global_' + libId) || '{}'); }
  catch (e) { return {}; }
}

function enterLibrary(id) {
  currentLibId = id;
  const lib = libraries.find(l => l.id === id);
  currentLibName = lib ? lib.name : '';
  QUESTIONS = getLibrary(id);
  localStorage.setItem(LS_PREFIX + 'current_lib', id);
  loadStorage();
  migrateGlobal();
  updateStats();
  document.getElementById('lib-title').textContent = currentLibName;
  showPage('page-lib');
}

function goHome() {
  commitWrongRemovals();
  stopExamTimer();
  closeSheet();
  closeLibMenu();
  currentLibId = null;
  currentLibName = '';
  QUESTIONS = [];
  localStorage.removeItem(LS_PREFIX + 'current_lib');
  renderLibraryList();
  showPage('page-home');
}
function goLibHome() {
  commitWrongRemovals();
  stopExamTimer();
  closeSheet();
  closeExamCard();
  if (currentLibId) {
    updateStats();
    showPage('page-lib');
  } else {
    goHome();
  }
}

function migrateGlobal() {
  if (!currentLibId) return;
  const g = loadGlobal();
  if (g && g._migrated) return;
  let changed = false;
  ['sequence', 'random', 'wrong'].forEach(mode => {
    const p = loadProgress(mode);
    if (p && p.checked) {
      Object.keys(p.checked).forEach(id => {
        if (p.checked[id]) {
          g.checked = g.checked || {};
          g.answers = g.answers || {};
          g.checked[id] = true;
          if (p.answers && p.answers[id]) g.answers[id] = p.answers[id];
          changed = true;
        }
      });
    }
  });
  wrongIds.forEach(id => {
    g.checked = g.checked || {};
    g.checked[id] = true;
    changed = true;
  });
  if (changed) {
    g._migrated = true;
    saveGlobal(g);
  }
}

/* ========== Import ========== */
function openImportSheet() {
  document.getElementById('import-file').value = '';
  document.getElementById('import-name').value = '';
  document.getElementById('import-hint').textContent = '支持 JSON 或 Excel (.xlsx) 格式，Excel 请使用下方模板';
  pendingImportData = null;
  document.getElementById('import-overlay').classList.add('show');
  document.getElementById('import-sheet').classList.add('show');
}
function closeImportSheet() {
  document.getElementById('import-overlay').classList.remove('show');
  document.getElementById('import-sheet').classList.remove('show');
}
function onImportFileChange() {
  const file = document.getElementById('import-file').files[0];
  if (!file) return;
  document.getElementById('import-name').value = file.name.replace(/\.[^.]+$/, '');
  const hint = document.getElementById('import-hint');
  hint.textContent = '正在解析 ' + file.name + ' ...';

  const reader = new FileReader();
  const ext = file.name.split('.').pop().toLowerCase();
  reader.onload = (e) => {
    try {
      if (ext === 'json') {
        const data = parseJSON(e.target.result);
        pendingImportData = data;
        hint.textContent = '解析成功，共 ' + data.length + ' 道题';
      } else if (ext === 'xlsx') {
        const data = parseExcel(e.target.result);
        pendingImportData = data;
        hint.textContent = '解析成功，共 ' + data.length + ' 道题';
      } else {
        hint.textContent = '不支持的文件格式';
        pendingImportData = null;
      }
    } catch (err) {
      hint.textContent = '解析失败：' + err.message;
      pendingImportData = null;
    }
  };
  if (ext === 'json') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}
function doImport() {
  const name = document.getElementById('import-name').value.trim();
  if (!name) { showModal('hint', '请输入题库名称'); return; }
  if (!pendingImportData || pendingImportData.length === 0) { showModal('hint', '没有可导入的数据，请先选择文件'); return; }
  addLibrary(name, pendingImportData);
  closeImportSheet();
  showModal('import-success');
}

function normalizeQuestions(data) {
  return data.map((q, idx) => ({
    id: q.id || (idx + 1),
    question: String(q.question || ''),
    answer: String(q.answer || '').trim().toUpperCase(),
    options: (q.options || []).map((opt, oidx) => ({
      key: opt.key || String.fromCharCode(65 + oidx),
      text: String(opt.text || '')
    })).filter(o => o.text)
  })).filter(q => q.question && q.answer && q.options.length >= 2);
}

function parseJSON(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('JSON 格式错误：应为题目数组');
  data.forEach((q, i) => {
    if (!q.question || !q.answer || !Array.isArray(q.options)) {
      throw new Error('第 ' + (i + 1) + ' 题格式不正确');
    }
  });
  return normalizeQuestions(data);
}

function parseExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) throw new Error('Excel 数据行数不足，请检查文件内容');

  let startRow = 0;
  const firstRow = rows[0].map(c => String(c).trim());
  const headerKeywords = ['题', '题目', '题干', 'question', '选项', '答案', 'answer', 'option'];
  const isHeader = firstRow.some(cell => headerKeywords.some(k => cell.toLowerCase().includes(k)));
  if (isHeader) startRow = 1;

  const questions = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;
    const qText = String(row[0] || '').trim();
    if (!qText) continue;

    const options = [];
    const labels = ['A', 'B', 'C', 'D', 'E'];
    for (let j = 0; j < 5; j++) {
      const text = String(row[j + 1] || '').trim();
      if (text) options.push({ key: labels[j], text });
    }
    if (options.length < 2) continue;

    let answer = String(row[6] !== undefined && row[6] !== '' ? row[6] : row[row.length - 1] || '').trim().toUpperCase();
    if (!/^[A-E]$/.test(answer)) {
      const lastCol = String(row[row.length - 1] || '').trim();
      if (lastCol === '正确' || lastCol === '对' || lastCol === '是') answer = 'A';
      else if (lastCol === '错误' || lastCol === '错' || lastCol === '否') answer = 'B';
      else answer = '';
    }
    if (!answer) continue;

    questions.push({ id: questions.length + 1, question: qText, answer, options });
  }
  if (questions.length === 0) throw new Error('未能从 Excel 中解析出有效题目，请检查列顺序或格式');
  return questions;
}

function downloadTemplate() {
  const a = document.createElement('a');
  a.href = 'template.xlsx';
  a.download = '积微-题库模板.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ========== Library Menu ========== */
function openLibMenu(id) {
  menuLibId = id;
  const lib = libraries.find(l => l.id === id);
  document.getElementById('lib-menu-title').textContent = lib ? lib.name : '题库管理';
  document.getElementById('lib-menu-overlay').classList.add('show');
  document.getElementById('lib-menu-sheet').classList.add('show');
}
function closeLibMenu() {
  document.getElementById('lib-menu-overlay').classList.remove('show');
  document.getElementById('lib-menu-sheet').classList.remove('show');
  menuLibId = null;
}
function renameCurrentLib() {
  if (!menuLibId) return;
  const lib = libraries.find(l => l.id === menuLibId);
  const newName = prompt('请输入新名称', lib ? lib.name : '');
  if (newName && newName.trim()) {
    renameLibrary(menuLibId, newName.trim());
  }
  closeLibMenu();
}
function deleteCurrentLib() {
  if (!menuLibId) return;
  showModal('confirm-delete-lib', null,
    () => { deleteLibrary(menuLibId); closeLibMenu(); },
    () => { closeLibMenu(); }
  );
}

/* ========== Settings ========== */
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

function openSettingsSheet() {
  document.getElementById('settings-overlay').classList.add('show');
  document.getElementById('settings-sheet').classList.add('show');
  setTimeout(applySettings, 0);
}
function closeSettingsSheet() {
  document.getElementById('settings-overlay').classList.remove('show');
  document.getElementById('settings-sheet').classList.remove('show');
}

function openFeedback() {
  window.open('https://fimws1ah34z.feishu.cn/share/base/form/shrcnUs1UWaqJEwgNYeE5ERdYOh', '_blank');
}

function loadExamHistory() {
  if (!currentLibId) return [];
  try { return JSON.parse(localStorage.getItem(examHistoryKey()) || '[]'); }
  catch (e) { return []; }
}
function saveExamResult(score, total) {
  if (!currentLibId) return;
  const list = loadExamHistory();
  list.push({ score: score, total: total, date: Date.now() });
  if (list.length > 50) list.splice(0, list.length - 50);
  localStorage.setItem(examHistoryKey(), JSON.stringify(list));
}
function calcPassRate() {
  const list = loadExamHistory();
  if (list.length === 0) return null;
  const windowSize = Math.min(list.length, 5);
  const recent = list.slice(-windowSize);
  const passCount = recent.filter(r => r.score >= PASS_SCORE).length;
  return Math.round(passCount / windowSize * 100);
}

function updateStats() {
  if (!currentLibId) return;
  const total = QUESTIONS.length;
  const wrong = wrongIds.length;
  const done = getDoneCount();
  const rate = done ? Math.max(0, Math.round((done - wrong) / done * 100)) : 0;
  const stTotal = document.getElementById('lib-stat-total');
  const stWrong = document.getElementById('lib-stat-wrong');
  const stDone = document.getElementById('lib-stat-done');
  const stRate = document.getElementById('lib-stat-rate');
  const stWrongB = document.getElementById('lib-stat-wrong-bottom');
  const stLast = document.getElementById('lib-stat-last-exam');
  const stPass = document.getElementById('lib-stat-pass-rate');

  if (stTotal) stTotal.textContent = total;
  if (stWrong) stWrong.textContent = wrong;
  if (stDone) stDone.textContent = done;
  if (stRate) stRate.textContent = rate + '%';
  if (stWrongB) stWrongB.textContent = wrong;

  const history = loadExamHistory();
  if (stLast) stLast.textContent = history.length ? history[history.length - 1].score + '分' : '--';
  if (stPass) {
    const pr = calcPassRate();
    stPass.textContent = pr === null ? '--' : pr + '%';
  }
}

/* ========== Nav ========== */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function commitWrongRemovals() {
  if (currentMode !== 'wrong' || pendingWrongRemovals.length === 0) return;
  pendingWrongRemovals.forEach(id => removeWrong(id));
  pendingWrongRemovals = [];
  saveProgress();
}

function showAbout() { showPage('page-about'); }

function onClearAll() {
  showModal('clear-all', null, () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(LS_PREFIX) || k.startsWith('drone_') || k === 'wrong_ids')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    wrongIds = [];
    userAnswers = {};
    checked = {};
    currentIndex = 0;
    libraries = [];
    currentLibId = null;
    currentLibName = '';
    QUESTIONS = [];
    renderLibraryList();
    goHome();
  });
}

/* ========== Mode start ========== */
function startMode(mode, filter) {
  const saved = loadProgress(mode);
  if (saved && typeof saved.index === 'number' && saved.index >= 0) {
    showModal('resume-progress', null,
      () => restoreProgress(mode, saved, filter),
      () => { doStartMode(mode, true, filter); }
    );
    return;
  }
  doStartMode(mode, true, filter);
}

function buildRandomList(filter) {
  const globalChecked = getGlobalChecked();
  let pool = QUESTIONS;
  if (filter === 'judge') pool = QUESTIONS.filter(q => q.options.length === 2);
  else if (filter === 'choice') pool = QUESTIONS.filter(q => q.options.length !== 2);
  const undone = pool.filter(q => !globalChecked[q.id]);
  if (undone.length > 0) return shuffle(undone.slice());
  return shuffle(pool.slice());
}

function filterQuestions(pool, filter) {
  if (filter === 'judge') return pool.filter(q => q.options.length === 2);
  if (filter === 'choice') return pool.filter(q => q.options.length !== 2);
  return pool;
}

function doStartMode(mode, reset, filter) {
  if (reset) clearProgress(mode);
  currentMode = mode;
  clearAutoNext();
  currentIndex = 0;
  const globalAns = getGlobalAnswers();
  const globalChecked = getGlobalChecked();
  if (mode === 'sequence') {
    currentList = filterQuestions(QUESTIONS.slice(), filter);
    userAnswers = Object.assign({}, globalAns);
    checked = Object.assign({}, globalChecked);
    document.getElementById('practice-title').textContent = '顺序刷题';
  } else if (mode === 'random') {
    currentList = buildRandomList(filter);
    userAnswers = {};
    checked = {};
    document.getElementById('practice-title').textContent = '随机刷题';
  } else if (mode === 'wrong') {
    currentList = QUESTIONS.filter(q => isWrong(q.id));
    if (currentList.length === 0) { showModal('empty-wrong'); return; }
    userAnswers = {};
    checked = {};
    pendingWrongRemovals = [];
    document.getElementById('practice-title').textContent = '错题本';
  }
  slideDir = '';
  renderPractice(false);
  showPage('page-practice');
}

function restoreProgress(mode, saved, filter) {
  currentMode = mode;
  clearAutoNext();
  const globalAns = getGlobalAnswers();
  const globalChecked = getGlobalChecked();
  currentIndex = saved.index || 0;
  if (mode === 'sequence') {
    currentList = filterQuestions(QUESTIONS.slice(), filter);
    userAnswers = Object.assign({}, globalAns, saved.answers || {});
    checked = Object.assign({}, globalChecked, saved.checked || {});
    document.getElementById('practice-title').textContent = '顺序刷题';
  } else if (mode === 'random') {
    if (saved.order && saved.order.length) {
      const map = {};
      QUESTIONS.forEach(q => map[q.id] = q);
      const restored = saved.order.map(id => map[id]).filter(Boolean);
      const globalDone = getGlobalChecked();
      currentList = restored.filter(q => !globalDone[q.id]);
      if (currentList.length === 0) {
        currentList = buildRandomList(filter);
        currentIndex = 0;
      } else {
        currentIndex = Math.min(currentIndex, currentList.length - 1);
      }
    } else {
      currentList = buildRandomList(filter);
      currentIndex = 0;
    }
    userAnswers = {};
    checked = {};
    document.getElementById('practice-title').textContent = '随机刷题';
  } else if (mode === 'wrong') {
    currentList = QUESTIONS.filter(q => isWrong(q.id));
    if (currentList.length === 0) { showModal('empty-wrong'); return; }
    userAnswers = Object.assign({}, saved.answers || {});
    checked = Object.assign({}, saved.checked || {});
    pendingWrongRemovals = saved.pendingWrongRemovals || [];
    document.getElementById('practice-title').textContent = '错题本';
  }
  slideDir = '';
  renderPractice(false);
  showPage('page-practice');
}

function openPracticeConfig(mode) {
  pendingPracticeMode = mode;
  practiceFilter = 'all';
  document.getElementById('practice-config-title').textContent = mode === 'sequence' ? '顺序练习设置' : '随机练习设置';
  updatePracticeConfigUI();
  document.getElementById('practice-config-overlay').classList.add('show');
  document.getElementById('practice-config-sheet').classList.add('show');
}
function closePracticeConfig() {
  document.getElementById('practice-config-overlay').classList.remove('show');
  document.getElementById('practice-config-sheet').classList.remove('show');
}
function setPracticeFilter(f) {
  practiceFilter = f;
  updatePracticeConfigUI();
}
function updatePracticeConfigUI() {
  document.querySelectorAll('#practice-config-sheet .config-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === practiceFilter);
  });
  const count = filterQuestions(QUESTIONS, practiceFilter).length;
  document.getElementById('practice-config-info').textContent = '共 ' + count + ' 题';
}
function confirmStartPractice() {
  closePracticeConfig();
  startMode(pendingPracticeMode, practiceFilter);
}

function openWrongConfig() {
  updateWrongConfigUI();
  document.getElementById('wrong-config-overlay').classList.add('show');
  document.getElementById('wrong-config-sheet').classList.add('show');
}
function closeWrongConfig() {
  document.getElementById('wrong-config-overlay').classList.remove('show');
  document.getElementById('wrong-config-sheet').classList.remove('show');
}
function setWrongMode(mode) {
  wrongMode = mode;
  localStorage.setItem(LS_PREFIX + 'wrong_mode', wrongMode);
  updateWrongConfigUI();
}
function updateWrongConfigUI() {
  document.querySelectorAll('#wrong-config-sheet .config-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === wrongMode);
  });
  const info = document.getElementById('wrong-config-info');
  if (info) {
    info.textContent = wrongMode === 'remove'
      ? '答对后自动移出错题本，可用于反复巩固。'
      : '仅浏览和作答错题，答对后仍会保留在错题本中。';
  }
}
function confirmStartWrong() {
  closeWrongConfig();
  startMode('wrong');
}

function startExam(count) {
  const total = QUESTIONS.length;
  if (total === 0) { showModal('not-enough'); return; }
  const n = count || 50;
  if (total < n) { showModal('not-enough'); return; }

  const judges = QUESTIONS.filter(q => q.options.length === 2);
  const choices = QUESTIONS.filter(q => q.options.length !== 2);

  let judgeCount = Math.round(n * judges.length / total);
  let choiceCount = n - judgeCount;

  if (judgeCount > judges.length) { choiceCount += (judgeCount - judges.length); judgeCount = judges.length; }
  if (choiceCount > choices.length) { judgeCount += (choiceCount - choices.length); choiceCount = choices.length; }
  if (judgeCount > judges.length) judgeCount = judges.length;
  if (choiceCount > choices.length) choiceCount = choices.length;

  const judgePool = shuffle(judges.slice()).slice(0, judgeCount);
  const choicePool = shuffle(choices.slice()).slice(0, choiceCount);
  currentList = shuffle(judgePool.concat(choicePool));

  currentIndex = 0; userAnswers = {}; slideDir = '';
  examSecondsLeft = Math.max(15, Math.floor(n * 0.9)) * 60;
  renderExam(false);
  showPage('page-exam');
  startExamTimer();
}

function openExamConfig() {
  document.getElementById('exam-config-overlay').classList.add('show');
  document.getElementById('exam-config-sheet').classList.add('show');
  setExamCount(50);
}
function closeExamConfig() {
  document.getElementById('exam-config-overlay').classList.remove('show');
  document.getElementById('exam-config-sheet').classList.remove('show');
}
function setExamCount(n) {
  document.getElementById('exam-custom-count').value = n;
  updateCustomCount();
}
function updateCustomCount() {
  const input = document.getElementById('exam-custom-count');
  let n = parseInt(input.value, 10);
  if (isNaN(n) || n < 5) n = 5;
  if (n > QUESTIONS.length) n = QUESTIONS.length;
  input.value = n;

  const total = QUESTIONS.length || 1;
  const judges = QUESTIONS.filter(q => q.options.length === 2).length;
  const choices = QUESTIONS.length - judges;
  let j = Math.round(n * judges / total);
  let c = n - j;
  if (j > judges) { c += (j - judges); j = judges; }
  if (c > choices) { j += (c - choices); c = choices; }
  if (j > judges) j = judges;
  if (c > choices) c = choices;

  document.getElementById('exam-config-info').textContent = '判断题约 ' + j + ' 道 · 单选题约 ' + c + ' 道 · 限时 ' + Math.max(15, Math.floor(n * 0.9)) + ' 分钟';

  document.querySelectorAll('#exam-config-sheet .config-chip').forEach(btn => {
    const num = parseInt(btn.textContent, 10);
    btn.classList.toggle('active', num === n);
  });
}
function confirmStartExam() {
  const n = parseInt(document.getElementById('exam-custom-count').value, 10);
  closeExamConfig();
  startExam(n);
}

/* ========== Render options ========== */
function renderOptions(containerId, q, mode) {
  const c = document.getElementById(containerId);
  c.innerHTML = '';
  q.options.forEach(opt => {
    const d = document.createElement('div');
    d.className = 'opt-note';
    const sel = userAnswers[q.id];
    const isChecked = mode === 'practice' && checked[q.id];
    const correct = isChecked && opt.key === q.answer;
    const wrong = isChecked && sel === opt.key && sel !== q.answer;

    let mark = '';
    if (correct) mark = '<span class="stamp ok">✓</span>';
    else if (wrong) mark = '<span class="stamp bad">✕</span>';

    d.innerHTML = '<div class="opt-circle">' + opt.key + '</div><div class="opt-txt">' + escapeHtml(opt.text) + mark + '</div>';
    d.onclick = () => selectOption(q.id, opt.key, mode);
    if (sel === opt.key) d.classList.add('selected');
    if (correct) d.classList.add('correct');
    if (wrong) d.classList.add('wrong');
    c.appendChild(d);
  });
}

function selectOption(qid, key, mode) {
  if (mode === 'practice') {
    if (checked[qid]) return;
    userAnswers[qid] = key;
    checked[qid] = true;
    const q = currentList[currentIndex];
    const correct = key === q.answer;
    if (!correct) addWrong(q.id);
    if (currentMode === 'wrong' && wrongMode === 'remove' && correct) {
      if (!pendingWrongRemovals.includes(q.id)) pendingWrongRemovals.push(q.id);
      updateProgressAnswer(qid, key);
      const allCleared = currentList.every(qq => pendingWrongRemovals.includes(qq.id));
      if (allCleared) {
        showModal('wrong-cleared');
        return;
      }
    }
    renderPractice(false);
    saveProgress();
    if (correct) {
      showFeedback(true, '回答正确 ~');
      const s = loadSettings();
      if (s.autoNext) {
        autoNextTimer = setTimeout(() => nextQuestion(true), 900);
      }
    } else {
      showFeedback(false, '正确答案：' + q.answer);
    }
  } else {
    userAnswers[qid] = key;
    renderExam(false);
  }
}

function showFeedback(ok, text) {
  const fb = document.getElementById('q-feedback');
  fb.textContent = text;
  fb.className = 'feedback-note ' + (ok ? 'ok' : 'bad') + ' show';
}
function hideFeedback() {
  const fb = document.getElementById('q-feedback');
  fb.className = 'feedback-note';
  fb.textContent = '';
}
function clearAutoNext() { if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; } }

/* ========== Slide animation ========== */
function animateTrack(id, dir) {
  const el = document.getElementById(id);
  el.classList.remove('slide-next', 'slide-prev');
  void el.offsetWidth;
  el.classList.add(dir === 'next' ? 'slide-next' : 'slide-prev');
}

/* ========== Swipe gesture ========== */
function bindSwipe(stageSelector, onNext, onPrev) {
  const el = document.querySelector(stageSelector);
  if (!el) return;
  let startX = 0, startY = 0;
  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 1.3) return;
    if (dx < 0) onNext(); else onPrev();
  }, { passive: true });
}

/* ========== Practice page ========== */
function renderPractice(animate = true) {
  const q = currentList[currentIndex];
  const total = currentList.length;
  if (animate) animateTrack('practice-track', slideDir || 'next');
  document.getElementById('practice-progress').style.width = ((currentIndex + 1) / total * 100) + '%';
  document.getElementById('practice-page').textContent = (currentIndex + 1) + ' / ' + total;

  let done = 0, right = 0;
  currentList.forEach(qq => { if (checked[qq.id]) { done++; if (userAnswers[qq.id] === qq.answer) right++; } });
  const acc = done ? Math.round(right / done * 100) + '%' : '--';
  document.getElementById('practice-accuracy').textContent = '正确率 ' + acc;

  document.getElementById('q-title').innerHTML = formatBlanks(escapeHtml(q.question));
  const isJudge = q.options.length === 2;
  const tag = document.getElementById('q-type');
  tag.textContent = isJudge ? '判断题' : '单选题';
  tag.className = 'q-badge ' + (isJudge ? 'judge' : '');
  renderOptions('q-options', q, 'practice');
  if (!checked[q.id]) hideFeedback();
  document.getElementById('btn-prev').disabled = currentIndex === 0;
  document.getElementById('btn-next').textContent = currentIndex === total - 1 ? '完成' : '下一题 ›';
}

function nextQuestion(auto = false) {
  clearAutoNext();
  if (currentIndex < currentList.length - 1) {
    slideDir = 'next'; currentIndex++; hideFeedback(); renderPractice(true); saveProgress();
  } else if (!auto) {
    showModal('finish-practice');
  }
}
function prevQuestion() {
  clearAutoNext();
  if (currentIndex > 0) { slideDir = 'prev'; currentIndex--; hideFeedback(); renderPractice(true); saveProgress(); }
}

/* ========== Sheet (选题) ========== */
function openSheet() {
  const grid = document.getElementById('sheet-grid');
  grid.innerHTML = '';
  currentList.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'sheet-num';
    d.textContent = i + 1;
    if (i === currentIndex) d.classList.add('current');
    if (checked[q.id]) {
      d.classList.add(userAnswers[q.id] === q.answer ? 'right' : 'wrong');
    }
    d.onclick = () => {
      slideDir = i > currentIndex ? 'next' : 'prev';
      currentIndex = i;
      hideFeedback();
      renderPractice(true);
      saveProgress();
      closeSheet();
    };
    grid.appendChild(d);
  });
  document.getElementById('sheet-overlay').classList.add('show');
  document.getElementById('sheet').classList.add('show');
}
function closeSheet() {
  document.getElementById('sheet-overlay').classList.remove('show');
  document.getElementById('sheet').classList.remove('show');
}

/* ========== Exam page ========== */
function renderExam(animate = true) {
  const q = currentList[currentIndex];
  const answered = Object.keys(userAnswers).length;
  if (animate) animateTrack('exam-track', slideDir || 'next');
  const totalExam = currentList.length;
  document.getElementById('exam-progress').style.width = (answered / totalExam * 100) + '%';
  const answeredEl = document.getElementById('exam-progress-text');
  if (answeredEl) answeredEl.textContent = '已答 ' + answered + ' / ' + totalExam;
  document.getElementById('exam-title').innerHTML = formatBlanks(escapeHtml(q.question));
  const isJudge = q.options.length === 2;
  const tag = document.getElementById('exam-type');
  tag.textContent = isJudge ? '判断题' : '单选题';
  tag.className = 'q-badge ' + (isJudge ? 'judge' : '');
  renderOptions('exam-options', q, 'exam');
  renderDots();
}
function renderDots() {
  const box = document.getElementById('exam-dots');
  box.innerHTML = '';
  currentList.forEach((q, i) => {
    const s = document.createElement('span');
    s.className = 'edot';
    if (i === currentIndex) s.classList.add('active');
    if (userAnswers[q.id]) s.classList.add('done');
    s.textContent = i + 1;
    s.onclick = () => { slideDir = i > currentIndex ? 'next' : 'prev'; currentIndex = i; renderExam(true); };
    box.appendChild(s);
  });
}
function nextExam() { if (currentIndex < currentList.length - 1) { slideDir = 'next'; currentIndex++; renderExam(true); } }
function prevExam() { if (currentIndex > 0) { slideDir = 'prev'; currentIndex--; renderExam(true); } }

function startExamTimer() {
  stopExamTimer();
  updateTimerDisplay();
  examTimer = setInterval(() => {
    examSecondsLeft--;
    updateTimerDisplay();
    if (examSecondsLeft <= 0) { stopExamTimer(); doSubmit(); }
  }, 1000);
}
function stopExamTimer() { if (examTimer) { clearInterval(examTimer); examTimer = null; } }
function updateTimerDisplay() {
  const m = Math.floor(examSecondsLeft / 60).toString().padStart(2, '0');
  const s = (examSecondsLeft % 60).toString().padStart(2, '0');
  document.getElementById('exam-timer').textContent = m + ':' + s;
}

function submitExam() {
  const answered = Object.keys(userAnswers).length;
  if (answered < currentList.length) { openExamCard(); return; }
  doSubmit();
}

function openExamCard() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = '';
  let answered = 0;
  currentList.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'sheet-num';
    d.textContent = i + 1;
    const isAns = !!userAnswers[q.id];
    if (isAns) {
      d.classList.add('right');
      answered++;
    }
    d.onclick = () => {
      currentIndex = i;
      slideDir = i > currentIndex ? 'next' : 'prev';
      renderExam(true);
      closeExamCard();
    };
    grid.appendChild(d);
  });
  const totalExam = currentList.length;
  document.getElementById('card-count').textContent = '已答 ' + answered + ' / ' + totalExam + ' 题，还有 ' + (totalExam - answered) + ' 题未完成';
  document.getElementById('card-overlay').classList.add('show');
  document.getElementById('card-panel').classList.add('show');
}
function closeExamCard() {
  document.getElementById('card-overlay').classList.remove('show');
  document.getElementById('card-panel').classList.remove('show');
}
function doSubmit() {
  stopExamTimer();
  let correct = 0;
  const wrongList = [];
  currentList.forEach(q => {
    if (userAnswers[q.id] === q.answer) correct++;
    else wrongList.push(q);
  });
  const g = loadGlobal();
  g.answers = Object.assign({}, g.answers || {}, userAnswers);
  g.checked = g.checked || {};
  currentList.forEach(q => { g.checked[q.id] = true; });
  saveGlobal(g);
  const totalExam = currentList.length;
  const score = totalExam > 0 ? Math.round(correct * (100 / totalExam)) : 0;
  saveExamResult(score, totalExam);
  showResult(score, correct, wrongList, totalExam);
}

/* ========== Result ========== */
function showResult(score, correct, wrongList, totalExam) {
  showPage('page-result');
  currentReviewWrongList = wrongList;
  document.getElementById('score-value').textContent = score;
  const st = document.getElementById('score-tag');
  st.textContent = score >= PASS_SCORE ? '及格' : '不及格';
  st.className = 'result-tag ' + (score >= PASS_SCORE ? 'ok' : 'bad');
  document.getElementById('score-detail').textContent = '答对 ' + correct + ' / ' + totalExam;
  const list = document.getElementById('review-list');
  list.innerHTML = '';
  if (wrongList.length === 0) {
    list.innerHTML = '<div class="empty"><span class="empty-icon">🌸</span><p>全部答对，太棒啦！</p></div>';
    return;
  }
  const hd = document.createElement('div');
  hd.className = 'review-head-row';
  hd.innerHTML = '<div class="review-title">错题回顾 (' + wrongList.length + ' 道)</div><button class="review-batch-btn" id="review-batch-btn" onclick="addAllWrongToBook()">全部加入错题本</button>';
  list.appendChild(hd);
  wrongList.forEach((q, idx) => {
    const user = userAnswers[q.id] || '未答';
    const already = isWrong(q.id);
    let optsHtml = '';
    q.options.forEach(opt => {
      const isCorrect = opt.key === q.answer;
      const isUser = opt.key === user;
      let cls = '';
      if (isCorrect) cls = 'ok';
      else if (isUser && !isCorrect) cls = 'bad';
      optsHtml += '<div class="review-opt ' + cls + '"><div class="review-opt-key">' + opt.key + '</div><div class="review-opt-txt">' + escapeHtml(opt.text) + '</div></div>';
    });
    const d = document.createElement('div');
    d.className = 'review-item';
    d.innerHTML = '<div class="review-header" onclick="toggleReviewItem(this)">' +
      '<span class="review-no">' + (idx + 1) + '</span>' +
      '<span class="review-ans ' + (user === q.answer ? 'ok' : 'bad') + '">' + user + '</span>' +
      '<span class="review-txt">' + formatBlanks(escapeHtml(q.question)) + '</span>' +
      '<span class="review-toggle">▼</span>' +
      '</div>' +
      '<div class="review-body">' +
      '<div class="review-body-inner">' +
      '<div class="review-options">' + optsHtml + '</div>' +
      '<div class="review-foot">' +
      '<span class="review-correct">正确答案：' + q.answer + '</span>' +
      '<button class="review-add-btn ' + (already ? 'added' : '') + '" onclick="addReviewToWrong(' + q.id + ', this)" ' + (already ? 'disabled' : '') + '>' + (already ? '已加入' : '加入错题本') + '</button>' +
      '</div>' +
      '</div>' +
      '</div>';
    list.appendChild(d);
  });
}

function toggleReviewItem(el) {
  const item = el.parentElement;
  item.classList.toggle('expanded');
}
function addReviewToWrong(id, btn) {
  addWrong(id);
  if (btn) {
    btn.textContent = '已加入';
    btn.disabled = true;
    btn.classList.add('added');
  }
}
function addAllWrongToBook() {
  if (!currentReviewWrongList || currentReviewWrongList.length === 0) return;
  currentReviewWrongList.forEach(q => addWrong(q.id));
  document.querySelectorAll('.review-add-btn').forEach(btn => {
    btn.textContent = '已加入';
    btn.disabled = true;
    btn.classList.add('added');
  });
  const batchBtn = document.getElementById('review-batch-btn');
  if (batchBtn) {
    batchBtn.textContent = '已全部加入';
    batchBtn.disabled = true;
  }
}

/* ========== Modal ========== */
const MODALS = {
  'confirm-exit': { title: '退出考试', text: '退出后当前考试进度将不保存，确定退出吗？', ok: () => goLibHome() },
  'confirm-submit': { title: '确认交卷', textFunc: n => { const total = currentList.length || 0; return '还有 ' + (total - n) + ' 道题未作答，确定交卷吗？'; }, ok: () => doSubmit() },
  'finish-practice': {
    title: '练习完成',
    text: '本轮练习已完成，是否返回首页？',
    ok: () => { commitWrongRemovals(); clearProgress(currentMode); goLibHome(); }
  },
  'empty-wrong': { title: '暂无错题', text: '错题本空空如也，先去刷题吧！', ok: () => hideModal(), hideCancel: true },
  'not-enough': { title: '题库不足', text: '题库题目数量不足以组成模拟考试。', ok: () => hideModal(), hideCancel: true },
  'wrong-cleared': { title: '太棒了', text: '恭喜！错题本已清空 ~', ok: () => goLibHome(), hideCancel: true },
  'resume-progress': {
    title: '恢复进度',
    text: '检测到上次未完成的练习进度，是否继续？',
    ok: () => {},
    cancel: () => {},
    hideCancel: false,
    btnOk: '继续进度',
    btnCancel: '重新开始'
  },
  'clear-all': {
    title: '清除所有数据',
    text: '确定要清空所有题库、做题进度、错题记录和设置吗？此操作无法恢复。',
    ok: () => {},
    hideCancel: false,
    btnOk: '确定清除',
    btnCancel: '取消'
  },
  'confirm-delete-lib': {
    title: '删除题库',
    text: '确定要删除这个题库吗？相关的做题进度和错题记录也会被清空。',
    ok: () => {},
    cancel: () => {},
    hideCancel: false,
    btnOk: '删除',
    btnCancel: '取消'
  },
  'import-success': {
    title: '导入成功',
    text: '题库已导入，快去刷题吧！',
    ok: () => hideModal(),
    hideCancel: true
  },
  'hint': {
    title: '提示',
    textFunc: t => t,
    ok: () => hideModal(),
    hideCancel: true
  }
};
let modalCb = null;
let modalCancelCb = null;
function showModal(key, arg, okOverride, cancelOverride) {
  const cfg = MODALS[key]; if (!cfg) return;
  document.getElementById('modal-title').textContent = cfg.title;
  document.getElementById('modal-text').textContent = cfg.textFunc ? cfg.textFunc(arg) : cfg.text;
  const c = document.getElementById('modal-cancel');
  c.style.display = cfg.hideCancel ? 'none' : 'inline-block';
  if (cfg.btnOk) document.getElementById('modal-ok').textContent = cfg.btnOk;
  else document.getElementById('modal-ok').textContent = '确定';
  if (cfg.btnCancel) document.getElementById('modal-cancel').textContent = cfg.btnCancel;
  else document.getElementById('modal-cancel').textContent = '取消';
  modalCb = okOverride || cfg.ok || null;
  modalCancelCb = cancelOverride || cfg.cancel || null;
  document.getElementById('modal').classList.add('show');
}
function hideModal() { document.getElementById('modal').classList.remove('show'); }
function onModalOk() { hideModal(); if (modalCb) { modalCb(); modalCb = null; } }
function onModalCancel() { hideModal(); if (modalCancelCb) { const cb = modalCancelCb; modalCancelCb = null; cb(); } }
function onModalOverlayClick(e) { if (e.target === document.getElementById('modal')) { hideModal(); } }

/* ========== Utils ========== */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}
function formatBlanks(t) {
  return t.replace(/_{3,}/g, '<span class="blank-line"></span>');
}

/* ========== Service Worker (PWA) ========== */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ========== 启动 ========== */
init();
