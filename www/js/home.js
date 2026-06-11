function renderLibraryList() {
  const container = document.getElementById('lib-list');
  if (libraries.length === 0) {
    container.innerHTML = '<div class="empty"><span class="empty-icon">📚</span><p>暂无题库，点击上方导入</p></div>';
    return;
  }
  container.innerHTML = libraries.map((lib, idx) => {
    const meta = getLibProgressText(lib.id);
    return `<div class="lib-card stagger-child" style="animation-delay:${idx * 0.05}s" onclick="enterLibrary('${lib.id}')">
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
  showPage('page-lib', 'forward');
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
  showPage('page-home', 'backward');
}
function goLibHome() {
  commitWrongRemovals();
  stopExamTimer();
  closeSheet();
  closeExamCard();
  if (currentLibId) {
    updateStats();
    showPage('page-lib', 'backward');
  } else {
    goHome();
  }
}

function showPage(id, direction) {
  const pages = document.querySelectorAll('.page');
  const newPage = document.getElementById(id);
  if (!newPage) return;
  pages.forEach(p => p.classList.remove('active', 'backward'));
  newPage.classList.add('active');
  if (direction === 'backward') {
    newPage.classList.add('backward');
  }
}
function commitWrongRemovals() {
  if (currentMode !== 'wrong' || pendingWrongRemovals.length === 0) return;
  pendingWrongRemovals.forEach(id => removeWrong(id));
  pendingWrongRemovals = [];
  saveProgress();
}

function showAbout() { showPage('page-about', 'forward'); }

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

function openFeedback() {
  window.open('https://fimws1ah34z.feishu.cn/share/base/form/shrcnUs1UWaqJEwgNYeE5ERdYOh', '_blank');
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
  if (filter === 'judge') pool = QUESTIONS.filter(q => q.options.length === 2 && !q.type);
  else if (filter === 'choice') pool = QUESTIONS.filter(q => q.options.length !== 2 && q.type !== 'multi');
  else if (filter === 'multi') pool = QUESTIONS.filter(q => q.type === 'multi');
  const undone = pool.filter(q => !globalChecked[q.id]);
  if (undone.length > 0) return shuffle(undone.slice());
  return shuffle(pool.slice());
}

function filterQuestions(pool, filter) {
  if (filter === 'judge') return pool.filter(q => q.options.length === 2 && !q.type);
  if (filter === 'choice') return pool.filter(q => q.options.length !== 2 && q.type !== 'multi');
  if (filter === 'multi') return pool.filter(q => q.type === 'multi');
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
  showPage('page-practice', 'forward');
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
  showPage('page-practice', 'forward');
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
