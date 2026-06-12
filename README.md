# Android Debug Suite Web

在浏览器中直接管理 Android 设备，无需安装 ADB/Fastboot 命令行工具。

![screenshot](static/481d0b9400de9cfdb7d058379ef0583b1060544882.jpg)

## 功能特性

### ADB 模式
- **设备概览** — 查看设备基本信息、存储状态、电池信息
- **文件管理** — 浏览、上传、下载、删除设备文件
- **应用管理** — 安装、卸载、查看已安装应用
- **Shell 终端** — 交互式 Shell 命令行
- **Logcat 日志** — 实时查看、过滤、导出设备日志
- **ADB Sideload** — 通过 ADB 侧载 OTA 包

### Fastboot 模式
- **设备信息** — 查看 Fastboot 模式下的设备信息
- **安全管理** — 解锁/锁定 Bootloader
- **分区刷写** — 刷写 system、boot、recovery 等分区
- **临时启动** — 临时引导 boot/recovery 镜像
- **分区管理** — 查看分区列表、格式化分区
- **槽位管理** — 管理 A/B 分区槽位
- **重启控制** — 重启到系统、Recovery、Fastboot 等模式
- **高级命令** — 自定义 Fastboot 命令

### Scrcpy 投屏
- **实时投屏** — 在浏览器中实时显示设备屏幕
- **远程控制** — 通过鼠标和键盘控制设备

## 技术栈

- 纯前端实现，无需后端服务器
- 使用 [WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB) 直接与设备通信
- 原生 JavaScript，无框架依赖
- 支持 Chrome / Edge 89+

## 使用方法

1. 在 Android 设备上启用 **USB 调试**（设置 → 开发者选项 → USB 调试）
2. 用 USB 数据线连接设备到电脑
3. 用 Chrome / Edge 打开 `index.html`
4. 点击页面右上角的 **连接** 按钮
5. 在浏览器弹出的设备选择框中选择你的 Android 设备
6. 在设备上确认允许 USB 调试

> **注意：** 必须使用 Chrome 89+ 或 Edge 89+，其他浏览器不支持 WebUSB API。

## 本地运行

直接打开 `index.html` 即可，也可以使用任意 HTTP 服务器：

```bash
# 使用 npx serve
npx serve .

# 使用 Python
python -m http.server

# 使用 Node.js
npx http-server
```

## 项目结构

```
├── index.html              # 入口页面
├── css/
│   └── style.css           # 样式文件
├── js/
│   ├── main.js             # 主控制器（模块加载、UI 逻辑）
│   ├── utils.js            # 工具函数（Toast、Loading、文件操作）
│   ├── adb-module.js       # ADB 功能模块
│   ├── fastboot-module.js  # Fastboot 功能模块
│   ├── scrcpy-module.js    # Scrcpy 投屏模块
│   └── lib/
│       ├── adb.js          # ADB 协议实现
│       ├── fastboot.js     # Fastboot 协议实现
│       └── scrcpy.js       # Scrcpy 协议实现
└── static/                 # 静态资源
```

## 工作原理

项目通过 WebUSB API 直接在浏览器中与 Android 设备建立 USB 通信，实现了 ADB 和 Fastboot 协议的纯 JavaScript 版本。ADB 认证密钥在浏览器本地生成并存储在 localStorage 中。

## 浏览器兼容性

| 浏览器 | 版本要求 | 支持状态 |
|--------|---------|---------|
| Chrome | 89+ | ✅ 完全支持 |
| Edge | 89+ | ✅ 完全支持 |
| Firefox | — | ❌ 不支持 WebUSB |
| Safari | — | ❌ 不支持 WebUSB |

## 许可证

MIT
