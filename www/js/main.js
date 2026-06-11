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

function hapticsImpact(style) {
  const h = window.Capacitor?.Plugins?.Haptics;
  if (h) {
    h.impact({ style: style || 'LIGHT' }).catch(() => {});
  } else if (navigator.vibrate) {
    navigator.vibrate(20);
  }
}
function hapticsNotification(type) {
  const h = window.Capacitor?.Plugins?.Haptics;
  if (h) {
    h.notification({ type: type || 'SUCCESS' }).catch(() => {});
  } else if (navigator.vibrate) {
    if (type === 'ERROR') navigator.vibrate([30, 50, 30]);
    else navigator.vibrate(30);
  }
}

function handleBackButton() {
  // 优先关闭模态框
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('show')) {
    hideModal();
    return;
  }
  // 优先关闭浮层/sheet
  const overlays = [
    { overlay: 'sheet-overlay', panel: 'sheet', close: closeSheet },
    { overlay: 'card-overlay', panel: 'card-panel', close: closeExamCard },
    { overlay: 'import-overlay', panel: 'import-sheet', close: closeImportSheet },
    { overlay: 'exam-config-overlay', panel: 'exam-config-sheet', close: closeExamConfig },
    { overlay: 'practice-config-overlay', panel: 'practice-config-sheet', close: closePracticeConfig },
    { overlay: 'wrong-config-overlay', panel: 'wrong-config-sheet', close: closeWrongConfig },
    { overlay: 'lib-menu-overlay', panel: 'lib-menu-sheet', close: closeLibMenu },
  ];
  for (const o of overlays) {
    const overlay = document.getElementById(o.overlay);
    const panel = document.getElementById(o.panel);
    if ((overlay && overlay.classList.contains('show')) || (panel && panel.classList.contains('show'))) {
      o.close();
      return;
    }
  }
  // 页面级返回
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pageId = activePage.id;
  if (pageId === 'page-home') {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.exitApp();
    }
  } else if (pageId === 'page-practice' || pageId === 'page-exam' || pageId === 'page-result') {
    goLibHome();
  } else if (pageId === 'page-lib') {
    goHome();
  } else if (pageId === 'page-settings' || pageId === 'page-about' || pageId === 'page-template-guide') {
    goHome();
  } else {
    goHome();
  }
}

function registerBackButton() {
  // 方式1: Capacitor App 插件事件
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('backButton', handleBackButton).catch(() => {});
  }
  // 方式2: Cordova 兼容事件（作为 fallback）
  document.addEventListener('backbutton', handleBackButton);
}

async function init() {
  loadLibraries();
  applySettings();

  const lastLib = localStorage.getItem(LS_PREFIX + 'current_lib');
  if (lastLib && libraries.find(l => l.id === lastLib)) {
    // 不自动进入，留在首页
  }

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

  // 系统返回键监听（立即 + DOMReady 双重保险）
  registerBackButton();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBackButton);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
