/**
 * Scrcpy Client Library - Single-file browser implementation
 * Handles video decoding, display rendering, and touch/input forwarding
 * Uses H.264 Annex B parsing with browser MediaSource or Canvas rendering
 */
(function (root) {
  'use strict';

  const SCRCPY_VERSION = 'v2.7';
  const DEVICE_NAME_FIELD_LENGTH = 64;
  const PACKET_TYPE_VIDEO = 0;
  const PACKET_TYPE_AUDIO = 1;

  const TOUCH_ACTION_DOWN = 0;
  const TOUCH_ACTION_UP = 1;
  const TOUCH_ACTION_MOVE = 2;

  const KEYCODE_HOME = 3;
  const KEYCODE_BACK = 4;
  const KEYCODE_POWER = 26;
  const KEYCODE_VOLUME_UP = 24;
  const KEYCODE_VOLUME_DOWN = 25;
  const KEYCODE_APP_SWITCH = 187;

  class ScrcpyClient {
    constructor(adbDevice) {
      this.adb = adbDevice;
      this.deviceName = '';
      this.width = 0;
      this.height = 0;
      this.running = false;
      this.canvas = null;
      this.ctx = null;
      this.decoder = null;
      this.videoStream = null;
      this.controlStream = null;
      this.onFrame = null;
      this.onError = null;
      this.onSizeChange = null;
      this._serverProcess = null;
      this._videoSocket = null;
      const w = window;

      this.options = {
        maxSize: 1280,
        maxFps: 30,
        bitRate: 8000000,
        lockVideoOrientation: -1,
        crop: '',
        controlEnabled: true,
        displayId: 0,
        showTouches: false,
        stayAwake: false,
        powerOffOnClose: false,
        clipboardAutosync: true,
        downsizeOnError: true,
      };
    }

    async start(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      Object.assign(this.options, options);

      try {
        await this._pushServer();
        await this._startServer();
        await this._connectServer();
        this.running = true;
      } catch (e) {
        if (this.onError) this.onError(e);
        throw e;
      }
    }

    async stop() {
      this.running = false;
      try {
        if (this._videoSocket) await this._videoSocket.close().catch(() => {});
        if (this.controlStream) await this.controlStream.close().catch(() => {});
      } catch (e) { /* ignore */ }

      try {
        await this.adb.shellCommand('pkill -f scrcpy-server').catch(() => {});
      } catch (e) { /* ignore */ }
    }

    async sendTouch(action, x, y, pointerId = 0) {
      if (!this.controlStream || !this.options.controlEnabled) return;

      const msg = new ArrayBuffer(28);
      const dv = new DataView(msg);
      dv.setUint8(0, 2);
      dv.setUint8(1, action);
      dv.setBigUint64(2, BigInt(pointerId), false);
      dv.setInt32(10, Math.round(x), false);
      dv.setInt32(14, Math.round(y), false);
      dv.setUint16(18, Math.round(this.width), false);
      dv.setUint16(20, Math.round(this.height), false);
      dv.setUint16(22, 0xffff, false);
      dv.setUint32(24, 1, false);

      try {
        const writer = this.controlStream.writable.getWriter();
        await writer.write(new Uint8Array(msg));
        writer.releaseLock();
      } catch (e) {
        if (this.onError) this.onError(e);
      }
    }

    async sendKeycode(keycode, action = TOUCH_ACTION_DOWN) {
      if (!this.controlStream) return;
      const msg = new ArrayBuffer(14);
      const dv = new DataView(msg);
      dv.setUint8(0, 0);
      dv.setUint8(1, action);
      dv.setInt32(2, keycode, false);
      dv.setUint16(6, 0, false);
      dv.setBigUint64(8, BigInt(0), false);

      try {
        const writer = this.controlStream.writable.getWriter();
        await writer.write(new Uint8Array(msg));
        writer.releaseLock();
      } catch (e) {
        if (this.onError) this.onError(e);
      }
    }

    async sendText(text) {
      if (!this.controlStream) return;
      const textBytes = new TextEncoder().encode(text);
      const msg = new ArrayBuffer(12 + textBytes.length);
      const dv = new DataView(msg);
      dv.setUint8(0, 1);
      dv.setUint16(1, textBytes.length, false);
      new Uint8Array(msg).set(textBytes, 12);

      try {
        const writer = this.controlStream.writable.getWriter();
        await writer.write(new Uint8Array(msg));
        writer.releaseLock();
      } catch (e) {
        if (this.onError) this.onError(e);
      }
    }

    async sendScroll(x, y, hScroll, vScroll) {
      if (!this.controlStream) return;
      const msg = new ArrayBuffer(20);
      const dv = new DataView(msg);
      dv.setUint8(0, 3);
      dv.setInt32(1, Math.round(x), false);
      dv.setInt32(5, Math.round(y), false);
      dv.setInt16(9, Math.round(this.width), false);
      dv.setInt16(11, Math.round(this.height), false);
      dv.setInt16(13, Math.round(hScroll), false);
      dv.setInt16(15, Math.round(vScroll), false);
      dv.setBigUint64(17, BigInt(1), false);

      try {
        const writer = this.controlStream.writable.getWriter();
        await writer.write(new Uint8Array(msg));
        writer.releaseLock();
      } catch (e) {
        if (this.onError) this.onError(e);
      }
    }

    async pressHome() { await this.sendKeycode(KEYCODE_HOME); }
    async pressBack() { await this.sendKeycode(KEYCODE_BACK); }
    async pressPower() { await this.sendKeycode(KEYCODE_POWER); }
    async pressAppSwitch() { await this.sendKeycode(KEYCODE_APP_SWITCH); }
    async volumeUp() { await this.sendKeycode(KEYCODE_VOLUME_UP); }
    async volumeDown() { await this.sendKeycode(KEYCODE_VOLUME_DOWN); }

    takeScreenshot() {
      if (!this.canvas) return null;
      return this.canvas.toDataURL('image/png');
    }

    async _pushServer() {
      const serverUrl = 'https://github.com/Genymobile/scrcpy/releases/download/' + SCRCPY_VERSION + '/scrcpy-server';
      this._serverPath = '/data/local/tmp/scrcpy-server.jar';

      try {
        await this.adb.shellCommand('ls ' + this._serverPath);
      } catch (e) {
        throw new Error('请先通过 ADB 推送 scrcpy-server.jar 到设备: adb push scrcpy-server.jar ' + this._serverPath);
      }
    }

    async _startServer() {
      const cmd = [
        'CLASSPATH=' + this._serverPath,
        'app_process',
        '/',
        'com.genymobile.scrcpy.Server',
        SCRCPY_VERSION,
        'log_level=info',
        'max_size=' + this.options.maxSize,
        'max_fps=' + this.options.maxFps,
        'video_bit_rate=' + this.options.bitRate,
        'video_encoder=c2.android.avc.encoder',
        'send_frame_meta=false',
        'control=' + (this.options.controlEnabled ? 'true' : 'false'),
        'audio=false',
        'video_source=display',
        'display_id=' + this.options.displayId,
        'show_touches=' + (this.options.showTouches ? 'true' : 'false'),
        'stay_awake=' + (this.options.stayAwake ? 'true' : 'false'),
        'power_off_on_close=' + (this.options.powerOffOnClose ? 'true' : 'false'),
        'clipboard_autosync=' + (this.options.clipboardAutosync ? 'true' : 'false'),
        'downsize_on_error=' + (this.options.downsizeOnError ? 'true' : 'false'),
      ].join(' ');

      this._serverProcess = this.adb.shellCommand(cmd).catch(e => {
        if (this.running && this.onError) this.onError(new Error('Scrcpy server exited: ' + e.message));
      });
    }

    async _connectServer() {
      await ADSUtils.sleep(1000);

      const videoPort = await this.adb.open('localabstract:scrcpy');
      this._videoSocket = videoPort;

      const nameBuffer = await this._readFromStream(videoPort, DEVICE_NAME_FIELD_LENGTH);
      this.deviceName = new TextDecoder().decode(nameBuffer).replace(/\0/g, '');

      const sizeBuffer = await this._readFromStream(videoPort, 4);
      const sizeView = new DataView(sizeBuffer);
      this.width = sizeView.getUint16(0, false);
      this.height = sizeView.getUint16(2, false);

      if (this.canvas) {
        this.canvas.width = this.width;
        this.canvas.height = this.height;
      }
      if (this.onSizeChange) this.onSizeChange(this.width, this.height);

      this._startVideoDecoding(videoPort);

      if (this.options.controlEnabled) {
        try {
          const controlPort = await this.adb.open('localabstract:scrcpy');
          this.controlStream = controlPort;
        } catch (e) {
          this.options.controlEnabled = false;
        }
      }
    }

    async _startVideoDecoding(stream) {
      const nalUnits = [];
      let buffer = new Uint8Array(0);

      try {
        while (this.running) {
          const chunk = await this._readChunk(stream);
          if (!chunk) break;

          const newBuffer = new Uint8Array(buffer.length + chunk.length);
          newBuffer.set(buffer);
          newBuffer.set(chunk, buffer.length);
          buffer = newBuffer;

          const frames = this._parseH264Frames(buffer);
          for (const frame of frames.frames) {
            this._renderFrame(frame);
          }
          buffer = frames.remainder;
        }
      } catch (e) {
        if (this.running && this.onError) this.onError(e);
      }
    }

    _parseH264Frames(buffer) {
      const frames = [];
      const startCode3 = new Uint8Array([0, 0, 1]);
      const startCode4 = new Uint8Array([0, 0, 0, 1]);
      let i = 0;
      let lastFrameEnd = 0;

      while (i < buffer.length - 3) {
        if (buffer[i] === 0 && buffer[i + 1] === 0) {
          let scLen = 0;
          if (i + 3 < buffer.length && buffer[i + 2] === 0 && buffer[i + 3] === 1) scLen = 4;
          else if (buffer[i + 2] === 1) scLen = 3;

          if (scLen > 0 && i > lastFrameEnd && i - lastFrameEnd > 4) {
            frames.push(buffer.slice(lastFrameEnd, i));
            lastFrameEnd = i;
          }
          if (scLen > 0) i += scLen;
          else i++;
        } else {
          i++;
        }
      }

      return { frames, remainder: buffer.slice(lastFrameEnd) };
    }

    _renderFrame(data) {
      if (!this.canvas || !this.ctx) return;

      const blob = new Blob([data], { type: 'video/h264' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        URL.revokeObjectURL(url);
        if (this.onFrame) this.onFrame();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }

    async _readFromStream(stream, length) {
      const reader = stream.readable ? stream.readable.getReader() : null;
      if (!reader) throw new Error('No readable stream');

      const chunks = [];
      let received = 0;
      try {
        while (received < length) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
        }
      } finally {
        reader.releaseLock();
      }

      const result = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result.buffer;
    }

    async _readChunk(stream) {
      try {
        const reader = stream.readable ? stream.readable.getReader() : null;
        if (!reader) return null;
        try {
          const { value, done } = await reader.read();
          if (done) return null;
          return value;
        } finally {
          reader.releaseLock();
        }
      } catch (e) {
        return null;
      }
    }
  }

  class ScrcpyServer {
    static async isInstalled(adbDevice) {
      try {
        const result = await adbDevice.shellCommand('ls /data/local/tmp/scrcpy-server.jar');
        return result.includes('scrcpy-server');
      } catch (e) {
        return false;
      }
    }

    static async getVersion(adbDevice) {
      try {
        const result = await adbDevice.shellCommand('cat /data/local/tmp/scrcpy-server.version');
        return result.trim();
      } catch (e) {
        return null;
      }
    }
  }

  root.ScrcpyClient = ScrcpyClient;
  root.ScrcpyServer = ScrcpyServer;
})(window);
