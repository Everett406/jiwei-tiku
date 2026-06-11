function openImportSheet() {
  document.getElementById('import-file').value = '';
  document.getElementById('import-name').value = '';
  document.getElementById('import-hint').textContent = '支持 JSON 或 Excel (.xlsx/.xls/.et/.csv) 格式，Excel 请使用下方模板';
  const picker = document.getElementById('file-picker');
  const pickerText = document.getElementById('file-picker-text');
  if (picker) picker.classList.remove('has-file');
  if (pickerText) pickerText.textContent = '点击选择 JSON 或 Excel 文件';
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
  const picker = document.getElementById('file-picker');
  const pickerText = document.getElementById('file-picker-text');
  if (!file) {
    if (picker) picker.classList.remove('has-file');
    if (pickerText) pickerText.textContent = '点击选择 JSON 或 Excel 文件';
    return;
  }
  if (picker) picker.classList.add('has-file');
  if (pickerText) pickerText.textContent = '已选择：' + file.name;
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
      } else if (['xlsx', 'xls', 'et', 'csv'].includes(ext)) {
        const data = parseExcel(e.target.result);
        pendingImportData = data;
        hint.textContent = '解析成功，共 ' + data.length + ' 道题';
      } else {
        hint.textContent = '不支持的文件格式：' + ext;
        pendingImportData = null;
      }
    } catch (err) {
      hint.textContent = '解析失败：' + err.message;
      pendingImportData = null;
    }
  };
  reader.onerror = () => {
    hint.textContent = '文件读取失败，请重试';
    pendingImportData = null;
  };
  if (ext === 'json') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

function doImport() {
  const name = document.getElementById('import-name').value.trim();
  if (!name) { showModal('hint', '请输入题库名称'); return; }
  if (!pendingImportData || pendingImportData.length === 0) {
    showModal('hint', '没有可导入的数据，请先选择文件');
    return;
  }
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
  // 统一使用 Uint8Array，兼容浏览器和 Node.js 环境
  const buf = (arrayBuffer instanceof ArrayBuffer) ? new Uint8Array(arrayBuffer) : arrayBuffer;
  const workbook = XLSX.read(buf, { type: 'array' });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Excel 文件中没有找到任何工作表');
  }

  // 尝试所有 sheet，找到第一个有数据的
  let rows = [];
  let usedSheet = '';
  for (const name of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
    if (sheetRows.length >= 2) {
      rows = sheetRows;
      usedSheet = name;
      break;
    }
  }
  if (rows.length < 2) {
    throw new Error('Excel 数据行数不足，请检查文件内容（可能是空 sheet 或数据在第二个 sheet 里）');
  }

  // 智能检测表头行（检测前 5 行）
  let startRow = 0;
  const headerKeywords = ['题', '题目', '题干', 'question', '选项', '答案', 'answer', 'option'];
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const row = rows[r].map(c => String(c).trim());
    const isHeader = row.some(cell => headerKeywords.some(k => cell.toLowerCase().includes(k)));
    if (isHeader) {
      startRow = r + 1;
      break;
    }
  }

  const questions = [];
  const skipReasons = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const qText = String(row[0] || '').trim();
    if (!qText) continue;

    const options = [];
    const labels = ['A', 'B', 'C', 'D', 'E'];
    for (let j = 0; j < 5; j++) {
      const text = String(row[j + 1] || '').trim();
      if (text) options.push({ key: labels[j], text });
    }
    if (options.length < 2) {
      skipReasons.push('第 ' + (i + 1) + ' 行选项不足 2 个');
      continue;
    }

    // 答案解析：优先固定列 G（索引6），如果为空则向后查找，再回退到最后一列
    let rawAnswer = '';
    if (row[6] !== undefined && String(row[6]).trim() !== '') {
      rawAnswer = String(row[6]).trim();
    } else {
      for (let k = 7; k < row.length; k++) {
        if (String(row[k]).trim() !== '') {
          rawAnswer = String(row[k]).trim();
          break;
        }
      }
      if (!rawAnswer && row.length > 1) {
        rawAnswer = String(row[row.length - 1]).trim();
      }
    }

    let answer = parseAnswer(rawAnswer);
    if (!answer) {
      skipReasons.push('第 ' + (i + 1) + ' 行答案格式无法识别："' + rawAnswer + '"');
      continue;
    }

    questions.push({ id: questions.length + 1, question: qText, answer, options });
  }

  if (questions.length === 0) {
    // 生成诊断信息
    let diag = '【诊断】使用了 sheet：' + usedSheet + '，共 ' + rows.length + ' 行';
    if (skipReasons.length > 0) {
      diag += '；跳过原因：' + skipReasons.slice(0, 3).join('；');
    }
    // 显示前 5 行数据帮助用户自查
    const preview = rows.slice(0, Math.min(5, rows.length)).map((r, idx) => {
      const first = String(r[0] || '').trim().slice(0, 15);
      const ans = String(r[6] || '').trim();
      return '行' + (idx + 1) + ':' + first + (ans ? '|答案=' + ans : '');
    }).join(' / ');
    diag += '；前5行预览：' + preview;
    throw new Error('未能解析出有效题目。' + diag);
  }
  return normalizeQuestions(questions);
}

function parseAnswer(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // 直接字母 A-E
  if (/^[A-Ea-e]$/.test(s)) return s.toUpperCase();
  // 数字 1-5
  if (/^[1-5]$/.test(s)) return String.fromCharCode(64 + parseInt(s, 10));
  // 清理标点后再试：A.  A、  A） A)  A正确
  const cleaned = s.replace(/^[\s]*([A-Ea-e])[\.、。）)\s]/, '$1').replace(/[\s]*$/, '');
  if (/^[A-Ea-e]$/.test(cleaned)) return cleaned.toUpperCase();
  // 中文判断
  if (s === '正确' || s === '对' || s === '是') return 'A';
  if (s === '错误' || s === '错' || s === '否') return 'B';
  // 如果选项本身就是"正确"/"错误"，答案也允许直接填"正确"/"错误"
  return '';
}

function downloadTemplate() {
  if (typeof AndroidBridge !== 'undefined' && AndroidBridge.openTemplateWithSystemApp) {
    AndroidBridge.openTemplateWithSystemApp();
    return;
  }
  const a = document.createElement('a');
  a.href = 'template.xlsx';
  a.download = '积微-题库模板.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function copyPrompt() {
  const text = document.getElementById('prompt-text').textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showModal('hint', '提示词已复制到剪贴板');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showModal('hint', '提示词已复制到剪贴板');
  } catch (e) {
    showModal('hint', '复制失败，请手动长按复制');
  }
  document.body.removeChild(ta);
}
