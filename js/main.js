/**
 * Android Debug Suite Web - Main Controller
 * Global initialization, module loader, UI logic, tab switching
 */

const ADSMain = (() => {
  let currentMode = 'adb';
  let currentPanel = 'device-overview';
  let adbDevice = null;
  let fastbootDevice = null;
  let connectionState = 'disconnected';
  let loadedModules = { adb: false, fastboot: false, scrcpy: false };
  let moduleInstances = {};
  let switching = false;

  const CONFIG_KEY = 'ads_config';

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch (e) { return {}; }
  }

  function setConfig(key, value) {
    const config = getConfig();
    config[key] = value;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  function init() {
    initTheme();
    initUI();
    initBottomBar();
    initSidebar();
    initTopBar();
    ADSLog.init();
    loadModule('adb');
    checkBrowserSupport();
    console.log('[ADS] Android Debug Suite 已启动');
  }

  function initTheme() {
    const theme = getConfig().theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setConfig('theme', next);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  }

  function initUI() {
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
      themeBtn.addEventListener('click', toggleTheme);
    }
  }

  function initTopBar() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', toggleSidebar);
    }

    const connArea = document.getElementById('connection-area');
    if (connArea) {
      connArea.addEventListener('click', () => {
        triggerConnect();
      });
    }
  }

  function initBottomBar() {
    const tabs = document.querySelectorAll('.bottom-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        if (mode && mode !== currentMode) {
          switchMode(mode);
        }
      });
    });
    updateBottomBar();
  }

  function updateBottomBar() {
    const tabs = document.querySelectorAll('.bottom-tab');
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === currentMode);
    });
  }

  function initSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.addEventListener('click', closeSidebar);

    const closeBtn = document.getElementById('sidebar-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);

    const items = document.querySelectorAll('.sidebar-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const panel = item.dataset.panel;
        if (panel) {
          switchPanel(panel);
          closeSidebar();
        }
      });
    });
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
  }

  function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  function switchPanel(panelId) {
    currentPanel = panelId;

    const inst = moduleInstances[currentMode];
    if (inst && typeof inst.onPanelSwitch === 'function') {
      inst.onPanelSwitch(panelId);
    }

    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.panel === panelId);
    });
  }

  async function switchMode(mode) {
    if (mode === currentMode || switching) return;
    switching = true;

    const oldMode = currentMode;

    if (moduleInstances[currentMode] && typeof moduleInstances[currentMode].onDeactivate === 'function') {
      await moduleInstances[currentMode].onDeactivate();
    }

    if (moduleInstances[currentMode] && typeof moduleInstances[currentMode].disconnect === 'function') {
      try { await moduleInstances[currentMode].disconnect(); } catch (e) {}
    }

    currentMode = mode;
    updateBottomBar();
    console.log(`[ADS] 切换模式: ${oldMode} → ${mode}`);

    const contentArea = document.getElementById('main-content');
    if (contentArea) {
      contentArea.innerHTML = '<div class="empty-state"><div class="spinner-ring"></div><p style="color:var(--text-tertiary);margin-top:12px">加载中...</p></div>';
      contentArea.className = 'main-content mode-' + mode;
    }

    try {
      const wasLoaded = loadedModules[mode];
      await loadModule(mode);

      const inst = moduleInstances[mode];
      if (inst) {
        if (wasLoaded && typeof inst.render === 'function') {
          inst.render();
        } else if (typeof inst.onActivate === 'function') {
          await inst.onActivate();
        }
      }

      updateSidebarItems(mode);
      updateConnectionState('disconnected');
    } finally {
      switching = false;
    }
  }

  function updateSidebarItems(mode) {
    const items = document.querySelectorAll('.sidebar-item');
    items.forEach(item => {
      const modes = (item.dataset.modes || 'adb,fastboot,scrcpy').split(',');
      item.style.display = modes.includes(mode) ? '' : 'none';
      item.classList.remove('active');
    });
    const titles = document.querySelectorAll('.sidebar-section-title');
    titles.forEach(title => {
      const modes = (title.dataset.forModes || '').split(',');
      title.style.display = modes.includes(mode) ? '' : 'none';
    });
    const firstVisible = document.querySelector(`.sidebar-item[data-modes*="${mode}"]`);
    if (firstVisible) firstVisible.classList.add('active');
  }

  async function loadModule(mode) {
    if (loadedModules[mode]) {
      return;
    }

    const libMap = { fastboot: 'js/lib/fastboot.js', scrcpy: 'js/lib/scrcpy.js' };
    const moduleMap = { adb: 'js/adb-module.js', fastboot: 'js/fastboot-module.js', scrcpy: 'js/scrcpy-module.js' };

    try {
      if (libMap[mode]) {
        await loadScript(libMap[mode]);
      }

      await loadScript(moduleMap[mode]);

      const initFns = { adb: 'initAdbModule', fastboot: 'initFastbootModule', scrcpy: 'initScrcpyModule' };
      const initFn = window[initFns[mode]];
      if (typeof initFn === 'function') {
        moduleInstances[mode] = await initFn();
      } else {
        console.error(`[ADS] Init function ${initFns[mode]} not found`);
      }

      console.log(`[ADS] 模块 ${mode} 已加载`);
      loadedModules[mode] = true;
      updateSidebarItems(mode);
    } catch (e) {
      console.error(`[ADS] Failed to load ${mode} module:`, e);
      showFallbackContent(mode, e.message);
    }
  }

  function showFallbackContent(mode, errorMsg) {
    const contentArea = document.getElementById('main-content');
    if (!contentArea) return;
    contentArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>模块加载失败</h3>
        <p>无法加载 ${mode.toUpperCase()} 模块</p>
        <p class="hint">${ADSUtils.escapeHtml(errorMsg)}</p>
        <button class="btn btn-primary" onclick="ADSMain.retryLoadModule('${mode}')">重试</button>
      </div>
    `;
  }

  async function retryLoadModule(mode) {
    loadedModules[mode] = false;
    await loadModule(mode);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        console.log(`[ADS] 已加载: ${src}`);
        resolve();
      };
      script.onerror = () => {
        console.error(`[ADS] 加载失败: ${src}`);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  function updateConnectionState(state, info = {}) {
    connectionState = state;
    const indicator = document.getElementById('connection-indicator');
    const statusText = document.getElementById('connection-text');
    const connArea = document.getElementById('connection-area');
    if (indicator) {
      indicator.className = 'connection-indicator ' + state;
    }
    if (statusText) {
      const labels = { disconnected: '未连接 · 点击连接', connecting: '连接中...', connected: info.device || '已连接', error: '连接错误 · 点击重试' };
      statusText.textContent = labels[state] || state;
    }
    if (connArea) {
      connArea.classList.toggle('clickable', state === 'disconnected' || state === 'error');
    }
  }

  function checkBrowserSupport() {
    const serial = ADSUtils.checkWebUsbSupport();
    if (!serial.supported) {
      ADSLog.error('SYS', serial.message);
      const overlay = document.createElement('div');
      overlay.className = 'browser-warning';
      overlay.innerHTML = `
        <div class="browser-warning-content">
          <h2>浏览器不兼容</h2>
          <p>${serial.message}</p>
          <p>推荐浏览器：Google Chrome 89+ / Microsoft Edge 89+</p>
          <button onclick="this.parentElement.parentElement.remove()">我知道了</button>
        </div>
      `;
      document.body.appendChild(overlay);
    } else {
      ADSLog.info('SYS', `浏览器兼容: ${serial.method}`);
    }
  }

  function triggerConnect() {
    const mode = getCurrentMode();
    const inst = moduleInstances[mode];
    if (inst && typeof inst.connect === 'function') {
      inst.connect();
    } else {
      loadModule(mode).then(() => {
        const inst2 = moduleInstances[mode];
        if (inst2 && typeof inst2.connect === 'function') {
          inst2.connect();
        }
      });
    }
  }

  function getCurrentMode() { return currentMode; }
  function getAdbDevice() { return adbDevice; }
  function setAdbDevice(dev) { adbDevice = dev; }
  function getFastbootDevice() { return fastbootDevice; }
  function setFastbootDevice(dev) { fastbootDevice = dev; }
  function getConnectionState() { return connectionState; }
  function getModuleInstance(mode) { return moduleInstances[mode]; }

  return {
    init, switchMode, switchPanel, loadModule, loadScript,
    updateConnectionState, getCurrentMode, triggerConnect,
    retryLoadModule,
    getAdbDevice, setAdbDevice, getFastbootDevice, setFastbootDevice,
    getConnectionState, getModuleInstance, getConfig, setConfig,
    toggleSidebar, closeSidebar, toggleTheme
  };
})();

document.addEventListener('DOMContentLoaded', ADSMain.init);
