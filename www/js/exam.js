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
  showPage('page-exam', 'forward');
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

function showResult(score, correct, wrongList, totalExam) {
  showPage('page-result', 'forward');
  currentReviewWrongList = wrongList;
  animateNumber(document.getElementById('score-value'), score, 700);

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
