/**
 * Android Debug Suite Web - ADB Module
 * Device connection, info, file management, app management, shell, sideload
 */

function initAdbModule() {
  const module = new AdbModule();
  return module;
}

class AdbModule {
  constructor() {
    this.client = null;
    this.device = null;
    this.currentPath = '/sdcard';
    this.pathHistory = [];
    this.shellHistory = [];
    this.shellHistoryIndex = -1;
    this.logcatRunning = false;
    this.logcatAbort = null;
    this.init();
  }

  init() {
    const content = document.getElementById('main-content');
    content.innerHTML = this._buildMainHTML();
    this._bindEvents();
    this._showPanel('device-overview');
  }

  render() {
    const content = document.getElementById('main-content');
    content.innerHTML = this._buildMainHTML();
    this._bindEvents();
    this._showPanel('device-overview');
    if (this.device && this.device.connected) {
      document.getElementById('device-not-connected')?.classList.add('hidden');
      document.getElementById('device-info')?.classList.remove('hidden');
    }
  }

  _buildMainHTML() {
    return `
      <div class="adb-panels">
        <!-- Category Navigation (Desktop only) -->
        <nav class="adb-cat-nav" id="adb-cat-nav">
          <button class="adb-cat-btn active" data-cat="device-overview"><span class="adb-cat-icon">📱</span><span>设备概览</span></button>
          <button class="adb-cat-btn" data-cat="file-manager"><span class="adb-cat-icon">📁</span><span>文件管理</span></button>
          <button class="adb-cat-btn" data-cat="app-manager"><span class="adb-cat-icon">📦</span><span>应用管理</span></button>
          <button class="adb-cat-btn" data-cat="shell"><span class="adb-cat-icon">💻</span><span>Shell</span></button>
          <button class="adb-cat-btn" data-cat="logcat"><span class="adb-cat-icon">📋</span><span>Logcat</span></button>
          <button class="adb-cat-btn" data-cat="sideload"><span class="adb-cat-icon">📤</span><span>Sideload</span></button>
        </nav>

        <div id="panel-device-overview" class="panel active">
          <div class="panel-header"><h2>设备概览</h2></div>
          <div class="panel-body">
            <div id="device-not-connected" class="empty-state">
              <div class="welcome-art-wrap">
                <img src="static/481d0b9400de9cfdb7d058379ef0583b1060544882.jpg" alt="" class="welcome-art" id="welcome-art" />
              </div>
              <h3>连接 Android 设备</h3>

              <div class="connect-cards">
                <div class="connect-card" style="max-width:400px;">
                  <h4>USB 连接</h4>
                  <p>设备通过 USB 连接到电脑</p>
                  <button id="btn-connect-adb" class="btn btn-primary">USB 连接</button>
                  <div class="hint">
                    <p>确保设备已启用 USB 调试，通过数据线连接电脑后点击上方按钮</p>
                  </div>
                  <div class="key-actions" style="margin-top:12px;">
                    <button id="btn-clear-adb-key" class="btn btn-secondary btn-sm">重置 ADB 密钥</button>
                    <p class="hint" style="margin-top:4px;font-size:0.8em;">如果设备未弹出授权提示，请尝试重置密钥后重新连接</p>
                  </div>
                </div>
              </div>
            </div>
            <div id="device-info" class="hidden">
              <div class="info-grid" id="device-info-grid"></div>
              <div class="device-actions">
                <button id="btn-screenshot" class="btn btn-secondary">📸 截图</button>
                <button id="btn-reboot-normal" class="btn btn-secondary">🔄 重启</button>
                <button id="btn-reboot-recovery" class="btn btn-secondary">🔧 重启到 Recovery</button>
                <button id="btn-reboot-bootloader" class="btn btn-secondary">⚡ 重启到 Bootloader</button>
                <button id="btn-disconnect-adb" class="btn btn-danger">断开连接</button>
              </div>
              <div id="screenshot-preview" class="hidden">
                <h3>截图预览</h3>
                <img id="screenshot-img" />
                <button id="btn-save-screenshot" class="btn btn-secondary">保存截图</button>
              </div>
            </div>
          </div>
        </div>

        <div id="panel-file-manager" class="panel">
          <div class="panel-header">
            <h2>文件管理</h2>
            <div class="breadcrumb" id="file-breadcrumb"></div>
          </div>
          <div class="panel-body">
            <div class="file-toolbar">
              <button id="btn-file-up" class="btn btn-icon" title="上级目录">⬆️</button>
              <button id="btn-file-refresh" class="btn btn-icon" title="刷新">🔄</button>
              <button id="btn-file-home" class="btn btn-icon" title="主目录">🏠</button>
              <input type="text" id="file-path-input" class="path-input" value="/sdcard" />
              <button id="btn-file-upload" class="btn btn-primary btn-sm">上传文件</button>
              <button id="btn-file-mkdir" class="btn btn-secondary btn-sm">新建文件夹</button>
            </div>
            <div id="file-list" class="file-list">
              <div class="empty-state"><p>请先连接设备</p></div>
            </div>
          </div>
        </div>

        <div id="panel-app-manager" class="panel">
          <div class="panel-header">
            <h2>应用管理</h2>
            <div class="app-toolbar">
              <input type="text" id="app-search" class="search-input" placeholder="搜索应用..." />
              <button id="btn-app-refresh" class="btn btn-secondary btn-sm">刷新</button>
              <button id="btn-app-install" class="btn btn-primary btn-sm">安装 APK</button>
            </div>
          </div>
          <div class="panel-body">
            <div id="app-list" class="app-list">
              <div class="empty-state"><p>请先连接设备</p></div>
            </div>
          </div>
        </div>

        <div id="panel-shell" class="panel">
          <div class="panel-header">
            <h2>Shell 终端</h2>
            <div class="shell-toolbar">
              <button class="btn btn-sm btn-secondary shell-quick" data-cmd="getprop ro.product.model">型号</button>
              <button class="btn btn-sm btn-secondary shell-quick" data-cmd="cat /proc/cpuinfo | head -10">CPU</button>
              <button class="btn btn-sm btn-secondary shell-quick" data-cmd="cat /proc/meminfo | head -5">内存</button>
              <button class="btn btn-sm btn-secondary shell-quick" data-cmd="df -h">存储</button>
              <button class="btn btn-sm btn-secondary shell-quick" data-cmd="top -n 1 | head -20">进程</button>
              <button class="btn btn-sm btn-secondary shell-quick" data-cmd="ip addr show">网络</button>
              <button id="btn-shell-clear" class="btn btn-sm btn-secondary">清屏</button>
            </div>
          </div>
          <div class="panel-body shell-panel">
            <div id="shell-output" class="shell-output"></div>
            <div class="shell-input-row">
              <span class="shell-prompt">$</span>
              <input type="text" id="shell-input" class="shell-input" placeholder="输入命令..." autocomplete="off" />
              <button id="btn-shell-exec" class="btn btn-primary btn-sm">执行</button>
            </div>
          </div>
        </div>

        <div id="panel-logcat" class="panel">
          <div class="panel-header">
            <h2>Logcat 日志</h2>
            <div class="logcat-toolbar">
              <select id="logcat-level" class="select-sm">
                <option value="">全部级别</option>
                <option value="V">Verbose</option>
                <option value="D">Debug</option>
                <option value="I">Info</option>
                <option value="W">Warning</option>
                <option value="E">Error</option>
                <option value="F">Fatal</option>
              </select>
              <input type="text" id="logcat-filter" class="search-input" placeholder="过滤关键词..." />
              <button id="btn-logcat-toggle" class="btn btn-primary btn-sm">开始</button>
              <button id="btn-logcat-clear" class="btn btn-secondary btn-sm">清屏</button>
              <button id="btn-logcat-save" class="btn btn-secondary btn-sm">保存</button>
              <label class="checkbox-label"><input type="checkbox" id="logcat-autoscroll" checked /> 自动滚动</label>
            </div>
          </div>
          <div class="panel-body">
            <div id="logcat-output" class="logcat-output"></div>
          </div>
        </div>

        <div id="panel-sideload" class="panel">
          <div class="panel-header"><h2>ADB Sideload</h2></div>
          <div class="panel-body">
            <div class="sideload-content">
              <div class="empty-state" id="sideload-idle">
                <div class="empty-icon">📦</div>
                <h3>ADB Sideload</h3>
                <p>在 Recovery 模式下刷入 OTA 包或 ZIP 文件</p>
                <ol class="instruction-list">
                  <li>将设备重启到 Recovery 模式</li>
                  <li>在 Recovery 中选择"Apply update from ADB"</li>
                  <li>点击下方按钮选择文件并开始 sideload</li>
                </ol>
                <button id="btn-sideload-start" class="btn btn-primary btn-lg">选择 OTA 包开始</button>
              </div>
              <div id="sideload-progress" class="hidden">
                <h3>正在刷入...</h3>
                <div id="sideload-progress-bar"></div>
                <p id="sideload-status">准备中...</p>
                <button id="btn-sideload-cancel" class="btn btn-danger">取消</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    $('#btn-connect-adb')?.addEventListener('click', () => this.connect());
    $('#btn-disconnect-adb')?.addEventListener('click', () => this.disconnect());
    $('#btn-clear-adb-key')?.addEventListener('click', () => this.clearAdbKey());

    $('#btn-screenshot')?.addEventListener('click', () => this.takeScreenshot());
    $('#btn-reboot-normal')?.addEventListener('click', () => this.reboot(''));
    $('#btn-reboot-recovery')?.addEventListener('click', () => this.reboot('recovery'));
    $('#btn-reboot-bootloader')?.addEventListener('click', () => this.reboot('bootloader'));
    $('#btn-save-screenshot')?.addEventListener('click', () => this.saveScreenshot());

    $('#btn-file-up')?.addEventListener('click', () => this.navigateUp());
    $('#btn-file-refresh')?.addEventListener('click', () => this.refreshFiles());
    $('#btn-file-home')?.addEventListener('click', () => this.navigateTo('/sdcard'));
    $('#file-path-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.navigateTo(e.target.value);
    });
    $('#btn-file-upload')?.addEventListener('click', () => this.uploadFile());
    $('#btn-file-mkdir')?.addEventListener('click', () => this.createDirectory());

    $('#app-search')?.addEventListener('input', ADSUtils.debounce((e) => this.filterApps(e.target.value), 300));
    $('#btn-app-refresh')?.addEventListener('click', () => this.loadApps());
    $('#btn-app-install')?.addEventListener('click', () => this.installApp());

    $('#shell-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.executeShell();
      if (e.key === 'ArrowUp') { e.preventDefault(); this.shellHistoryUp(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.shellHistoryDown(); }
    });
    $('#btn-shell-exec')?.addEventListener('click', () => this.executeShell());
    $('#btn-shell-clear')?.addEventListener('click', () => { $('#shell-output').innerHTML = ''; });

    $$('.shell-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        $('#shell-input').value = cmd;
        this.executeShell();
      });
    });

    $('#btn-logcat-toggle')?.addEventListener('click', () => this.toggleLogcat());
    $('#btn-logcat-clear')?.addEventListener('click', () => { $('#logcat-output').innerHTML = ''; });
    $('#btn-logcat-save')?.addEventListener('click', () => this.saveLogcat());

    $('#btn-sideload-start')?.addEventListener('click', () => this.startSideload());

    const art = document.getElementById('welcome-art');
    if (art) art.addEventListener('dblclick', (e) => this._burstEffect(e));

    $$('.adb-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panelId = btn.dataset.cat;
        if (panelId) this._showPanel(panelId);
      });
    });

    this._bindSidebarNavigation();
  }

  _bindSidebarNavigation() {
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const panel = item.dataset.panel;
        if (panel) this._showPanel(panel);
      });
    });
  }

  _showPanel(panelId) {
    document.querySelectorAll('.adb-panels .panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('panel-' + panelId);
    if (panel) panel.classList.add('active');

    document.querySelectorAll('.adb-cat-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === panelId);
    });
  }

  _shellEscape(str) {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/"/g, '\\"')
      .replace(/'/g, "'\\''");
  }

  _burstEffect(e) {
    const img = e.currentTarget;
    if (img.classList.contains('flipping')) return;

    img.classList.add('flipping');
    img.style.animation = 'art-flip 1.1s cubic-bezier(0.22, 1, 0.36, 1)';
    img.style.animationFillMode = 'forwards';

    const wrap = img.parentElement;
    const colors = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24'];

    for (let i = 0; i < 4; i++) {
      const ring = document.createElement('div');
      ring.className = 'welcome-art-ring';
      ring.style.animation = `art-ring ${0.7 + i * 0.12}s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.08}s forwards`;
      ring.style.borderColor = colors[i % colors.length];
      ring.style.boxShadow = `0 0 16px 2px ${colors[i % colors.length]}`;
      wrap.appendChild(ring);
      ring.addEventListener('animationend', () => ring.remove());
    }

    img.addEventListener('animationend', () => {
      img.classList.remove('flipping');
      img.style.animation = '';
    }, { once: true });
  }

  onPanelSwitch(panelId) {
    this._showPanel(panelId);
    if (panelId === 'app-manager' && this.device) this.loadApps();
    if (panelId === 'file-manager' && this.device) this.refreshFiles();
  }

  onActivate() {
    if (this.device && this.device.connected) {
      document.getElementById('device-not-connected')?.classList.add('hidden');
      document.getElementById('device-info')?.classList.remove('hidden');
    }
  }

  async onDeactivate() {
    if (this.logcatRunning) this.toggleLogcat();
  }

  async connect() {
    const startTime = Date.now();
    try {
      ADSMain.updateConnectionState('connecting');
      ADSUtils.showLoading('正在请求设备...');
      ADSLog.logOperationStart('ADB', 'USB 连接流程');

      if (!('usb' in navigator)) {
        throw new Error('当前浏览器不支持 WebUSB API，请使用 Chrome 89+ 或 Edge 89+');
      }

      ADSLog.verbose('ADB', 'WebUSB API 可用');

      await this.device?.disconnect().catch(() => {});
      this.client = new AdbClient();

      const selected = await this.client.requestDevice();
      if (!selected) {
        ADSLog.warn('ADB', '用户取消了设备选择');
        throw new DOMException('No device selected', 'NotFoundError');
      }
      const usbDevice = this.client.device;
      ADSLog.logInput('ADB', '设备选择', { productName: usbDevice.productName });
      ADSLog.info('ADB', `已选择设备: ${usbDevice.productName || '未知'}`);
      ADSLog.debug('ADB', '设备详情', {
        vid: '0x' + usbDevice.vendorId.toString(16).toUpperCase(),
        pid: '0x' + usbDevice.productId.toString(16).toUpperCase(),
        serial: usbDevice.serialNumber || '无'
      });

      ADSUtils.updateLoadingText('正在通过 USB 连接...');
      try {
        ADSLog.verbose('ADB', '正在打开 USB 设备...');
        await this.client.open();
        ADSLog.success('ADB', 'USB 传输层连接成功');
      } catch (claimErr) {
        if (claimErr.name === 'NetworkError' || claimErr.message.includes('claim') || claimErr.message.includes('占用')) {
          ADSLog.error('ADB', 'USB 接口被占用: ' + claimErr.message);
          throw new Error('USB 接口被占用。请先关闭其他 ADB 工具（如 Android Studio、scrcpy 等），然后重试。');
        }
        if (claimErr.name === 'SecurityError' || claimErr.message.includes('Access denied')) {
          ADSLog.error('ADB', 'USB 设备访问被拒绝: ' + claimErr.message);
          throw new Error('USB 设备访问被拒绝。请关闭命令行 adb 工具、Android Studio 或其他可能占用设备的程序');
        }
        ADSLog.logOperationError('ADB', 'USB 连接', claimErr);
        throw claimErr;
      }

      this.device = new AdbDevice(this.client);

      ADSUtils.updateLoadingText('正在认证...');
      ADSLog.verbose('ADB', '开始 ADB 协议握手...');

      await this.device.connect((fingerprint) => {
        ADSLog.warn('ADB', '设备需要授权', { fingerprint, action: '请在手机上点击"允许 USB 调试"' });
        ADSUtils.hideLoading();
        ADSUtils.confirmDialog(
          'ADB 授权',
          '请在设备上点击"允许 USB 调试"\n\n如果设备未弹出授权提示，请：\n1. 进入设置 → 开发者选项 → 撤销USB调试授权\n2. 然后点击下方"重置密钥"后重新连接\n\n认证将自动重试，直到设备授权。',
          '已授权'
        );
      });
      ADSLog.success('ADB', 'ADB 认证成功');

      ADSUtils.updateLoadingText('正在获取设备信息...');
      ADSLog.verbose('ADB', '正在读取设备属性...');
      const props = await this.device.getDeviceProps();
      this._displayDeviceInfo(props);

      const deviceName = props['ro.product.model'] || 'Unknown';
      const duration = Date.now() - startTime;
      ADSLog.logOperationEnd('ADB', 'USB 连接流程', { device: deviceName, android: props['ro.build.version.release'] }, duration);
      ADSLog.success('ADB', `设备已连接: ${deviceName} (Android ${props['ro.build.version.release'] || '?'}, SDK ${props['ro.build.version.sdk'] || '?'})`);
      ADSMain.updateConnectionState('connected', { device: deviceName });
      ADSMain.setAdbDevice(this.device);
      ADSUtils.hideLoading();
      ADSUtils.toast('设备已连接: ' + deviceName, 'success');

      document.getElementById('device-not-connected')?.classList.add('hidden');
      document.getElementById('device-info')?.classList.remove('hidden');
    } catch (e) {
      ADSUtils.hideLoading();
      ADSMain.updateConnectionState('error');
      if (e.name === 'NotFoundError') {
        ADSLog.warn('ADB', '未选择设备');
        ADSUtils.toast('未选择设备', 'warning');
      } else {
        ADSLog.logOperationError('ADB', 'USB 连接流程', e);
        ADSUtils.toast('连接失败: ' + e.message, 'error');
      }
    }
  }

  async disconnect() {
    if (this.device) {
      ADSLog.logOperationStart('ADB', '断开连接');
      await this.device.disconnect().catch(() => {});
      this.device = null;
      ADSMain.setAdbDevice(null);
      ADSLog.logOperationEnd('ADB', '断开连接');
      ADSLog.info('ADB', '设备已断开');
    }
    ADSMain.updateConnectionState('disconnected');
    document.getElementById('device-not-connected')?.classList.remove('hidden');
    document.getElementById('device-info')?.classList.add('hidden');
  }

  async clearAdbKey() {
    const ok = await ADSUtils.confirmDialog(
      '重置 ADB 密钥',
      '重置密钥后，下次连接设备时需要重新授权。\n\n适用于设备未弹出USB调试授权提示的情况。\n确定要重置吗？',
      '重置'
    );
    if (!ok) return;
    ADSLog.logOperationStart('ADB', '重置 ADB 密钥');
    AdbDevice.clearStoredKey();
    ADSLog.logOperationEnd('ADB', '重置 ADB 密钥');
    ADSLog.info('ADB', 'ADB 密钥已重置，请重新连接设备');
    ADSUtils.toast('ADB 密钥已重置，请重新连接设备', 'success');
  }

  _displayDeviceInfo(props) {
    const grid = document.getElementById('device-info-grid');
    if (!grid) return;
    const fields = [
      { label: '型号', key: 'ro.product.model' },
      { label: '品牌', key: 'ro.product.brand' },
      { label: '制造商', key: 'ro.product.manufacturer' },
      { label: 'Android 版本', key: 'ro.build.version.release' },
      { label: 'SDK 版本', key: 'ro.build.version.sdk' },
      { label: '安全补丁', key: 'ro.build.version.security_patch' },
      { label: '构建版本', key: 'ro.build.display.id' },
      { label: 'CPU 架构', key: 'ro.product.cpu.abi' },
      { label: '序列号', key: 'ro.serialno' },
      { label: '设备名称', key: 'ro.product.name' },
    ];
    grid.innerHTML = fields.map(f =>
      `<div class="info-item"><span class="info-label">${f.label}</span><span class="info-value">${ADSUtils.escapeHtml(props[f.key] || '未知')}</span></div>`
    ).join('');
  }

  async takeScreenshot() {
    if (!this.device) return ADSUtils.toast('请先连接设备', 'warning');
    const startTime = Date.now();
    try {
      ADSLog.logOperationStart('ADB', '截图');
      ADSUtils.showLoading('正在截图...');
      const data = await this.device.screencap();
      const duration = Date.now() - startTime;
      ADSLog.debug('ADB', '截图数据接收', { size: ADSUtils.formatBytes(data.byteLength), duration: duration + 'ms' });
      ADSUtils.hideLoading();
      const blob = new Blob([data], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const preview = document.getElementById('screenshot-preview');
      const img = document.getElementById('screenshot-img');
      if (preview && img) {
        img.src = url;
        preview.classList.remove('hidden');
        preview._blob = blob;
      }
      ADSLog.logOperationEnd('ADB', '截图', { size: ADSUtils.formatBytes(blob.size) }, duration);
      ADSUtils.toast('截图完成', 'success');
    } catch (e) {
      ADSUtils.hideLoading();
      ADSLog.logOperationError('ADB', '截图', e);
      ADSUtils.toast('截图失败: ' + e.message, 'error');
    }
  }

  saveScreenshot() {
    const preview = document.getElementById('screenshot-preview');
    if (preview?._blob) {
      ADSUtils.downloadBlob(preview._blob, `screenshot_${Date.now()}.png`);
    }
  }

  async reboot(mode) {
    if (!this.device) return ADSUtils.toast('请先连接设备', 'warning');
    const label = mode || 'normal';
    const ok = await ADSUtils.confirmDialog('重启设备', `确定要将设备重启到 ${label} 模式吗？`, '重启');
    if (!ok) return;
    try {
      ADSLog.logOperationStart('ADB', '重启设备', { mode: label });
      await this.device.reboot(mode);
      ADSLog.logOperationEnd('ADB', '重启设备', { mode: label });
      ADSUtils.toast('设备正在重启...', 'info');
      ADSMain.updateConnectionState('disconnected');
    } catch (e) {
      ADSLog.logOperationError('ADB', '重启设备', e);
      ADSUtils.toast('重启失败: ' + e.message, 'error');
    }
  }

  async refreshFiles() {
    if (!this.device) return;
    const list = document.getElementById('file-list');
    if (!list) return;
    list.innerHTML = '<div class="loading-inline">加载中...</div>';
    const startTime = Date.now();
    try {
      ADSLog.verbose('ADB', '刷新文件列表', { path: this.currentPath });
      const entries = await this.device.listDir(this.currentPath);
      const duration = Date.now() - startTime;
      ADSLog.debug('ADB', '文件列表加载完成', { path: this.currentPath, count: entries.length, duration: duration + 'ms' });
      this._renderFileList(entries);
      this._updateBreadcrumb();
      document.getElementById('file-path-input').value = this.currentPath;
    } catch (e) {
      ADSLog.logOperationError('ADB', '刷新文件列表', e);
      list.innerHTML = `<div class="empty-state"><p>无法读取目录: ${ADSUtils.escapeHtml(e.message)}</p></div>`;
    }
  }

  _renderFileList(entries) {
    const list = document.getElementById('file-list');
    if (!list) return;
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    let html = `<div class="file-header"><span class="file-col-name">名称</span><span class="file-col-size">大小</span><span class="file-col-time">修改时间</span><span class="file-col-actions">操作</span></div>`;

    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue;
      const icon = entry.isDir ? '📁' : this._getFileIcon(entry.name);
      const size = entry.isDir ? '-' : ADSUtils.formatBytes(entry.size);
      const time = entry.time ? new Date(entry.time * 1000).toLocaleString() : '-';
      html += `<div class="file-row ${entry.isDir ? 'is-dir' : 'is-file'}" data-name="${ADSUtils.escapeHtml(entry.name)}" data-isdir="${entry.isDir}">
        <span class="file-col-name"><span class="file-icon">${icon}</span>${ADSUtils.escapeHtml(entry.name)}</span>
        <span class="file-col-size">${size}</span>
        <span class="file-col-time">${time}</span>
        <span class="file-col-actions">
          ${!entry.isDir ? `<button class="btn btn-xs btn-secondary file-download" data-name="${ADSUtils.escapeHtml(entry.name)}">下载</button>` : ''}
          <button class="btn btn-xs btn-danger file-delete" data-name="${ADSUtils.escapeHtml(entry.name)}">删除</button>
        </span>
      </div>`;
    }

    if (entries.length === 0) {
      html += '<div class="empty-state"><p>空目录</p></div>';
    }

    list.innerHTML = html;
    list.querySelectorAll('.file-row').forEach(row => {
      row.querySelector('.file-col-name').addEventListener('click', () => {
        if (row.dataset.isdir === 'true') {
          this.navigateTo(this.currentPath + '/' + row.dataset.name);
        }
      });
    });
    list.querySelectorAll('.file-download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadFile(btn.dataset.name);
      });
    });
    list.querySelectorAll('.file-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteFile(btn.dataset.name);
      });
    });
  }

  _getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
      'apk': '📦', 'zip': '🗜️', 'rar': '🗜️', '7z': '🗜️',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'bmp': '🖼️',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵', 'ogg': '🎵',
      'mp4': '🎬', 'mkv': '🎬', 'avi': '🎬', 'mov': '🎬', 'webm': '🎬',
      'txt': '📄', 'log': '📄', 'json': '📄', 'xml': '📄', 'html': '📄', 'css': '📄', 'js': '📄',
      'pdf': '📕', 'doc': '📘', 'docx': '📘', 'xls': '📗', 'xlsx': '📗',
      'sh': '⚙️', 'py': '🐍',
    };
    return icons[ext] || '📄';
  }

  _updateBreadcrumb() {
    const bc = document.getElementById('file-breadcrumb');
    if (!bc) return;
    const parts = this.currentPath.split('/').filter(Boolean);
    let html = `<span class="crumb" data-path="/">根目录</span>`;
    let path = '';
    for (const part of parts) {
      path += '/' + part;
      html += `<span class="crumb-sep">/</span><span class="crumb" data-path="${ADSUtils.escapeHtml(path)}">${ADSUtils.escapeHtml(part)}</span>`;
    }
    bc.innerHTML = html;
    bc.querySelectorAll('.crumb').forEach(crumb => {
      crumb.addEventListener('click', () => this.navigateTo(crumb.dataset.path));
    });
  }

  navigateTo(path) {
    this.pathHistory.push(this.currentPath);
    this.currentPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    this.refreshFiles();
  }

  navigateUp() {
    const parent = this.currentPath.split('/').slice(0, -1).join('/') || '/';
    this.navigateTo(parent);
  }

  async downloadFile(name) {
    if (!this.device) return;
    const remotePath = this.currentPath + '/' + name;
    const startTime = Date.now();
    try {
      ADSLog.logOperationStart('ADB', '下载文件', { name, path: remotePath });
      ADSUtils.showLoading(`下载 ${name}...`);
      const data = await this.device.pull(remotePath, (size) => {
        ADSUtils.updateLoadingText(`下载 ${name}: ${ADSUtils.formatBytes(size)}`);
      });
      const duration = Date.now() - startTime;
      ADSUtils.hideLoading();
      ADSUtils.downloadArrayBuffer(data, name);
      ADSLog.logOperationEnd('ADB', '下载文件', { name, size: ADSUtils.formatBytes(data.byteLength) }, duration);
      ADSUtils.toast('下载完成', 'success');
    } catch (e) {
      ADSUtils.hideLoading();
      ADSLog.logOperationError('ADB', '下载文件', e);
      ADSUtils.toast('下载失败: ' + e.message, 'error');
    }
  }

  async uploadFile() {
    if (!this.device) return ADSUtils.toast('请先连接设备', 'warning');
    const file = await ADSUtils.pickFile();
    if (!file) return;
    const remotePath = this.currentPath + '/' + file.name;
    const startTime = Date.now();
    try {
      ADSLog.logOperationStart('ADB', '上传文件', { name: file.name, size: ADSUtils.formatBytes(file.size), path: remotePath });
      ADSUtils.showLoading(`上传 ${file.name}...`);
      const data = await ADSUtils.readFileAsArrayBuffer(file);
      await this.device.push(new Uint8Array(data), remotePath, 0o100644, (sent, total) => {
        ADSUtils.updateLoadingText(`上传 ${file.name}: ${ADSUtils.formatBytes(sent)} / ${ADSUtils.formatBytes(total)}`);
      });
      const duration = Date.now() - startTime;
      ADSUtils.hideLoading();
      ADSLog.logOperationEnd('ADB', '上传文件', { name: file.name, size: ADSUtils.formatBytes(file.size) }, duration);
      ADSUtils.toast('上传完成', 'success');
      this.refreshFiles();
    } catch (e) {
      ADSUtils.hideLoading();
      ADSLog.logOperationError('ADB', '上传文件', e);
      ADSUtils.toast('上传失败: ' + e.message, 'error');
    }
  }

  async deleteFile(name) {
    if (!this.device) return;
    const ok = await ADSUtils.confirmDialog('删除确认', `确定要删除 "${name}" 吗？`, '删除');
    if (!ok) return;
    const startTime = Date.now();
    try {
      const safePath = this._shellEscape(this.currentPath + '/' + name);
      ADSLog.logOperationStart('ADB', '删除文件', { name, path: this.currentPath + '/' + name });
      await this.device.shellCommand(`rm -rf '${safePath}'`);
      const duration = Date.now() - startTime;
      ADSLog.logOperationEnd('ADB', '删除文件', { name }, duration);
      ADSUtils.toast('已删除', 'success');
      this.refreshFiles();
    } catch (e) {
      ADSLog.logOperationError('ADB', '删除文件', e);
      ADSUtils.toast('删除失败: ' + e.message, 'error');
    }
  }

  async createDirectory() {
    if (!this.device) return ADSUtils.toast('请先连接设备', 'warning');
    const name = prompt('输入文件夹名称:');
    if (!name) return;
    if (!/^[a-zA-Z0-9._\-\u4e00-\u9fa5]+$/.test(name)) {
      ADSUtils.toast('文件夹名称包含无效字符', 'error');
      return;
    }
    const startTime = Date.now();
    try {
      const safePath = this._shellEscape(this.currentPath + '/' + name);
      ADSLog.logOperationStart('ADB', '创建目录', { name, path: this.currentPath + '/' + name });
      await this.device.shellCommand(`mkdir -p '${safePath}'`);
      const duration = Date.now() - startTime;
      ADSLog.logOperationEnd('ADB', '创建目录', { name }, duration);
      ADSUtils.toast('已创建', 'success');
      this.refreshFiles();
    } catch (e) {
      ADSLog.logOperationError('ADB', '创建目录', e);
      ADSUtils.toast('创建失败: ' + e.message, 'error');
    }
  }

  async loadApps() {
    if (!this.device) return;
    const list = document.getElementById('app-list');
    if (!list) return;
    list.innerHTML = '<div class="loading-inline">加载应用列表...</div>';
    const startTime = Date.now();
    try {
      ADSLog.logOperationStart('ADB', '加载应用列表');
      const output = await this.device.shellCommand('pm list packages -3');
      const packages = output.split('\n').filter(l => l.startsWith('package:')).map(l => l.replace('package:', '').trim());
      ADSLog.debug('ADB', '获取到应用包列表', { count: packages.length });
      const apps = [];
      for (const pkg of packages.slice(0, 100)) {
        try {
          const info = await this.device.shellCommand(`dumpsys package ${pkg} | grep -E "versionName|firstInstallTime" | head -2`);
          const verMatch = info.match(/versionName=([^\s]+)/);
          apps.push({ package: pkg, version: verMatch ? verMatch[1] : '-' });
        } catch (e) {
          apps.push({ package: pkg, version: '-' });
        }
      }
      const duration = Date.now() - startTime;
      this._allApps = apps;
      this._renderApps(apps);
      ADSLog.logOperationEnd('ADB', '加载应用列表', { total: packages.length, loaded: apps.length }, duration);
      if (packages.length > 100) {
        ADSUtils.toast(`已显示前 100 个应用（共 ${packages.length} 个）`, 'info');
      }
    } catch (e) {
      ADSLog.logOperationError('ADB', '加载应用列表', e);
      list.innerHTML = `<div class="empty-state"><p>加载失败: ${ADSUtils.escapeHtml(e.message)}</p></div>`;
    }
  }

  _renderApps(apps) {
    const list = document.getElementById('app-list');
    if (!list) return;
    if (apps.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>没有找到应用</p></div>';
      return;
    }
    list.innerHTML = apps.map(app => `
      <div class="app-row" data-pkg="${ADSUtils.escapeHtml(app.package)}">
        <div class="app-info">
          <span class="app-icon">📱</span>
          <div>
            <div class="app-name">${ADSUtils.escapeHtml(app.package)}</div>
            <div class="app-version">版本: ${ADSUtils.escapeHtml(app.version)}</div>
          </div>
        </div>
        <div class="app-actions">
          <button class="btn btn-xs btn-secondary app-open" data-pkg="${ADSUtils.escapeHtml(app.package)}">打开</button>
          <button class="btn btn-xs btn-danger app-uninstall" data-pkg="${ADSUtils.escapeHtml(app.package)}">卸载</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.app-uninstall').forEach(btn => {
      btn.addEventListener('click', () => this.uninstallApp(btn.dataset.pkg));
    });
    list.querySelectorAll('.app-open').forEach(btn => {
      btn.addEventListener('click', () => this.openApp(btn.dataset.pkg));
    });
  }

  filterApps(keyword) {
    if (!this._allApps) return;
    const kw = keyword.toLowerCase();
    this._renderApps(this._allApps.filter(a => a.package.toLowerCase().includes(kw)));
  }

  async openApp(pkg) {
    if (!this.device) return;
    if (!/^[a-zA-Z0-9._]+$/.test(pkg)) {
      ADSUtils.toast('无效的应用包名', 'error');
      return;
    }
    try {
      ADSLog.logOperationStart('ADB', '打开应用', { package: pkg });
      await this.device.shellCommand(`monkey -p ${pkg} 1`);
      ADSLog.logOperationEnd('ADB', '打开应用', { package: pkg });
      ADSUtils.toast('已打开 ' + pkg, 'success');
    } catch (e) {
      ADSLog.logOperationError('ADB', '打开应用', e);
      ADSUtils.toast('打开失败: ' + e.message, 'error');
    }
  }

  async uninstallApp(pkg) {
    if (!this.device) return;
    if (!/^[a-zA-Z0-9._]+$/.test(pkg)) {
      ADSUtils.toast('无效的应用包名', 'error');
      return;
    }
    const ok = await ADSUtils.confirmDialog('卸载应用', `确定要卸载 "${pkg}" 吗？`, '卸载');
    if (!ok) return;
    try {
      ADSLog.logOperationStart('ADB', '卸载应用', { package: pkg });
      const result = await this.device.uninstall(pkg);
      const success = result.includes('Success');
      ADSLog.logOperationEnd('ADB', '卸载应用', { package: pkg, result, success });
      ADSUtils.toast(success ? '已卸载' : '卸载结果: ' + result, success ? 'success' : 'warning');
      this.loadApps();
    } catch (e) {
      ADSLog.logOperationError('ADB', '卸载应用', e);
      ADSUtils.toast('卸载失败: ' + e.message, 'error');
    }
  }

  async installApp() {
    if (!this.device) return ADSUtils.toast('请先连接设备', 'warning');
    const file = await ADSUtils.pickFile('.apk');
    if (!file) return;
    const startTime = Date.now();
    try {
      ADSLog.logOperationStart('ADB', '安装应用', { name: file.name, size: ADSUtils.formatBytes(file.size) });
      ADSUtils.showLoading(`安装 ${file.name}...`);
      const data = await ADSUtils.readFileAsArrayBuffer(file);
      const result = await this.device.install(new Uint8Array(data), file.name, (sent, total) => {
        ADSUtils.updateLoadingText(`安装 ${file.name}: ${ADSUtils.formatBytes(sent)} / ${ADSUtils.formatBytes(total)}`);
      });
      const duration = Date.now() - startTime;
      const success = result.includes('Success');
      ADSUtils.hideLoading();
      ADSLog.logOperationEnd('ADB', '安装应用', { name: file.name, result, success }, duration);
      ADSUtils.toast(success ? '安装成功' : '安装结果: ' + result, success ? 'success' : 'warning');
    } catch (e) {
      ADSUtils.hideLoading();
      ADSLog.logOperationError('ADB', '安装应用', e);
      ADSUtils.toast('安装失败: ' + e.message, 'error');
    }
  }

  async executeShell() {
    if (!this.device) return ADSUtils.toast('请先连接设备', 'warning');
    const input = document.getElementById('shell-input');
    const output = document.getElementById('shell-output');
    if (!input || !output) return;
    const cmd = input.value.trim();
    if (!cmd) return;

    this.shellHistory.push(cmd);
    if (this.shellHistory.length > 200) this.shellHistory.shift();
    this.shellHistoryIndex = this.shellHistory.length;
    input.value = '';

    ADSLog.logInput('SHELL', '执行命令', { command: cmd });

    const cmdLine = document.createElement('div');
    cmdLine.className = 'shell-line shell-cmd';
    cmdLine.textContent = '$ ' + cmd;
    output.appendChild(cmdLine);

    const startTime = Date.now();
    try {
      const result = await this.device.shellCommand(cmd);
      const duration = Date.now() - startTime;
      ADSLog.logOutput('SHELL', '命令输出', { command: cmd, exitCode: 0, duration: duration + 'ms' });
      ADSLog.debug('SHELL', '命令结果', { output: result.substring(0, 500) + (result.length > 500 ? '...' : '') });
      const resultLine = document.createElement('div');
      resultLine.className = 'shell-line shell-result';
      resultLine.textContent = result;
      output.appendChild(resultLine);
    } catch (e) {
      const duration = Date.now() - startTime;
      ADSLog.logOperationError('SHELL', '执行命令', e);
      const errLine = document.createElement('div');
      errLine.className = 'shell-line shell-error';
      errLine.textContent = 'Error: ' + e.message;
      output.appendChild(errLine);
    }

    output.scrollTop = output.scrollHeight;
  }

  shellHistoryUp() {
    if (this.shellHistoryIndex > 0) {
      this.shellHistoryIndex--;
      document.getElementById('shell-input').value = this.shellHistory[this.shellHistoryIndex];
    }
  }

  shellHistoryDown() {
    if (this.shellHistoryIndex < this.shellHistory.length - 1) {
      this.shellHistoryIndex++;
      document.getElementById('shell-input').value = this.shellHistory[this.shellHistoryIndex];
    } else {
      this.shellHistoryIndex = this.shellHistory.length;
      document.getElementById('shell-input').value = '';
    }
  }

  async toggleLogcat() {
    const btn = document.getElementById('btn-logcat-toggle');
    if (this.logcatRunning) {
      this.logcatRunning = false;
      if (this.logcatAbort) this.logcatAbort();
      if (btn) btn.textContent = '开始';
      return;
    }

    if (!this.device) return ADSUtils.toast('请先连接设备', 'warning');
    this.logcatRunning = true;
    if (btn) btn.textContent = '停止';

    const output = document.getElementById('logcat-output');
    const levelSelect = document.getElementById('logcat-level');
    const filterInput = document.getElementById('logcat-filter');
    const autoscroll = document.getElementById('logcat-autoscroll');

    let cancelled = false;
    this.logcatAbort = () => { cancelled = true; };

    try {
      const level = levelSelect?.value || '';
      const args = level ? `*:${level}` : '';
      const stream = this.device.shellStream('logcat -v threadtime ' + args);

      for await (const chunk of stream) {
        if (cancelled) break;
        const filter = filterInput?.value?.toLowerCase() || '';
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (filter && !line.toLowerCase().includes(filter)) continue;
          const el = document.createElement('div');
          el.className = 'logcat-line';
          if (line.includes(' E ')) el.classList.add('log-error');
          else if (line.includes(' W ')) el.classList.add('log-warn');
          else if (line.includes(' I ')) el.classList.add('log-info');
          else if (line.includes(' D ')) el.classList.add('log-debug');
          else if (line.includes(' V ')) el.classList.add('log-verbose');
          else if (line.includes(' F ')) el.classList.add('log-fatal');
          el.textContent = line;
          output.appendChild(el);

          while (output.children.length > 5000) output.removeChild(output.firstChild);
        }
        if (autoscroll?.checked) output.scrollTop = output.scrollHeight;
      }
    } catch (e) {
      if (!cancelled) ADSUtils.toast('Logcat 错误: ' + e.message, 'error');
    }

    this.logcatRunning = false;
    if (btn) btn.textContent = '开始';
  }

  saveLogcat() {
    const output = document.getElementById('logcat-output');
    if (!output) return;
    const text = Array.from(output.children).map(el => el.textContent).join('\n');
    ADSUtils.downloadText(text, `logcat_${Date.now()}.log`);
  }

  async startSideload() {
    if (!this.device) return ADSUtils.toast('请先连接设备', 'warning');
    const file = await ADSUtils.pickFile('.zip');
    if (!file) return;

    const ok = await ADSUtils.confirmDialog('ADB Sideload', `确定要刷入 "${file.name}" 吗？\n请确保设备已进入 Recovery 并启用 ADB Sideload。`, '开始刷入');
    if (!ok) return;

    try {
      document.getElementById('sideload-idle')?.classList.add('hidden');
      document.getElementById('sideload-progress')?.classList.remove('hidden');

      const progressContainer = document.getElementById('sideload-progress-bar');
      const progressBar = ADSUtils.createProgressBar();
      progressContainer.innerHTML = '';
      progressContainer.appendChild(progressBar);

      const statusEl = document.getElementById('sideload-status');
      statusEl.textContent = '正在推送文件...';

      const data = await ADSUtils.readFileAsArrayBuffer(file);
      const localId = ++this.device._localId;
      await this.client.send({ command: 0x4E45504F, arg0: localId, arg1: 0, data: 'sideload:' + data.byteLength });
      const openResp = await this.client.receiveExpect({ command: 0x59414B4F });
      const remoteId = openResp.arg0;

      const chunkSize = 64 * 1024;
      const uint8 = new Uint8Array(data);
      let offset = 0;

      while (offset < uint8.length) {
        const end = Math.min(offset + chunkSize, uint8.length);
        const chunk = uint8.slice(offset, end);
        await this.client.send({ command: 0x45545257, arg0: localId, arg1: remoteId, data: chunk.buffer });
        const ack = await this.client.receive();
        if (ack.command === 0x45534C43) throw new Error('设备关闭了 sideload 连接');
        await this.client.send({ command: 0x59414B4F, arg0: localId, arg1: remoteId });
        offset = end;
        const pct = (offset / uint8.length) * 100;
        progressBar.update(pct, `${ADSUtils.formatBytes(offset)} / ${ADSUtils.formatBytes(uint8.length)}`);
      }

      progressBar.update(100, '完成');
      statusEl.textContent = '刷入完成，设备将自动重启...';
      ADSUtils.toast('Sideload 完成', 'success');
    } catch (e) {
      ADSUtils.toast('Sideload 失败: ' + e.message, 'error');
    }

    document.getElementById('sideload-idle')?.classList.remove('hidden');
    document.getElementById('sideload-progress')?.classList.add('hidden');
  }
}
