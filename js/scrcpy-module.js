/**
 * Android Debug Suite Web - Scrcpy Module
 * Screen mirroring, touch control, toolbar actions
 */

function initScrcpyModule() {
  const module = new ScrcpyModule();
  return module;
}

class ScrcpyModule {
  constructor() {
    this.client = null;
    this.running = false;
    this.canvas = null;
    this.scale = 1;
    this.rotation = 0;
    this.isPaused = false;
    this.lastTouch = null;
    this.init();
  }

  init() {
    const content = document.getElementById('main-content');
    content.innerHTML = this._buildMainHTML();
    this._bindEvents();
  }

  render() {
    const content = document.getElementById('main-content');
    content.innerHTML = this._buildMainHTML();
    this._bindEvents();
  }

  _buildMainHTML() {
    return `
      <div class="scrcpy-container">
        <div class="scrcpy-toolbar">
          <button id="btn-scrcpy-start" class="btn btn-primary">▶ 开始投屏</button>
          <button id="btn-scrcpy-stop" class="btn btn-danger" disabled>⏹ 停止</button>
          <div class="toolbar-separator"></div>
          <button id="btn-scrcpy-pause" class="btn btn-secondary" disabled>⏸ 暂停</button>
          <button id="btn-scrcpy-screenshot" class="btn btn-secondary" disabled>📸 截图</button>
          <div class="toolbar-separator"></div>
          <button id="btn-scrcpy-home" class="btn btn-icon" title="Home">🏠</button>
          <button id="btn-scrcpy-back" class="btn btn-icon" title="返回">⬅️</button>
          <button id="btn-scrcpy-recent" class="btn btn-icon" title="最近任务">📋</button>
          <button id="btn-scrcpy-power" class="btn btn-icon" title="电源">⏻</button>
          <div class="toolbar-separator"></div>
          <button id="btn-scrcpy-vol-up" class="btn btn-icon" title="音量+">🔊</button>
          <button id="btn-scrcpy-vol-down" class="btn btn-icon" title="音量-">🔉</button>
          <div class="toolbar-separator"></div>
          <button id="btn-scrcpy-zoom-in" class="btn btn-icon" title="放大">🔍+</button>
          <button id="btn-scrcpy-zoom-out" class="btn btn-icon" title="缩小">🔍-</button>
          <button id="btn-scrcpy-fit" class="btn btn-icon" title="适配窗口">📐</button>
          <select id="scrcpy-quality" class="select-sm" title="画质">
            <option value="2000000">低画质</option>
            <option value="8000000" selected>中画质</option>
            <option value="20000000">高画质</option>
          </select>
          <select id="scrcpy-maxsize" class="select-sm" title="分辨率">
            <option value="720">720p</option>
            <option value="1280" selected>1280p</option>
            <option value="1920">1920p</option>
            <option value="0">原始</option>
          </select>
        </div>
        <div id="scrcpy-screen-container" class="scrcpy-screen-container">
          <div id="scrcpy-placeholder" class="scrcpy-placeholder">
            <div class="empty-icon">📺</div>
            <h3>设备投屏</h3>
            <p>请先通过 ADB 连接设备，然后点击"开始投屏"</p>
            <p class="hint">需要设备上已安装 scrcpy-server</p>
          </div>
          <canvas id="scrcpy-canvas" class="scrcpy-canvas hidden"></canvas>
        </div>
        <div class="scrcpy-status-bar">
          <span id="scrcpy-status">未启动</span>
          <span id="scrcpy-resolution">-</span>
          <span id="scrcpy-fps">-</span>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const $ = (sel) => document.querySelector(sel);

    $('#btn-scrcpy-start')?.addEventListener('click', () => this.start());
    $('#btn-scrcpy-stop')?.addEventListener('click', () => this.stop());
    $('#btn-scrcpy-pause')?.addEventListener('click', () => this.togglePause());
    $('#btn-scrcpy-screenshot')?.addEventListener('click', () => this.takeScreenshot());

    $('#btn-scrcpy-home')?.addEventListener('click', () => this.client?.pressHome());
    $('#btn-scrcpy-back')?.addEventListener('click', () => this.client?.pressBack());
    $('#btn-scrcpy-recent')?.addEventListener('click', () => this.client?.pressAppSwitch());
    $('#btn-scrcpy-power')?.addEventListener('click', () => this.client?.pressPower());
    $('#btn-scrcpy-vol-up')?.addEventListener('click', () => this.client?.volumeUp());
    $('#btn-scrcpy-vol-down')?.addEventListener('click', () => this.client?.volumeDown());

    $('#btn-scrcpy-zoom-in')?.addEventListener('click', () => this.zoom(0.1));
    $('#btn-scrcpy-zoom-out')?.addEventListener('click', () => this.zoom(-0.1));
    $('#btn-scrcpy-fit')?.addEventListener('click', () => this.fitToWindow());
  }

  onActivate() {
    this._showPanel('scrcpy-home');
  }
  onDeactivate() {
    if (this.running) this.stop();
  }

  async disconnect() {
    if (this.running) await this.stop();
  }
  onPanelSwitch(panelId) {
    this._showPanel(panelId);
  }

  _showPanel(panelId) {
    // Scrcpy has a single view, no sub-panels to switch
  }

  async start() {
    const adbDevice = ADSMain.getAdbDevice();
    if (!adbDevice) return ADSUtils.toast('请先通过 ADB 连接设备', 'warning');

    try {
      ADSUtils.showLoading('正在启动投屏...');

      this.canvas = document.getElementById('scrcpy-canvas');
      const placeholder = document.getElementById('scrcpy-placeholder');

      const maxSize = parseInt(document.getElementById('scrcpy-maxsize')?.value || '1280');
      const bitRate = parseInt(document.getElementById('scrcpy-quality')?.value || '8000000');

      this.client = new ScrcpyClient(adbDevice);
      this.client.options.maxSize = maxSize;
      this.client.options.bitRate = bitRate;

      this.client.onSizeChange = (w, h) => {
        document.getElementById('scrcpy-resolution').textContent = `${w}x${h}`;
        this.fitToWindow();
      };

      this.client.onError = (e) => {
        ADSUtils.toast('投屏错误: ' + e.message, 'error');
        this._updateUI(false);
      };

      this.client.onFrame = () => {
        if (this._fpsCounter !== undefined) {
          this._fpsCounter++;
        }
      };

      await this.client.start(this.canvas);

      placeholder?.classList.add('hidden');
      this.canvas.classList.remove('hidden');
      this.running = true;
      this._updateUI(true);
      this._setupTouchHandlers();
      this._startFpsCounter();

      ADSUtils.hideLoading();
      ADSUtils.toast('投屏已启动', 'success');
    } catch (e) {
      ADSUtils.hideLoading();
      ADSUtils.toast('启动投屏失败: ' + e.message, 'error');
    }
  }

  async stop() {
    if (this.client) {
      await this.client.stop().catch(() => {});
      this.client = null;
    }
    this.running = false;
    this.canvas?.classList.add('hidden');
    document.getElementById('scrcpy-placeholder')?.classList.remove('hidden');
    this._updateUI(false);
    this._stopFpsCounter();
    ADSUtils.toast('投屏已停止', 'info');
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('btn-scrcpy-pause');
    if (btn) btn.textContent = this.isPaused ? '▶ 继续' : '⏸ 暂停';
    if (this.canvas) {
      this.canvas.style.opacity = this.isPaused ? '0.5' : '1';
    }
  }

  takeScreenshot() {
    if (!this.client) return;
    const dataUrl = this.client.takeScreenshot();
    if (dataUrl) {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `screenshot_${Date.now()}.png`;
      link.click();
      ADSUtils.toast('截图已保存', 'success');
    }
  }

  zoom(delta) {
    this.scale = Math.max(0.25, Math.min(3, this.scale + delta));
    if (this.canvas) {
      this.canvas.style.transform = `scale(${this.scale})`;
      this.canvas.style.transformOrigin = 'center center';
    }
  }

  fitToWindow() {
    if (!this.canvas || !this.client) return;
    const container = document.getElementById('scrcpy-screen-container');
    if (!container) return;

    const cw = container.clientWidth - 20;
    const ch = container.clientHeight - 20;
    const iw = this.canvas.width;
    const ih = this.canvas.height;
    if (!iw || !ih) return;

    this.scale = Math.min(cw / iw, ch / ih, 1);
    this.canvas.style.transform = `scale(${this.scale})`;
    this.canvas.style.transformOrigin = 'top left';
    this.canvas.style.width = iw + 'px';
    this.canvas.style.height = ih + 'px';
  }

  _setupTouchHandlers() {
    if (!this.canvas) return;

    const getCanvasCoords = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / this.scale;
      const y = (clientY - rect.top) / this.scale;
      const scaleX = this.canvas.width / (rect.width / this.scale);
      const scaleY = this.canvas.height / (rect.height / this.scale);
      return { x: x * scaleX, y: y * scaleY };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.client || this.isPaused) return;
      e.preventDefault();
      const { x, y } = getCanvasCoords(e.clientX, e.clientY);
      this.client.sendTouch(TOUCH_ACTION_DOWN, x, y);
      this.lastTouch = { x, y };
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.client || this.isPaused || !this.lastTouch) return;
      e.preventDefault();
      const { x, y } = getCanvasCoords(e.clientX, e.clientY);
      this.client.sendTouch(TOUCH_ACTION_MOVE, x, y);
      this.lastTouch = { x, y };
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (!this.client || this.isPaused) return;
      e.preventDefault();
      const { x, y } = getCanvasCoords(e.clientX, e.clientY);
      this.client.sendTouch(TOUCH_ACTION_UP, x, y);
      this.lastTouch = null;
    });

    this.canvas.addEventListener('mouseleave', (e) => {
      if (this.lastTouch && this.client) {
        this.client.sendTouch(TOUCH_ACTION_UP, this.lastTouch.x, this.lastTouch.y);
        this.lastTouch = null;
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      if (!this.client || this.isPaused) return;
      e.preventDefault();
      this.client.sendScroll(0, 0, e.deltaX > 0 ? 1 : -1, e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.client || this.isPaused) return;
      e.preventDefault();
      const touch = e.touches[0];
      const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
      this.client.sendTouch(TOUCH_ACTION_DOWN, x, y);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.client || this.isPaused) return;
      e.preventDefault();
      const touch = e.touches[0];
      const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
      this.client.sendTouch(TOUCH_ACTION_MOVE, x, y);
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      if (!this.client || this.isPaused) return;
      e.preventDefault();
      const { x, y } = getCanvasCoords(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      this.client.sendTouch(TOUCH_ACTION_UP, x, y);
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('click', (e) => {
      if (!this.client || this.isPaused) return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  _updateUI(running) {
    const $ = (sel) => document.querySelector(sel);
    $('#btn-scrcpy-start')?.setAttribute('disabled', running);
    $('#btn-scrcpy-stop')?.setAttribute('disabled', !running);
    $('#btn-scrcpy-pause')?.setAttribute('disabled', !running);
    $('#btn-scrcpy-screenshot')?.setAttribute('disabled', !running);
    document.getElementById('scrcpy-status').textContent = running ? '投屏中' : '未启动';
  }

  _startFpsCounter() {
    this._fpsCounter = 0;
    this._fpsTimer = setInterval(() => {
      const el = document.getElementById('scrcpy-fps');
      if (el) el.textContent = this._fpsCounter + ' FPS';
      this._fpsCounter = 0;
    }, 1000);
  }

  _stopFpsCounter() {
    if (this._fpsTimer) {
      clearInterval(this._fpsTimer);
      this._fpsTimer = null;
    }
    const el = document.getElementById('scrcpy-fps');
    if (el) el.textContent = '-';
  }
}
