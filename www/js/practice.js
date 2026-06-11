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
      hapticsNotification('SUCCESS');
      const s = loadSettings();
      if (s.autoNext) {
        autoNextTimer = setTimeout(() => nextQuestion(true), 900);
      }
    } else {
      showFeedback(false, '正确答案：' + q.answer);
      hapticsNotification('ERROR');
    }
  } else {
    userAnswers[qid] = key;
    hapticsImpact('LIGHT');
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

function animateTrack(id, dir) {
  const el = document.getElementById(id);
  el.classList.remove('slide-next', 'slide-prev');
  void el.offsetWidth;
  el.classList.add(dir === 'next' ? 'slide-next' : 'slide-prev');
}

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
