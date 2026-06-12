function renderOptions(containerId, q, mode) {
  const c = document.getElementById(containerId);
  c.innerHTML = '';
  const isMulti = q.type === 'multi';
  const isExam = mode === 'exam';

  q.options.forEach(opt => {
    const d = document.createElement('div');
    d.className = 'opt-note';
    const sel = userAnswers[q.id];
    const isChecked = mode === 'practice' && checked[q.id];

    let correct = false, wrong = false, selected = false;

    if (isMulti) {
      // 多选题：答案可能是 "ABC" 形式
      const selArr = sel ? String(sel).split('') : [];
      const ansArr = String(q.answer).split('');
      selected = selArr.includes(opt.key);
      if (isChecked) {
        correct = ansArr.includes(opt.key);
        wrong = selected && !ansArr.includes(opt.key);
        if (!selected && ansArr.includes(opt.key)) {
          // 未选但应该选 → 显示正确答案标记
          correct = true;
        }
      }
    } else {
      correct = isChecked && opt.key === q.answer;
      wrong = isChecked && sel === opt.key && sel !== q.answer;
      selected = sel === opt.key;
    }

    let mark = '';
    if (correct && isChecked) mark = '<span class="stamp ok">✓</span>';
    else if (wrong) mark = '<span class="stamp bad">✕</span>';

    d.innerHTML = '<div class="opt-circle">' + opt.key + '</div><div class="opt-txt">' + escapeHtml(opt.text) + mark + '</div>';
    d.onclick = () => selectOption(q.id, opt.key, mode);
    if (selected) d.classList.add('selected');
    if (correct && isChecked) d.classList.add('correct');
    if (wrong) d.classList.add('wrong');
    c.appendChild(d);
  });

  // 多选题在考试模式下添加确认提交按钮
  if (isMulti && isExam) {
    const submitBtn = document.createElement('button');
    submitBtn.className = 'multi-submit-btn';
    submitBtn.textContent = '确认答案';
    submitBtn.onclick = () => submitMultiAnswer(q.id);
    c.appendChild(submitBtn);
  }
}

function selectOption(qid, key, mode) {
  const q = currentList.find(qq => qq.id === qid);
  if (!q) return;
  const isMulti = q.type === 'multi';

  if (mode === 'practice') {
    if (checked[qid]) return;

    if (isMulti) {
      // 多选题：切换选择状态
      let current = userAnswers[qid] ? String(userAnswers[qid]).split('') : [];
      if (current.includes(key)) {
        current = current.filter(k => k !== key);
      } else {
        current.push(key);
      }
      current.sort();
      userAnswers[qid] = current.join('');
      renderPractice(false);
      return;
    }

    userAnswers[qid] = key;
    checked[qid] = true;
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
    // 考试模式
    if (isMulti) {
      let current = userAnswers[qid] ? String(userAnswers[qid]).split('') : [];
      if (current.includes(key)) {
        current = current.filter(k => k !== key);
      } else {
        current.push(key);
      }
      current.sort();
      userAnswers[qid] = current.join('');
    } else {
      userAnswers[qid] = key;
    }
    hapticsImpact('LIGHT');
    renderExam(false);
  }
}

function submitMultiAnswer(qid) {
  const q = currentList.find(qq => qq.id === qid);
  if (!q || checked[qid]) return;
  const answer = userAnswers[qid] || '';
  if (!answer) {
    showToast('请至少选择一个选项');
    return;
  }
  checked[qid] = true;
  const correct = answer === q.answer;
  if (!correct) addWrong(q.id);
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
  currentList.forEach(qq => {
    if (checked[qq.id]) {
      done++;
      if (userAnswers[qq.id] === qq.answer) right++;
    }
  });
  const acc = done ? Math.round(right / done * 100) + '%' : '--';
  document.getElementById('practice-accuracy').textContent = '正确率 ' + acc;

  document.getElementById('q-title').innerHTML = formatBlanks(escapeHtml(q.question));
  const isJudge = q.options.length === 2 && !q.type;
  const isMulti = q.type === 'multi';
  const tag = document.getElementById('q-type');
  if (isJudge) {
    tag.textContent = '判断题';
    tag.className = 'q-badge judge';
  } else if (isMulti) {
    tag.textContent = '多选题';
    tag.className = 'q-badge multi';
  } else {
    tag.textContent = '单选题';
    tag.className = 'q-badge';
  }
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

function formatBlanks(text) {
  return text.replace(/_{3,}/g, '<span class="blank-line">____</span>');
}
