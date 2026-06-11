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
