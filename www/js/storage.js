const LS_PREFIX = 'jiwei_';

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

function migrateOldDataToLib(libId) {
  let oldWrong = [];
  try { oldWrong = JSON.parse(localStorage.getItem('wrong_ids') || '[]'); } catch(e) {}
  if (oldWrong.length > 0) {
    localStorage.setItem(wrongKey(libId), JSON.stringify(oldWrong));
    localStorage.removeItem('wrong_ids');
  }
  ['sequence', 'random', 'wrong'].forEach(mode => {
    const val = localStorage.getItem('drone_progress_' + mode);
    if (val) {
      localStorage.setItem(LS_PREFIX + 'progress_' + libId + '_' + mode, val);
      localStorage.removeItem('drone_progress_' + mode);
    }
  });
  const oldGlobal = localStorage.getItem('drone_global_progress');
  if (oldGlobal) {
    localStorage.setItem(LS_PREFIX + 'global_' + libId, oldGlobal);
    localStorage.removeItem('drone_global_progress');
  }
  const oldExam = localStorage.getItem('drone_exam_history');
  if (oldExam) {
    localStorage.setItem(LS_PREFIX + 'exam_history_' + libId, oldExam);
    localStorage.removeItem('drone_exam_history');
  }
  const oldWM = localStorage.getItem('wrong_mode');
  if (oldWM) {
    localStorage.setItem(LS_PREFIX + 'wrong_mode', oldWM);
    localStorage.removeItem('wrong_mode');
  }
  const oldSettings = localStorage.getItem('drone_settings');
  if (oldSettings) {
    localStorage.setItem(LS_PREFIX + 'settings', oldSettings);
    localStorage.removeItem('drone_settings');
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
