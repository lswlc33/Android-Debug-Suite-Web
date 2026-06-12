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
  const MAX_ENTRIES = 5000;
  let activeFilters = new Set(['debug', 'verbose', 'info', 'success', 'warn', 'error']);
  let logEntries = [];

  const LOG_LEVELS = {
    debug: { priority: 0, label: '调试', icon: '🔍' },
    verbose: { priority: 1, label: '详细', icon: '📝' },
    info: { priority: 2, label: '信息', icon: 'ℹ️' },
    success: { priority: 3, label: '成功', icon: '✅' },
    warn: { priority: 4, label: '警告', icon: '⚠️' },
    error: { priority: 5, label: '错误', icon: '❌' }
  };

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

    initFilterButtons();

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

  function initFilterButtons() {
    const filterContainer = document.getElementById('log-filter-buttons');
    if (!filterContainer) return;

    Object.entries(LOG_LEVELS).forEach(([level, config]) => {
      const btn = document.createElement('button');
      btn.className = `log-filter-btn active filter-${level}`;
      btn.dataset.level = level;
      btn.innerHTML = `${config.icon} ${config.label}`;
      btn.addEventListener('click', () => toggleFilter(level, btn));
      filterContainer.appendChild(btn);
    });

    const showAllBtn = document.getElementById('log-filter-show-all');
    const hideAllBtn = document.getElementById('log-filter-hide-all');
    if (showAllBtn) showAllBtn.addEventListener('click', () => setAllFilters(true));
    if (hideAllBtn) hideAllBtn.addEventListener('click', () => setAllFilters(false));
  }

  function toggleFilter(level, btn) {
    if (activeFilters.has(level)) {
      activeFilters.delete(level);
      btn.classList.remove('active');
    } else {
      activeFilters.add(level);
      btn.classList.add('active');
    }
    applyFilters();
  }

  function setAllFilters(show) {
    const buttons = document.querySelectorAll('.log-filter-btn');
    buttons.forEach(btn => {
      const level = btn.dataset.level;
      if (show) {
        activeFilters.add(level);
        btn.classList.add('active');
      } else {
        activeFilters.delete(level);
        btn.classList.remove('active');
      }
    });
    applyFilters();
  }

  function applyFilters() {
    if (!modalBody) return;
    const entries = modalBody.querySelectorAll('.log-entry');
    entries.forEach(entry => {
      const level = entry.dataset.level;
      entry.style.display = activeFilters.has(level) ? '' : 'none';
    });
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
    logEntries = [];
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
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }

  function _append(level, tag, msg, data) {
    if (!modalBody) return;
    const el = document.createElement('div');
    el.className = `log-entry log-${level}`;
    el.dataset.level = level;

    let dataHtml = '';
    if (data !== undefined) {
      const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
      dataHtml = `<span class="log-data">${ADSUtils.escapeHtml(dataStr)}</span>`;
    }

    el.innerHTML = `<span class="log-time">${_timestamp()}</span><span class="log-level-icon">${LOG_LEVELS[level]?.icon || '📝'}</span><span class="log-tag">[${tag}]</span><span class="log-msg">${ADSUtils.escapeHtml(String(msg))}</span>${dataHtml}`;
    modalBody.appendChild(el);

    logEntries.push({ level, tag, msg, data, timestamp: Date.now() });

    while (modalBody.children.length > MAX_ENTRIES) {
      modalBody.removeChild(modalBody.firstChild);
      logEntries.shift();
    }

    count++;
    if (level === 'error') hasError = true;
    _updateBadge();

    if (!activeFilters.has(level)) {
      el.style.display = 'none';
    }

    if (modalBody.scrollTop + modalBody.clientHeight >= modalBody.scrollHeight - 40) {
      modalBody.scrollTop = modalBody.scrollHeight;
    }
  }

  function debug(tag, msg, data) { _append('debug', tag, msg, data); }
  function verbose(tag, msg, data) { _append('verbose', tag, msg, data); }
  function info(tag, msg, data) { _append('info', tag, msg, data); }
  function success(tag, msg, data) { _append('success', tag, msg, data); }
  function warn(tag, msg, data) { _append('warn', tag, msg, data); }
  function error(tag, msg, data) { _append('error', tag, msg, data); }

  function logOperationStart(tag, operation, params) {
    verbose(tag, `▶ 开始: ${operation}`, params);
  }

  function logOperationEnd(tag, operation, result, duration) {
    const durationStr = duration ? ` (${duration}ms)` : '';
    verbose(tag, `◀ 完成: ${operation}${durationStr}`, result);
  }

  function logOperationError(tag, operation, error) {
    const errMsg = error?.message || String(error);
    _append('error', tag, `✖ 失败: ${operation}`, { error: errMsg, stack: error?.stack });
  }

  function logInput(tag, action, input) {
    debug(tag, `→ 输入: ${action}`, input);
  }

  function logOutput(tag, action, output) {
    debug(tag, `← 输出: ${action}`, output);
  }

  function logProtocol(tag, direction, command, data) {
    const dir = direction === 'send' ? '→' : '←';
    verbose(tag, `${dir} 协议: ${command}`, data);
  }

  function exportLogs() {
    const lines = logEntries.map(e => {
      const ts = new Date(e.timestamp).toISOString();
      const dataStr = e.data ? ` | ${typeof e.data === 'object' ? JSON.stringify(e.data) : e.data}` : '';
      return `[${ts}] [${e.level.toUpperCase()}] [${e.tag}] ${e.msg}${dataStr}`;
    });
    return lines.join('\n');
  }

  function interceptConsole() {
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);
    const origDebug = console.debug.bind(console);
    const origInfo = console.info.bind(console);

    console.log = (...args) => {
      origLog(...args);
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      if (text.startsWith('[ADS]') || text.startsWith('[Android Debug Suite]')) {
        info('APP', text.replace(/^\[(ADS|Android Debug Suite)\]\s*/, ''));
      } else {
        debug('CONSOLE', text);
      }
    };

    console.debug = (...args) => {
      origDebug(...args);
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      debug('CONSOLE', text);
    };

    console.info = (...args) => {
      origInfo(...args);
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      info('CONSOLE', text);
    };

    console.warn = (...args) => {
      origWarn(...args);
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      warn('CONSOLE', text);
    };

    console.error = (...args) => {
      origError(...args);
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      error('CONSOLE', text);
    };
  }

  return {
    init, open, close, toggle, clear,
    debug, verbose, info, success, warn, error,
    logOperationStart, logOperationEnd, logOperationError,
    logInput, logOutput, logProtocol,
    exportLogs
  };
})();
