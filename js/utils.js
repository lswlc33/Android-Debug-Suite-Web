/**
 * Android Debug Suite Web - Utility Functions
 * Toast notifications, loading overlay, error handling, helpers
 */

const ADSUtils = (() => {
  let toastContainer = null;
  let loadingOverlay = null;

  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function ensureLoadingOverlay() {
    if (!loadingOverlay) {
      loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner-ring"></div>
          <p class="loading-text">处理中...</p>
        </div>
      `;
      document.body.appendChild(loadingOverlay);
    }
    return loadingOverlay;
  }

  function toast(message, type = 'info', duration = 3000) {
    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${escapeHtml(message)}</span>`;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-show'));
    const timer = setTimeout(() => removeToast(el), duration);
    el.addEventListener('click', () => { clearTimeout(timer); removeToast(el); });
  }

  function removeToast(el) {
    el.classList.remove('toast-show');
    el.classList.add('toast-hide');
    setTimeout(() => el.remove(), 300);
  }

  function showLoading(text = '处理中...') {
    const overlay = ensureLoadingOverlay();
    overlay.querySelector('.loading-text').textContent = text;
    overlay.classList.add('active');
  }

  function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove('active');
  }

  function updateLoadingText(text) {
    if (loadingOverlay) loadingOverlay.querySelector('.loading-text').textContent = text;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  }

  function formatDuration(ms) {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    if (hr > 0) return `${hr}h ${min % 60}m ${sec % 60}s`;
    if (min > 0) return `${min}m ${sec % 60}s`;
    return `${sec}s`;
  }

  function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'className') el.className = val;
      else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'html') el.innerHTML = val;
      else if (key === 'text') el.textContent = val;
      else el.setAttribute(key, val);
    }
    for (const child of children) {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child instanceof HTMLElement) el.appendChild(child);
    }
    return el;
  }

  function createProgressBar() {
    const wrapper = createElement('div', { className: 'progress-bar-wrapper' });
    const bar = createElement('div', { className: 'progress-bar' });
    const fill = createElement('div', { className: 'progress-bar-fill' });
    const label = createElement('span', { className: 'progress-bar-label', text: '0%' });
    bar.appendChild(fill);
    wrapper.appendChild(bar);
    wrapper.appendChild(label);
    wrapper.update = (pct, text) => {
      fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
      label.textContent = text || (Math.round(pct) + '%');
    };
    return wrapper;
  }

  function confirmDialog(title, message, confirmText = '确认', cancelText = '取消') {
    return new Promise(resolve => {
      const overlay = createElement('div', { className: 'modal-overlay active' });
      const dialog = createElement('div', { className: 'modal-dialog' });
      dialog.innerHTML = `
        <div class="modal-header">${escapeHtml(title)}</div>
        <div class="modal-body">${escapeHtml(message)}</div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-cancel">${escapeHtml(cancelText)}</button>
          <button class="btn btn-danger modal-confirm">${escapeHtml(confirmText)}</button>
        </div>
      `;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      dialog.querySelector('.modal-cancel').onclick = () => { overlay.remove(); resolve(false); };
      dialog.querySelector('.modal-confirm').onclick = () => { overlay.remove(); resolve(true); };
      overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
  }

  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  function throttle(fn, limit = 100) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= limit) { last = now; fn(...args); }
    };
  }

  async function pickFile(accept = '*') {
    return new Promise((resolve) => {
      const input = createElement('input', { type: 'file', accept });
      input.onchange = () => resolve(input.files[0] || null);
      input.click();
    });
  }

  async function pickFiles(accept = '*') {
    return new Promise((resolve) => {
      const input = createElement('input', { type: 'file', accept, multiple: 'multiple' });
      input.onchange = () => resolve(Array.from(input.files));
      input.click();
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = createElement('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadText(text, filename) {
    downloadBlob(new Blob([text], { type: 'text/plain' }), filename);
  }

  function downloadArrayBuffer(buffer, filename, mime = 'application/octet-stream') {
    downloadBlob(new Blob([buffer], { type: mime }), filename);
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function generateId() {
    return 'ads_' + Math.random().toString(36).substr(2, 9);
  }

  function checkWebUsbSupport() {
    if ('usb' in navigator) {
      return { supported: true, method: 'webusb' };
    }
    return { supported: false, message: '您的浏览器不支持 WebUSB API。请使用 Chrome 89+ 或 Edge 89+ 访问。' };
  }

  return {
    toast, showLoading, hideLoading, updateLoadingText,
    escapeHtml, formatBytes, formatDuration,
    createElement, createProgressBar,
    confirmDialog, debounce, throttle,
    pickFile, pickFiles, downloadBlob, downloadText, downloadArrayBuffer,
    readFileAsArrayBuffer, sleep, generateId,
    checkWebUsbSupport
  };
})();

const ADSLog = (() => {
  let modal = null;
  let modalBody = null;
  let modalBadge = null;
  let count = 0;
  let hasError = false;
  const MAX_ENTRIES = 2000;

  function init() {
    modal = document.getElementById('log-modal');
    modalBody = document.getElementById('log-modal-body');
    modalBadge = document.getElementById('log-modal-badge');
    if (!modal || !modalBody) return;

    const clearBtn = document.getElementById('log-modal-clear');
    const closeBtn = document.getElementById('log-modal-close');
    const overlay = modal.querySelector('.log-modal-overlay');
    const title = document.querySelector('.topbar-center');

    if (clearBtn) clearBtn.addEventListener('click', clear);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);

    // Triple-click on title to open log
    if (title) {
      let clickCount = 0;
      let clickTimer = null;
      title.addEventListener('click', () => {
        clickCount++;
        if (clickCount === 3) {
          clearTimeout(clickTimer);
          clickCount = 0;
          open();
        } else {
          clearTimeout(clickTimer);
          clickTimer = setTimeout(() => { clickCount = 0; }, 400);
        }
      });
    }

    interceptConsole();
  }

  function open() {
    if (!modal) return;
    modal.classList.add('active');
  }

  function close() {
    if (!modal) return;
    modal.classList.remove('active');
  }

  function toggle() {
    if (!modal) return;
    if (modal.classList.contains('active')) {
      close();
    } else {
      open();
    }
  }

  function clear() {
    if (modalBody) modalBody.innerHTML = '';
    count = 0;
    hasError = false;
    _updateBadge();
  }

  function _updateBadge() {
    if (modalBadge) {
      modalBadge.textContent = count > 999 ? '999+' : count;
      modalBadge.classList.toggle('has-error', hasError);
    }
  }

  function _timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function _append(level, tag, msg) {
    if (!modalBody) return;
    const el = document.createElement('div');
    el.className = `log-entry log-${level}`;
    el.innerHTML = `<span class="log-time">${_timestamp()}</span><span class="log-tag">[${tag}]</span><span class="log-msg">${ADSUtils.escapeHtml(String(msg))}</span>`;
    modalBody.appendChild(el);

    while (modalBody.children.length > MAX_ENTRIES) {
      modalBody.removeChild(modalBody.firstChild);
    }

    count++;
    if (level === 'error') hasError = true;
    _updateBadge();

    if (modalBody.scrollTop + modalBody.clientHeight >= modalBody.scrollHeight - 40) {
      modalBody.scrollTop = modalBody.scrollHeight;
    }
  }

  function info(tag, msg) { _append('info', tag, msg); }
  function success(tag, msg) { _append('success', tag, msg); }
  function warn(tag, msg) { _append('warn', tag, msg); }
  function error(tag, msg) { _append('error', tag, msg); }

  function interceptConsole() {
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);

    console.log = (...args) => {
      origLog(...args);
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      if (text.startsWith('[ADS]') || text.startsWith('[Android Debug Suite]')) {
        info('APP', text.replace(/^\[(ADS|Android Debug Suite)\]\s*/, ''));
      }
    };
    console.warn = (...args) => {
      origWarn(...args);
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      warn('WARN', text);
    };
    console.error = (...args) => {
      origError(...args);
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      error('ERR', text);
    };
  }

  return { init, open, close, toggle, clear, info, success, warn, error };
})();
