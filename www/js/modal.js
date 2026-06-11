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
