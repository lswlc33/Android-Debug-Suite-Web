/**
 * Android Debug Suite Web - Fastboot Module
 * Categories: Device Info, Security, Flash, Boot, Partition, Reboot, Slots, Advanced
 */

function initFastbootModule() {
  const module = new FastbootModule();
  return module;
}

class FastbootModule {
  constructor() {
    this.device = null;
    this.server = new FastbootServer();
    this.vars = {};
    this._flashFile = null;
    this._bootFile = null;
    this._batchFiles = [];
    this._cmdHistory = [];
    this._cmdHistoryIdx = -1;
    this.currentCategory = 'info';
    this.init();
  }

  init() {
    const content = document.getElementById('main-content');
    content.innerHTML = this._buildHTML();
    this._bindEvents();
    this._showCategory('info');
  }

  _buildHTML() {
    return `
      <div class="fb-wrapper">
        <!-- Connection Screen -->
        <div id="fb-not-connected" class="fb-connect-screen">
          <div class="fb-hero">
            <div class="fb-hero-icon">⚡</div>
            <h2>Fastboot 模式</h2>
            <p class="fb-hero-desc">底层刷机工具，用于解锁、刷写分区、管理启动槽位等</p>
            <div class="fb-hero-actions">
              <button id="btn-fb-connect" class="btn btn-primary btn-xl">
                <span class="btn-icon-left">🔌</span> 连接 Fastboot 设备
              </button>
              <button id="btn-fb-from-adb" class="btn btn-secondary btn-lg">
                <span class="btn-icon-left">🔄</span> 从 ADB 重启到 Bootloader
              </button>
            </div>
          </div>
          <div class="fb-guide">
            <h3>如何进入 Fastboot 模式</h3>
            <div class="fb-guide-grid">
              <div class="fb-guide-card">
                <div class="fb-guide-icon">🔘</div>
                <h4>按键组合</h4>
                <p>关机状态下，同时按住 <kbd>电源键</kbd> + <kbd>音量下键</kbd> 直到进入 Bootloader</p>
              </div>
              <div class="fb-guide-card">
                <div class="fb-guide-icon">💻</div>
                <h4>ADB 命令</h4>
                <p>设备连接 USB 后执行 <code>adb reboot bootloader</code></p>
              </div>
              <div class="fb-guide-card">
                <div class="fb-guide-icon">⚙️</div>
                <h4>前提条件</h4>
                <p>需要浏览器支持 WebUSB（Chrome 61+ / Edge 79+）</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Dashboard (after connected) -->
        <div id="fb-connected" class="fb-dashboard hidden">
          <!-- Device Summary Bar -->
          <div class="fb-summary-bar" id="fb-summary-bar">
            <div class="fb-summary-item">
              <span class="fb-summary-label">设备</span>
              <span class="fb-summary-value" id="fb-sum-product">-</span>
            </div>
            <div class="fb-summary-item">
              <span class="fb-summary-label">序列号</span>
              <span class="fb-summary-value" id="fb-sum-serial">-</span>
            </div>
            <div class="fb-summary-item">
              <span class="fb-summary-label">Bootloader</span>
              <span class="fb-summary-value" id="fb-sum-unlock">-</span>
            </div>
            <div class="fb-summary-item">
              <span class="fb-summary-label">电量</span>
              <span class="fb-summary-value" id="fb-sum-battery">-</span>
            </div>
            <div class="fb-summary-item">
              <span class="fb-summary-label">槽位</span>
              <span class="fb-summary-value" id="fb-sum-slot">-</span>
            </div>
            <button id="btn-fb-disconnect" class="btn btn-sm btn-danger fb-disconnect-btn">断开</button>
          </div>

          <!-- Category Navigation -->
          <nav class="fb-cat-nav" id="fb-cat-nav">
            <button class="fb-cat-btn active" data-cat="info"><span class="fb-cat-icon">📋</span><span>设备信息</span></button>
            <button class="fb-cat-btn" data-cat="security"><span class="fb-cat-icon">🔒</span><span>安全管理</span></button>
            <button class="fb-cat-btn" data-cat="flash"><span class="fb-cat-icon">📦</span><span>分区刷写</span></button>
            <button class="fb-cat-btn" data-cat="boot"><span class="fb-cat-icon">🚀</span><span>临时启动</span></button>
            <button class="fb-cat-btn" data-cat="partition"><span class="fb-cat-icon">🗂️</span><span>分区管理</span></button>
            <button class="fb-cat-btn" data-cat="reboot"><span class="fb-cat-icon">🔄</span><span>重启控制</span></button>
            <button class="fb-cat-btn" data-cat="slots"><span class="fb-cat-icon">🎰</span><span>槽位管理</span></button>
            <button class="fb-cat-btn" data-cat="advanced"><span class="fb-cat-icon">⚙️</span><span>高级命令</span></button>
          </nav>

          <!-- Category Panels -->
          <div class="fb-cat-content">
            <!-- INFO -->
            <section id="fb-cat-info" class="fb-section active">
              <div class="fb-section-header">
                <h2>📋 设备详细信息</h2>
                <button id="btn-fb-refresh-vars" class="btn btn-sm btn-secondary">刷新</button>
              </div>
              <div class="fb-vars-grid" id="fb-vars-grid"></div>
              <details class="fb-details">
                <summary>查看全部变量 (getvar all)</summary>
                <pre id="fb-all-vars" class="fb-pre"></pre>
              </details>
            </section>

            <!-- SECURITY -->
            <section id="fb-cat-security" class="fb-section">
              <div class="fb-section-header"><h2>🔒 安全管理</h2></div>
              <div class="fb-card-grid">
                <div class="fb-card fb-card-danger">
                  <div class="fb-card-icon">🔓</div>
                  <h3>解锁 Bootloader</h3>
                  <p>允许刷入非官方固件。解锁将<strong>清除所有数据</strong>并可能使保修失效。</p>
                  <div class="fb-card-status" id="fb-unlock-status"></div>
                  <button id="btn-fb-unlock" class="btn btn-danger">解锁 Bootloader</button>
                </div>
                <div class="fb-card fb-card-warning">
                  <div class="fb-card-icon">🔐</div>
                  <h3>锁定 Bootloader</h3>
                  <p>恢复锁定状态以通过安全验证。锁定也会<strong>清除数据</strong>。</p>
                  <button id="btn-fb-lock" class="btn btn-warning">锁定 Bootloader</button>
                </div>
                <div class="fb-card">
                  <div class="fb-card-icon">🏭</div>
                  <h3>OEM 解锁/锁定</h3>
                  <p>部分设备使用 OEM 命令控制解锁（三星等旧设备）。</p>
                  <div class="action-btns">
                    <button id="btn-fb-oem-unlock" class="btn btn-danger btn-sm">OEM 解锁</button>
                    <button id="btn-fb-oem-lock" class="btn btn-warning btn-sm">OEM 锁定</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- FLASH -->
            <section id="fb-cat-flash" class="fb-section">
              <div class="fb-section-header"><h2>📦 分区刷写</h2></div>
              <div class="fb-card-grid">
                <div class="fb-card fb-card-primary">
                  <div class="fb-card-icon">🎯</div>
                  <h3>单分区刷写</h3>
                  <p>将镜像文件写入指定分区</p>
                  <div class="fb-form">
                    <div class="fb-form-group">
                      <label>目标分区</label>
                      <div class="fb-partition-picker">
                        <select id="fb-partition-select">
                          <optgroup label="启动相关">
                            <option value="boot">boot</option>
                            <option value="init_boot">init_boot</option>
                            <option value="recovery">recovery</option>
                            <option value="dtbo">dtbo</option>
                            <option value="vbmeta">vbmeta</option>
                            <option value="vbmeta_system">vbmeta_system</option>
                          </optgroup>
                          <optgroup label="系统分区">
                            <option value="system">system</option>
                            <option value="vendor">vendor</option>
                            <option value="product">product</option>
                            <option value="system_ext">system_ext</option>
                            <option value="odm">odm</option>
                            <option value="super">super</option>
                          </optgroup>
                          <optgroup label="其他">
                            <option value="userdata">userdata</option>
                            <option value="cache">cache</option>
                            <option value="metadata">metadata</option>
                            <option value="radio">radio</option>
                            <option value="modem">modem</option>
                          </optgroup>
                          <optgroup label="自定义">
                            <option value="__custom__">自定义分区名...</option>
                          </optgroup>
                        </select>
                        <input type="text" id="fb-custom-partition" class="fb-input hidden" placeholder="输入分区名" />
                      </div>
                    </div>
                    <div class="fb-form-group">
                      <label>镜像文件</label>
                      <div class="fb-file-row">
                        <button id="btn-fb-select-img" class="btn btn-secondary">选择文件</button>
                        <span id="fb-selected-file" class="fb-file-label">未选择</span>
                      </div>
                    </div>
                    <div id="fb-flash-progress" class="fb-progress-area hidden"></div>
                    <button id="btn-fb-flash" class="btn btn-primary btn-lg fb-action-btn">开始刷入</button>
                  </div>
                </div>

                <div class="fb-card">
                  <div class="fb-card-icon">📋</div>
                  <h3>批量刷写</h3>
                  <p>一次选择多个文件，按文件名自动匹配分区（如 boot.img → boot）</p>
                  <div class="fb-form">
                    <button id="btn-fb-batch-select" class="btn btn-secondary">选择多个 .img 文件</button>
                    <div id="fb-batch-list" class="fb-batch-list"></div>
                    <div id="fb-batch-progress" class="fb-progress-area hidden"></div>
                    <button id="btn-fb-batch-flash" class="btn btn-primary fb-action-btn hidden">开始批量刷写</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- BOOT -->
            <section id="fb-cat-boot" class="fb-section">
              <div class="fb-section-header"><h2>🚀 临时启动</h2></div>
              <div class="fb-card-grid">
                <div class="fb-card fb-card-primary">
                  <div class="fb-card-icon">⚡</div>
                  <h3>临时启动镜像</h3>
                  <p>不写入 flash，直接从内存启动指定镜像。重启后失效。适用于测试 Recovery、内核等。</p>
                  <div class="fb-form">
                    <div class="fb-form-group">
                      <label>内核镜像</label>
                      <div class="fb-file-row">
                        <button id="btn-fb-select-boot" class="btn btn-secondary">选择文件</button>
                        <span id="fb-boot-file" class="fb-file-label">未选择</span>
                      </div>
                    </div>
                    <button id="btn-fb-boot" class="btn btn-primary btn-lg fb-action-btn">临时启动</button>
                  </div>
                </div>
                <div class="fb-card">
                  <div class="fb-card-icon">💡</div>
                  <h3>使用场景</h3>
                  <ul class="fb-tips">
                    <li>测试 TWRP Recovery 而不刷入</li>
                    <li>临时启动自定义内核</li>
                    <li>救援无法启动的设备</li>
                    <li>刷入前预览功能</li>
                  </ul>
                </div>
              </div>
            </section>

            <!-- PARTITION -->
            <section id="fb-cat-partition" class="fb-section">
              <div class="fb-section-header"><h2>🗂️ 分区管理</h2></div>
              <div class="fb-card-grid">
                <div class="fb-card fb-card-danger">
                  <div class="fb-card-icon">🗑️</div>
                  <h3>擦除分区</h3>
                  <p>清除指定分区的全部数据，<strong>不可恢复</strong></p>
                  <div class="fb-form">
                    <div class="fb-form-group">
                      <label>分区名</label>
                      <select id="fb-erase-partition">
                        <option value="cache">cache（缓存）</option>
                        <option value="userdata">userdata（用户数据）</option>
                        <option value="metadata">metadata（元数据）</option>
                        <option value="dalvik_cache">dalvik_cache</option>
                      </select>
                    </div>
                    <button id="btn-fb-erase" class="btn btn-danger fb-action-btn">擦除分区</button>
                  </div>
                </div>
                <div class="fb-card fb-card-warning">
                  <div class="fb-card-icon">🧹</div>
                  <h3>恢复出厂设置</h3>
                  <p>擦除 userdata 和 metadata 分区，等同于恢复出厂设置。</p>
                  <button id="btn-fb-factory-reset" class="btn btn-warning fb-action-btn">恢复出厂设置</button>
                </div>
                <div class="fb-card">
                  <div class="fb-card-icon">📐</div>
                  <h3>格式化数据分区</h3>
                  <p>格式化 userdata 并重建文件系统，用于解决加密问题或 data 损坏。</p>
                  <button id="btn-fb-format-data" class="btn btn-secondary fb-action-btn">格式化 data</button>
                </div>
              </div>
            </section>

            <!-- REBOOT -->
            <section id="fb-cat-reboot" class="fb-section">
              <div class="fb-section-header"><h2>🔄 重启控制</h2></div>
              <div class="fb-card-grid fb-reboot-grid">
                <button class="fb-reboot-card" id="btn-fb-reboot">
                  <span class="fb-reboot-icon">🔄</span>
                  <span class="fb-reboot-label">正常重启</span>
                  <span class="fb-reboot-desc">进入系统</span>
                </button>
                <button class="fb-reboot-card" id="btn-fb-reboot-bl">
                  <span class="fb-reboot-icon">⚡</span>
                  <span class="fb-reboot-label">重启到 Bootloader</span>
                  <span class="fb-reboot-desc">Fastboot 模式</span>
                </button>
                <button class="fb-reboot-card" id="btn-fb-reboot-rec">
                  <span class="fb-reboot-icon">🔧</span>
                  <span class="fb-reboot-label">重启到 Recovery</span>
                  <span class="fb-reboot-desc">恢复模式</span>
                </button>
                <button class="fb-reboot-card" id="btn-fb-reboot-fastbootd">
                  <span class="fb-reboot-icon">📱</span>
                  <span class="fb-reboot-label">重启到 Fastbootd</span>
                  <span class="fb-reboot-desc">用户空间 Fastboot</span>
                </button>
                <button class="fb-reboot-card" id="btn-fb-continue">
                  <span class="fb-reboot-icon">▶️</span>
                  <span class="fb-reboot-label">继续启动</span>
                  <span class="fb-reboot-desc">跳过当前状态</span>
                </button>
                <button class="fb-reboot-card fb-reboot-danger" id="btn-fb-poweroff">
                  <span class="fb-reboot-icon">⏻</span>
                  <span class="fb-reboot-label">关机</span>
                  <span class="fb-reboot-desc">关闭设备</span>
                </button>
              </div>
            </section>

            <!-- SLOTS -->
            <section id="fb-cat-slots" class="fb-section">
              <div class="fb-section-header"><h2>🎰 槽位管理 (A/B)</h2></div>
              <div id="fb-slots-content">
                <div class="fb-slots-overview" id="fb-slots-overview"></div>
                <div class="fb-card-grid">
                  <div class="fb-card">
                    <div class="fb-card-icon">🇦</div>
                    <h3>Slot A</h3>
                    <div id="fb-slot-a-info" class="fb-slot-detail"></div>
                    <button id="btn-fb-slot-a" class="btn btn-secondary fb-action-btn">切换到 Slot A</button>
                  </div>
                  <div class="fb-card">
                    <div class="fb-card-icon">🇧</div>
                    <h3>Slot B</h3>
                    <div id="fb-slot-b-info" class="fb-slot-detail"></div>
                    <button id="btn-fb-slot-b" class="btn btn-secondary fb-action-btn">切换到 Slot B</button>
                  </div>
                </div>
                <div class="fb-card">
                  <h3>常用操作</h3>
                  <p>切换槽位后需要重启才能生效。如果某个槽位无法启动，可切换到另一个槽位进入系统。</p>
                  <div class="action-btns">
                    <button id="btn-fb-slot-a-reboot" class="btn btn-sm btn-secondary">切到 A 并重启</button>
                    <button id="btn-fb-slot-b-reboot" class="btn btn-sm btn-secondary">切到 B 并重启</button>
                  </div>
                </div>
              </div>
              <div id="fb-no-slots" class="empty-state hidden">
                <div class="empty-icon">ℹ️</div>
                <h3>该设备不支持 A/B 槽位</h3>
                <p>此设备没有 A/B 分区方案，无需管理槽位。</p>
              </div>
            </section>

            <!-- ADVANCED -->
            <section id="fb-cat-advanced" class="fb-section">
              <div class="fb-section-header"><h2>⚙️ 高级命令</h2></div>
              <div class="fb-card-grid">
                <div class="fb-card fb-card-wide">
                  <div class="fb-card-icon">💻</div>
                  <h3>Fastboot 终端</h3>
                  <p>直接发送原始 Fastboot 命令</p>
                  <div class="fb-terminal">
                    <div id="fb-terminal-output" class="fb-terminal-output"></div>
                    <div class="fb-terminal-input-row">
                      <span class="fb-terminal-prompt">fastboot</span>
                      <input type="text" id="fb-cmd-input" class="fb-terminal-input" placeholder="输入命令，如: getvar product" autocomplete="off" />
                      <button id="btn-fb-cmd-send" class="btn btn-primary btn-sm">发送</button>
                    </div>
                  </div>
                  <div class="fb-quick-cmds">
                    <span class="fb-quick-label">快捷命令：</span>
                    <button class="btn btn-xs btn-secondary fb-quick-cmd" data-cmd="getvar all">getvar all</button>
                    <button class="btn btn-xs btn-secondary fb-quick-cmd" data-cmd="getvar product">getvar product</button>
                    <button class="btn btn-xs btn-secondary fb-quick-cmd" data-cmd="getvar unlocked">getvar unlocked</button>
                    <button class="btn btn-xs btn-secondary fb-quick-cmd" data-cmd="getvar current-slot">getvar current-slot</button>
                    <button class="btn btn-xs btn-secondary fb-quick-cmd" data-cmd="getvar battery-soc">getvar battery</button>
                    <button class="btn btn-xs btn-secondary fb-quick-cmd" data-cmd="getvar max-download-size">getvar max-dl</button>
                  </div>
                </div>
                <div class="fb-card">
                  <div class="fb-card-icon">🔍</div>
                  <h3>变量查询</h3>
                  <p>查询指定的 Fastboot 变量</p>
                  <div class="fb-form">
                    <div class="fb-form-group">
                      <input type="text" id="fb-getvar-key" class="fb-input" placeholder="变量名，如: product" />
                    </div>
                    <button id="btn-fb-getvar" class="btn btn-secondary">查询</button>
                    <div id="fb-getvar-result" class="fb-result hidden"></div>
                  </div>
                </div>
                <div class="fb-card">
                  <div class="fb-card-icon">🏷️</div>
                  <h3>OEM 命令</h3>
                  <p>发送自定义 OEM 命令（设备相关，功能因厂商而异）</p>
                  <div class="fb-form">
                    <div class="fb-form-group">
                      <input type="text" id="fb-oem-cmd" class="fb-input" placeholder="命令，如: unlock" />
                    </div>
                    <button id="btn-fb-oem-send" class="btn btn-secondary">发送 OEM 命令</button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    $('#btn-fb-connect')?.addEventListener('click', () => this.connect());
    $('#btn-fb-from-adb')?.addEventListener('click', () => this.rebootToBootloader());
    $('#btn-fb-disconnect')?.addEventListener('click', () => this.disconnect());

    $$('.fb-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => this._showCategory(btn.dataset.cat));
    });

    $('#btn-fb-refresh-vars')?.addEventListener('click', () => this.refreshVars());

    $('#btn-fb-unlock')?.addEventListener('click', () => this.unlock());
    $('#btn-fb-lock')?.addEventListener('click', () => this.lock());
    $('#btn-fb-oem-unlock')?.addEventListener('click', () => this.oemUnlock());
    $('#btn-fb-oem-lock')?.addEventListener('click', () => this.oemLock());

    $('#fb-partition-select')?.addEventListener('change', (e) => {
      $('#fb-custom-partition')?.classList.toggle('hidden', e.target.value !== '__custom__');
    });
    $('#btn-fb-select-img')?.addEventListener('click', () => this.selectFlashImage());
    $('#btn-fb-flash')?.addEventListener('click', () => this.flashPartition());

    $('#btn-fb-batch-select')?.addEventListener('click', () => this.selectBatchFiles());
    $('#btn-fb-batch-flash')?.addEventListener('click', () => this.batchFlash());

    $('#btn-fb-select-boot')?.addEventListener('click', () => this.selectBootImage());
    $('#btn-fb-boot')?.addEventListener('click', () => this.bootImage());

    $('#btn-fb-erase')?.addEventListener('click', () => this.erasePartition());
    $('#btn-fb-factory-reset')?.addEventListener('click', () => this.factoryReset());
    $('#btn-fb-format-data')?.addEventListener('click', () => this.formatData());

    $('#btn-fb-reboot')?.addEventListener('click', () => this.reboot(''));
    $('#btn-fb-reboot-bl')?.addEventListener('click', () => this.reboot('bootloader'));
    $('#btn-fb-reboot-rec')?.addEventListener('click', () => this.reboot('recovery'));
    $('#btn-fb-reboot-fastbootd')?.addEventListener('click', () => this.reboot('fastboot'));
    $('#btn-fb-continue')?.addEventListener('click', () => this.continueBoot());
    $('#btn-fb-poweroff')?.addEventListener('click', () => this.powerOff());

    $('#btn-fb-slot-a')?.addEventListener('click', () => this.setActiveSlot('a'));
    $('#btn-fb-slot-b')?.addEventListener('click', () => this.setActiveSlot('b'));
    $('#btn-fb-slot-a-reboot')?.addEventListener('click', () => this.setActiveSlotAndReboot('a'));
    $('#btn-fb-slot-b-reboot')?.addEventListener('click', () => this.setActiveSlotAndReboot('b'));

    $('#fb-cmd-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendRawCommand();
      if (e.key === 'ArrowUp') { e.preventDefault(); this._cmdHistoryUp(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this._cmdHistoryDown(); }
    });
    $('#btn-fb-cmd-send')?.addEventListener('click', () => this.sendRawCommand());
    $$('.fb-quick-cmd').forEach(btn => {
      btn.addEventListener('click', () => {
        $('#fb-cmd-input').value = btn.dataset.cmd;
        this.sendRawCommand();
      });
    });

    $('#btn-fb-getvar')?.addEventListener('click', () => this.getvarQuery());
    $('#fb-getvar-key')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.getvarQuery(); });
    $('#btn-fb-oem-send')?.addEventListener('click', () => this.oemCommand());
    $('#fb-oem-cmd')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.oemCommand(); });
  }

  _showCategory(cat) {
    this.currentCategory = cat;
    document.querySelectorAll('.fb-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.fb-cat-btn').forEach(b => b.classList.remove('active'));
    const section = document.getElementById('fb-cat-' + cat);
    if (section) section.classList.add('active');
    document.querySelector(`.fb-cat-btn[data-cat="${cat}"]`)?.classList.add('active');
  }

  onActivate() {
    this._showCategory('info');
  }
  onDeactivate() {}
  onPanelSwitch(panelId) {
    // 始终显示 dashboard 以便预览内容
    document.getElementById('fb-not-connected')?.classList.add('hidden');
    document.getElementById('fb-connected')?.classList.remove('hidden');
    this._showCategory(panelId);
  }

  _showPanel(panelId) {
    this._showCategory(panelId);
  }

  _updateSummary() {
    const v = this.vars;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '-'; };
    set('fb-sum-product', v['product']);
    set('fb-sum-serial', v['serialno']);
    set('fb-sum-battery', v['battery-soc'] ? v['battery-soc'] + '%' : '-');
    set('fb-sum-slot', v['current-slot'] || '-');

    const unlockEl = document.getElementById('fb-sum-unlock');
    if (unlockEl) {
      const unlocked = v['unlocked'];
      if (unlocked === 'yes') {
        unlockEl.innerHTML = '<span class="badge badge-success">已解锁</span>';
      } else if (unlocked === 'no') {
        unlockEl.innerHTML = '<span class="badge badge-warning">已锁定</span>';
      } else {
        unlockEl.textContent = unlocked || '-';
      }
    }

    const unlockStatus = document.getElementById('fb-unlock-status');
    if (unlockStatus) {
      const unlocked = v['unlocked'];
      if (unlocked === 'yes') {
        unlockStatus.innerHTML = '<span class="fb-status-badge success">Bootloader 已解锁</span>';
      } else {
        unlockStatus.innerHTML = '<span class="fb-status-badge warning">Bootloader 已锁定</span>';
      }
    }
  }

  _displayVars() {
    const grid = document.getElementById('fb-vars-grid');
    if (!grid) return;

    const categories = [
      {
        title: '基本信息',
        vars: [
          { key: 'product', label: '产品名' },
          { key: 'serialno', label: '序列号' },
          { key: 'variant', label: '变体' },
          { key: 'version-bootloader', label: 'Bootloader 版本' },
          { key: 'version-baseband', label: '基带版本' },
        ]
      },
      {
        title: '安全状态',
        vars: [
          { key: 'secure', label: '安全启动' },
          { key: 'unlocked', label: '解锁状态' },
        ]
      },
      {
        title: '电量与存储',
        vars: [
          { key: 'battery-soc', label: '电量', format: (v) => v ? v + '%' : '-' },
          { key: 'off-mode-charge', label: '关机充电' },
          { key: 'max-download-size', label: '最大下载大小', format: (v) => {
            const m = v?.match(/0x([0-9a-fA-F]+)/);
            return m ? ADSUtils.formatBytes(parseInt(m[1], 16)) : v;
          }},
        ]
      },
      {
        title: '分区槽位',
        vars: [
          { key: 'slot-count', label: '槽位数' },
          { key: 'current-slot', label: '当前槽位' },
          { key: 'slot-successful:a', label: 'Slot A 启动成功' },
          { key: 'slot-successful:b', label: 'Slot B 启动成功' },
          { key: 'slot-unbootable:a', label: 'Slot A 可启动' },
          { key: 'slot-unbootable:b', label: 'Slot B 可启动' },
        ]
      },
    ];

    let html = '';
    for (const cat of categories) {
      html += `<div class="fb-vars-category"><h3 class="fb-vars-cat-title">${cat.title}</h3><div class="info-grid">`;
      for (const v of cat.vars) {
        const raw = this.vars[v.key];
        if (raw === undefined) continue;
        const val = v.format ? v.format(raw) : raw;
        html += `<div class="info-item"><span class="info-label">${v.label}</span><span class="info-value">${ADSUtils.escapeHtml(String(val))}</span></div>`;
      }
      html += `</div></div>`;
    }
    grid.innerHTML = html;

    const allVars = document.getElementById('fb-all-vars');
    if (allVars) {
      allVars.textContent = Object.entries(this.vars).map(([k, v]) => `${k}: ${v}`).join('\n');
    }

    this._updateSummary();
    this._updateSlotDetails();
  }

  _updateSlotDetails() {
    const slotA = document.getElementById('fb-slot-a-info');
    const slotB = document.getElementById('fb-slot-b-info');
    const overview = document.getElementById('fb-slots-overview');

    const slotCount = parseInt(this.vars['slot-count'] || '0');
    if (slotCount < 2) {
      document.getElementById('fb-slots-content')?.classList.add('hidden');
      document.getElementById('fb-no-slots')?.classList.remove('hidden');
      return;
    }

    document.getElementById('fb-slots-content')?.classList.remove('hidden');
    document.getElementById('fb-no-slots')?.classList.add('hidden');

    const current = this.vars['current-slot'];
    if (overview) {
      overview.innerHTML = `
        <div class="fb-slot-indicator">
          <div class="fb-slot-dot ${current === 'a' ? 'active' : ''}">A</div>
          <div class="fb-slot-dot ${current === 'b' ? 'active' : ''}">B</div>
        </div>
        <p class="fb-slot-current">当前活跃槽位: <strong>${current?.toUpperCase() || '未知'}</strong></p>
      `;
    }

    const renderSlot = (el, slot) => {
      if (!el) return;
      const success = this.vars[`slot-successful:${slot}`];
      const unbootable = this.vars[`slot-unbootable:${slot}`];
      const isCurrent = current === slot;
      el.innerHTML = `
        <div class="fb-slot-row"><span>状态</span><span>${isCurrent ? '<span class="badge badge-success">当前</span>' : '<span class="badge">非活跃</span>'}</span></div>
        <div class="fb-slot-row"><span>启动成功</span><span>${success === 'yes' ? '✓ 是' : '✗ 否'}</span></div>
        <div class="fb-slot-row"><span>可启动</span><span>${unbootable === 'yes' ? '✗ 不可' : '✓ 可以'}</span></div>
      `;
    };
    renderSlot(slotA, 'a');
    renderSlot(slotB, 'b');
  }

  async connect() {
    try {
      ADSMain.updateConnectionState('connecting');
      ADSUtils.showLoading('正在连接 Fastboot 设备...');
      
      this.device = new FastbootDevice();
      await this.device.connect();
      
      ADSUtils.updateLoadingText('正在获取设备信息...');
      this.vars = await this.device.getAllVars();
      this._displayVars();
      
      document.getElementById('fb-not-connected')?.classList.add('hidden');
      document.getElementById('fb-connected')?.classList.remove('hidden');
      ADSMain.updateConnectionState('connected', { device: this.vars['product'] || 'Fastboot' });
      ADSMain.setFastbootDevice(this.device);
      ADSUtils.hideLoading();
      ADSUtils.toast('Fastboot 设备已连接: ' + (this.vars['product'] || ''), 'success');
      this._showCategory('info');
    } catch (e) {
      ADSUtils.hideLoading();
      ADSMain.updateConnectionState('error');
      
      let errorMsg = e.message;
      let hint = '';
      
      if (e.message.includes('Access denied') || e.message.includes('access denied')) {
        errorMsg = 'USB 设备访问被拒绝';
        hint = '请确保：\n1. 关闭命令行 fastboot 工具\n2. 关闭 Android Studio / SDK Platform Tools\n3. 关闭其他可能占用设备的程序';
      } else if (e.message.includes('not found') || e.message.includes('NotFoundError')) {
        errorMsg = '未找到 Fastboot 设备';
        hint = '请确保：\n1. 设备已进入 Fastboot 模式（关机后按 电源+音量下）\n2. USB 数据线已连接\n3. 设备屏幕显示 Fastboot 字样';
      } else if (e.message.includes('claimed') || e.message.includes('NetworkError')) {
        errorMsg = 'USB 接口被占用';
        hint = '请关闭其他 ADB/Fastboot 工具后重试';
      }
      
      if (hint) {
        ADSUtils.confirmDialog('连接失败', `${errorMsg}\n\n${hint}`, '我知道了');
      } else {
        ADSUtils.toast('连接失败: ' + errorMsg, 'error');
      }
    }
  }

  async disconnect() {
    if (this.device) {
      await this.device.disconnect().catch(() => {});
      this.device = null;
      ADSMain.setFastbootDevice(null);
    }
    ADSMain.updateConnectionState('disconnected');
    document.getElementById('fb-not-connected')?.classList.remove('hidden');
    document.getElementById('fb-connected')?.classList.add('hidden');
    ADSUtils.toast('已断开连接', 'info');
  }

  async rebootToBootloader() {
    const adbDevice = ADSMain.getAdbDevice();
    if (!adbDevice) return ADSUtils.toast('请先在 ADB 模式下连接设备', 'warning');
    const ok = await ADSUtils.confirmDialog('重启到 Bootloader', '确定要将设备重启到 Bootloader 模式吗？', '重启');
    if (!ok) return;
    try {
      await adbDevice.reboot('bootloader');
      ADSUtils.toast('设备正在重启，请稍后点击"连接 Fastboot 设备"', 'info', 5000);
    } catch (e) {
      ADSUtils.toast('重启失败: ' + e.message, 'error');
    }
  }

  async refreshVars() {
    if (!this.device) return;
    try {
      this.vars = await this.device.getAllVars();
      this._displayVars();
      ADSUtils.toast('设备信息已刷新', 'success');
    } catch (e) {
      ADSUtils.toast('刷新失败: ' + e.message, 'error');
    }
  }

  async unlock() {
    if (!this.device) return;
    const ok = await ADSUtils.confirmDialog(
      '⚠️ 解锁 Bootloader',
      '解锁将：\n• 清除所有数据（恢复出厂）\n• 可能使保修失效\n• 降低设备安全性\n\n确定继续？',
      '确认解锁'
    );
    if (!ok) return;
    try {
      let result = await this.device.flashingUnlock();
      if (result && !result.includes('FAIL')) {
        ADSUtils.toast('Bootloader 已解锁', 'success');
        this.vars['unlocked'] = 'yes';
        this._displayVars();
      } else {
        result = await this.device.oemUnlock();
        ADSUtils.toast('OEM Unlock: ' + result, result.includes('FAIL') ? 'error' : 'info');
      }
    } catch (e) {
      ADSUtils.toast('解锁失败: ' + e.message, 'error');
    }
  }

  async lock() {
    if (!this.device) return;
    const ok = await ADSUtils.confirmDialog('锁定 Bootloader', '锁定也会清除数据。确定继续？', '确认锁定');
    if (!ok) return;
    try {
      const result = await this.device.flashingLock();
      ADSUtils.toast('锁定结果: ' + result, result.includes('FAIL') ? 'error' : 'success');
      this.vars['unlocked'] = 'no';
      this._displayVars();
    } catch (e) {
      ADSUtils.toast('锁定失败: ' + e.message, 'error');
    }
  }

  async oemUnlock() {
    if (!this.device) return;
    const ok = await ADSUtils.confirmDialog('OEM 解锁', '发送 oem unlock 命令。确定？', '发送');
    if (!ok) return;
    try {
      const r = await this.device.oemUnlock();
      ADSUtils.toast('结果: ' + r, r.includes('FAIL') ? 'error' : 'success');
    } catch (e) {
      ADSUtils.toast('失败: ' + e.message, 'error');
    }
  }

  async oemLock() {
    if (!this.device) return;
    const ok = await ADSUtils.confirmDialog('OEM 锁定', '发送 oem lock 命令。确定？', '发送');
    if (!ok) return;
    try {
      const r = await this.device.oemLock();
      ADSUtils.toast('结果: ' + r, r.includes('FAIL') ? 'error' : 'success');
    } catch (e) {
      ADSUtils.toast('失败: ' + e.message, 'error');
    }
  }

  async selectFlashImage() {
    const file = await ADSUtils.pickFile('.img,.bin,.zip,.tar');
    if (!file) return;
    this._flashFile = file;
    document.getElementById('fb-selected-file').textContent = `${file.name} (${ADSUtils.formatBytes(file.size)})`;
  }

  async flashPartition() {
    if (!this.device) return ADSUtils.toast('设备未连接', 'warning');
    if (!this._flashFile) return ADSUtils.toast('请先选择镜像文件', 'warning');
    let partition = document.getElementById('fb-partition-select')?.value;
    if (partition === '__custom__') {
      partition = document.getElementById('fb-custom-partition')?.value?.trim();
      if (!partition) return ADSUtils.toast('请输入分区名', 'warning');
    }
    const ok = await ADSUtils.confirmDialog('刷入分区', `${this._flashFile.name} → ${partition}\n\n确定刷入？`, '刷入');
    if (!ok) return;
    await this._doFlash(partition, this._flashFile);
  }

  async _doFlash(partition, file) {
    const progressContainer = document.getElementById('fb-flash-progress');
    try {
      progressContainer.innerHTML = '';
      progressContainer.classList.remove('hidden');
      const bar = ADSUtils.createProgressBar();
      progressContainer.appendChild(bar);
      const data = await ADSUtils.readFileAsArrayBuffer(file);
      await this.device.flash(partition, new Uint8Array(data), (sent, total) => {
        bar.update((sent / total) * 100, `${ADSUtils.formatBytes(sent)} / ${ADSUtils.formatBytes(total)}`);
      });
      ADSUtils.toast(`${partition} 刷入成功`, 'success');
    } catch (e) {
      ADSUtils.toast(`${partition} 刷入失败: ${e.message}`, 'error');
    } finally {
      progressContainer.classList.add('hidden');
    }
  }

  async selectBatchFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.img,.bin,.zip';
    input.onchange = () => {
      this._batchFiles = Array.from(input.files);
      this._renderBatchList();
    };
    input.click();
  }

  _renderBatchList() {
    const list = document.getElementById('fb-batch-list');
    const goBtn = document.getElementById('btn-fb-batch-flash');
    if (!list) return;
    if (this._batchFiles.length === 0) {
      list.innerHTML = '';
      goBtn?.classList.add('hidden');
      return;
    }
    let html = '<div class="fb-batch-items">';
    for (const f of this._batchFiles) {
      const guessed = f.name.replace(/\.(img|bin|zip)$/i, '');
      html += `<div class="fb-batch-item"><span class="fb-batch-file">${ADSUtils.escapeHtml(f.name)}</span><span class="fb-batch-arrow">→</span><span class="fb-batch-partition">${ADSUtils.escapeHtml(guessed)}</span><span class="fb-batch-size">${ADSUtils.formatBytes(f.size)}</span></div>`;
    }
    html += '</div>';
    list.innerHTML = html;
    goBtn?.classList.remove('hidden');
  }

  async batchFlash() {
    if (!this.device || this._batchFiles.length === 0) return;
    const summary = this._batchFiles.map(f => {
      const p = f.name.replace(/\.(img|bin|zip)$/i, '');
      return `${f.name} → ${p}`;
    }).join('\n');
    const ok = await ADSUtils.confirmDialog('批量刷写', `将刷入 ${this._batchFiles.length} 个分区：\n\n${summary}\n\n确定？`, '开始刷写');
    if (!ok) return;

    const progressContainer = document.getElementById('fb-batch-progress');
    progressContainer.innerHTML = '';
    progressContainer.classList.remove('hidden');
    const bar = ADSUtils.createProgressBar();
    progressContainer.appendChild(bar);

    let done = 0;
    for (const f of this._batchFiles) {
      const partition = f.name.replace(/\.(img|bin|zip)$/i, '');
      try {
        bar.update((done / this._batchFiles.length) * 100, `[${done + 1}/${this._batchFiles.length}] ${partition}`);
        await this._doFlash(partition, f);
        done++;
      } catch (e) {
        ADSUtils.toast(`${partition} 失败，停止批量刷写`, 'error');
        break;
      }
    }
    progressContainer.classList.add('hidden');
    ADSUtils.toast(`批量刷写完成: ${done}/${this._batchFiles.length}`, done === this._batchFiles.length ? 'success' : 'warning');
  }

  async selectBootImage() {
    const file = await ADSUtils.pickFile('.img,.bin');
    if (!file) return;
    this._bootFile = file;
    document.getElementById('fb-boot-file').textContent = `${file.name} (${ADSUtils.formatBytes(file.size)})`;
  }

  async bootImage() {
    if (!this.device) return ADSUtils.toast('设备未连接', 'warning');
    if (!this._bootFile) return ADSUtils.toast('请先选择镜像', 'warning');
    const ok = await ADSUtils.confirmDialog('临时启动', `从 ${this._bootFile.name} 临时启动？\n重启后失效。`, '启动');
    if (!ok) return;
    try {
      const data = await ADSUtils.readFileAsArrayBuffer(this._bootFile);
      await this.device.boot(new Uint8Array(data));
      ADSUtils.toast('设备正在启动...', 'success');
    } catch (e) {
      ADSUtils.toast('启动失败: ' + e.message, 'error');
    }
  }

  async erasePartition() {
    if (!this.device) return ADSUtils.toast('设备未连接', 'warning');
    const partition = document.getElementById('fb-erase-partition')?.value;
    if (!partition) return;
    const ok = await ADSUtils.confirmDialog('⚠️ 擦除分区', `确定擦除 ${partition}？\n此操作不可恢复！`, '擦除');
    if (!ok) return;
    try {
      await this.device.erase(partition);
      ADSUtils.toast(`${partition} 已擦除`, 'success');
    } catch (e) {
      ADSUtils.toast('擦除失败: ' + e.message, 'error');
    }
  }

  async factoryReset() {
    if (!this.device) return ADSUtils.toast('设备未连接', 'warning');
    const ok = await ADSUtils.confirmDialog('⚠️ 恢复出厂设置', '将擦除 userdata 和 metadata。\n所有数据将丢失！', '确认恢复');
    if (!ok) return;
    try {
      await this.device.erase('userdata');
      await this.device.erase('metadata').catch(() => {});
      ADSUtils.toast('恢复出厂设置完成', 'success');
    } catch (e) {
      ADSUtils.toast('失败: ' + e.message, 'error');
    }
  }

  async formatData() {
    if (!this.device) return ADSUtils.toast('设备未连接', 'warning');
    const ok = await ADSUtils.confirmDialog('格式化 data', '格式化 userdata 分区并重建文件系统。', '格式化');
    if (!ok) return;
    try {
      await this.device.oem('format userdata');
      ADSUtils.toast('格式化完成', 'success');
    } catch (e) {
      ADSUtils.toast('失败: ' + e.message, 'error');
    }
  }

  async reboot(target) {
    if (!this.device) return;
    try {
      await this.device.reboot(target);
      ADSUtils.toast('设备正在重启...', 'info');
      this.disconnect();
    } catch (e) {
      ADSUtils.toast('重启失败: ' + e.message, 'error');
    }
  }

  async continueBoot() {
    if (!this.device) return;
    try {
      await this.device.continue();
      ADSUtils.toast('继续启动...', 'info');
      this.disconnect();
    } catch (e) {
      ADSUtils.toast('失败: ' + e.message, 'error');
    }
  }

  async powerOff() {
    if (!this.device) return;
    const ok = await ADSUtils.confirmDialog('关机', '确定关闭设备？', '关机');
    if (!ok) return;
    try {
      await this.device.oem('poweroff');
      ADSUtils.toast('设备正在关机...', 'info');
      this.disconnect();
    } catch (e) {
      try {
        await this.device.reboot('poweroff');
        this.disconnect();
      } catch (e2) {
        ADSUtils.toast('关机失败: ' + e.message, 'error');
      }
    }
  }

  async setActiveSlot(slot) {
    if (!this.device) return;
    const ok = await ADSUtils.confirmDialog('切换槽位', `切换到 Slot ${slot.toUpperCase()}？`, '切换');
    if (!ok) return;
    try {
      const r = await this.device.setActiveSlot(slot);
      ADSUtils.toast('结果: ' + r, r.includes('FAIL') ? 'error' : 'success');
      this.vars['current-slot'] = slot;
      this._displayVars();
    } catch (e) {
      ADSUtils.toast('切换失败: ' + e.message, 'error');
    }
  }

  async setActiveSlotAndReboot(slot) {
    if (!this.device) return;
    const ok = await ADSUtils.confirmDialog('切换并重启', `切换到 Slot ${slot.toUpperCase()} 并重启？`, '切换并重启');
    if (!ok) return;
    try {
      await this.device.setActiveSlot(slot);
      await this.device.reboot('');
      ADSUtils.toast(`已切到 Slot ${slot.toUpperCase()}，正在重启...`, 'success');
      this.disconnect();
    } catch (e) {
      ADSUtils.toast('失败: ' + e.message, 'error');
    }
  }

  async sendRawCommand() {
    if (!this.device) return ADSUtils.toast('设备未连接', 'warning');
    const input = document.getElementById('fb-cmd-input');
    const output = document.getElementById('fb-terminal-output');
    if (!input || !output) return;
    const cmd = input.value.trim();
    if (!cmd) return;

    this._cmdHistory.push(cmd);
    this._cmdHistoryIdx = this._cmdHistory.length;
    input.value = '';

    const cmdLine = document.createElement('div');
    cmdLine.className = 'fb-term-line fb-term-cmd';
    cmdLine.textContent = `> ${cmd}`;
    output.appendChild(cmdLine);

    try {
      let result;
      if (cmd.startsWith('getvar ')) {
        result = await this.device.getvar(cmd.substring(7));
      } else if (cmd.startsWith('oem ')) {
        result = await this.device.oem(cmd.substring(4));
      } else if (cmd === 'continue') {
        result = await this.device.continue();
      } else {
        result = await this.device._sendCommand(cmd);
      }
      const resultLine = document.createElement('div');
      resultLine.className = 'fb-term-line fb-term-result';
      resultLine.textContent = result || '(OK)';
      output.appendChild(resultLine);
    } catch (e) {
      const errLine = document.createElement('div');
      errLine.className = 'fb-term-line fb-term-error';
      errLine.textContent = 'Error: ' + e.message;
      output.appendChild(errLine);
    }
    output.scrollTop = output.scrollHeight;
  }

  _cmdHistoryUp() {
    if (this._cmdHistoryIdx > 0) {
      this._cmdHistoryIdx--;
      document.getElementById('fb-cmd-input').value = this._cmdHistory[this._cmdHistoryIdx];
    }
  }

  _cmdHistoryDown() {
    if (this._cmdHistoryIdx < this._cmdHistory.length - 1) {
      this._cmdHistoryIdx++;
      document.getElementById('fb-cmd-input').value = this._cmdHistory[this._cmdHistoryIdx];
    } else {
      this._cmdHistoryIdx = this._cmdHistory.length;
      document.getElementById('fb-cmd-input').value = '';
    }
  }

  async getvarQuery() {
    if (!this.device) return ADSUtils.toast('设备未连接', 'warning');
    const key = document.getElementById('fb-getvar-key')?.value?.trim();
    if (!key) return ADSUtils.toast('请输入变量名', 'warning');
    try {
      const val = await this.device.getvar(key);
      const resultEl = document.getElementById('fb-getvar-result');
      resultEl.textContent = `${key} = ${val}`;
      resultEl.classList.remove('hidden');
    } catch (e) {
      ADSUtils.toast('查询失败: ' + e.message, 'error');
    }
  }

  async oemCommand() {
    if (!this.device) return ADSUtils.toast('设备未连接', 'warning');
    const cmd = document.getElementById('fb-oem-cmd')?.value?.trim();
    if (!cmd) return ADSUtils.toast('请输入命令', 'warning');
    try {
      const r = await this.device.oem(cmd);
      ADSUtils.toast('结果: ' + r, 'info');
    } catch (e) {
      ADSUtils.toast('失败: ' + e.message, 'error');
    }
  }
}
