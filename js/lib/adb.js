/**
 * ADB Library - Single-file browser implementation
 * Based on ADB protocol over Web Serial API
 * Implements: connection, shell, file sync, install, sideload
 */
(function (root) {
  'use strict';

  const ADB_KEY_SIZE = 2048;
  const ADB_AUTH_TOKEN = 1;
  const ADB_AUTH_SIGNATURE = 2;
  const ADB_AUTH_RSAPUBLICKEY = 3;

  const CMD_CNXN = 0x4e584e43;
  const CMD_OPEN = 0x4e45504f;
  const CMD_OKAY = 0x59414b4f;
  const CMD_CLSE = 0x45534c43;
  const CMD_WRTE = 0x45545257;
  const CMD_AUTH = 0x48545541;
  const CMD_STLS = 0x534c5453;

  const SYNC_SEND = 0x444e4553;
  const SYNC_RECV = 0x56434552;
  const SYNC_DATA = 0x41544144;
  const SYNC_DONE = 0x454e4f44;
  const SYNC_OKAY = 0x59414b4f;
  const SYNC_FAIL = 0x4c494146;
  const SYNC_LIST = 0x5453494c;
  const SYNC_STAT = 0x54415453;
  const SYNC_DELE = 0x454c4544;
  const SYNC_QUIT = 0x54495551;

  const PROTOCOL_VERSION = 0x01000000;
  const MAX_PAYLOAD = 1024 * 1024;

  class AdbMessage {
    constructor(command, arg0, arg1, payload) {
      this.command = command;
      this.arg0 = arg0 || 0;
      this.arg1 = arg1 || 0;
      this.payload = payload || new ArrayBuffer(0);
    }
  }

  class AdbUsbTransport {
    constructor(usbDevice) {
      this.usbDevice = usbDevice;
      this.ifaceNumber = null;
      this.epIn = null;
      this.epOut = null;
      this._readBuffer = new Uint8Array(0);
      this._closed = false;
      this._disconnectHandler = null;
    }

    async connect() {
      await this.usbDevice.open();

      if (!this.usbDevice.configuration) {
        await this.usbDevice.selectConfiguration(1);
      }

      const configs = this.usbDevice.configurations || [this.usbDevice.configuration];
      
      let adbIface = null;
      let adbAlt = null;

      for (const config of configs) {
        if (!config) continue;
        for (const iface of config.interfaces) {
          for (const alt of iface.alternates) {
            if (alt.interfaceClass === 0xFF &&
                alt.interfaceSubclass === 0x42 &&
                alt.interfaceProtocol === 0x01) {
              adbIface = iface;
              adbAlt = alt;
              break;
            }
          }
          if (adbIface) break;
        }
        if (adbIface) break;
      }

      if (!adbIface || !adbAlt) {
        await this.usbDevice.close();
        throw new Error('未找到 ADB 接口 (0xFF/0x42/0x01)。请确保设备已启用 USB 调试。');
      }

      this.ifaceNumber = adbIface.interfaceNumber;
      this.epIn = adbAlt.endpoints.find(e => e.direction === 'in' && e.type === 'bulk');
      this.epOut = adbAlt.endpoints.find(e => e.direction === 'out' && e.type === 'bulk');

      if (!this.epIn || !this.epOut) {
        await this.usbDevice.close();
        throw new Error('未找到 ADB USB 批量传输端点');
      }
      
      if (adbAlt.alternateSetting !== 0) {
        await this.usbDevice.selectAlternateInterface(this.ifaceNumber, adbAlt.alternateSetting);
      }

      await this.usbDevice.claimInterface(this.ifaceNumber);
      
      this._disconnectHandler = (e) => {
        if (e.device === this.usbDevice) {
          this._closed = true;
        }
      };
      navigator.usb.addEventListener('disconnect', this._disconnectHandler);

      await new Promise(r => setTimeout(r, 50));
    }

    async disconnect() {
      this._closed = true;
      
      // Remove disconnect event listener
      if (this._disconnectHandler) {
        navigator.usb.removeEventListener('disconnect', this._disconnectHandler);
        this._disconnectHandler = null;
      }
      
      try {
        if (this.ifaceNumber !== null) {
          await this.usbDevice.releaseInterface(this.ifaceNumber);
        }
        await this.usbDevice.close();
      } catch (e) { /* ignore */ }
    }

    async _fillBuffer(minBytes) {
      const MAX_RETRIES = 3;
      const RETRY_DELAY = 200;
      
      while (this._readBuffer.length < minBytes) {
        if (this._closed || !this.usbDevice.opened) {
          throw new Error('设备未连接');
        }
        
        const readSize = Math.max(this.epIn.packetSize || 512, minBytes - this._readBuffer.length);
        
        let result;
        let lastErr;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            result = await this.usbDevice.transferIn(this.epIn.endpointNumber, readSize);
            break;
          } catch (e) {
            lastErr = e;
            if (e.name === 'NetworkError' || (e.message && e.message.includes('device was disconnected'))) {
              this._closed = true;
              throw new Error('设备已断开连接');
            }
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)));
              continue;
            }
            throw e;
          }
        }
        if (!result) {
          throw new Error('USB 读取失败，已重试 ' + MAX_RETRIES + ' 次: ' + (lastErr ? lastErr.message : '未知错误'));
        }
        if (result.status !== 'ok') {
          throw new Error('USB 读取失败: ' + result.status);
        }
        const chunk = new Uint8Array(result.data.buffer);
        
        const newBuf = new Uint8Array(this._readBuffer.length + chunk.length);
        newBuf.set(this._readBuffer);
        newBuf.set(chunk, this._readBuffer.length);
        this._readBuffer = newBuf;
      }
    }

    async readExact(length) {
      await this._fillBuffer(length);
      const result = this._readBuffer.slice(0, length);
      this._readBuffer = this._readBuffer.slice(length);
      return result.buffer;
    }

    async readMessage() {
      const hex = (n) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
      
      const header = await this.readExact(24);
      const hv = new DataView(header);
      const cmd = hv.getUint32(0, true);
      const arg0 = hv.getUint32(4, true);
      const arg1 = hv.getUint32(8, true);
      const len = hv.getUint32(12, true);
      const checksum = hv.getUint32(16, true);
      const magic = hv.getUint32(20, true);
      
      const expectedMagic = (cmd ^ 0xFFFFFFFF) >>> 0;
      if (magic !== expectedMagic) {
        console.warn(`[ADB] readMessage: magic mismatch, expected ${hex(expectedMagic)}, got ${hex(magic)}`);
      }
      
      let payload = new ArrayBuffer(0);
      if (len > 0) {
        payload = await this.readExact(len);
      }
      
      return new AdbMessage(cmd, arg0, arg1, payload);
    }

    async sendMessage(msg) {
      if (this._closed || !this.usbDevice.opened) {
        throw new Error('设备未连接');
      }
      
      const payloadLen = msg.payload.byteLength;
      const buffer = new ArrayBuffer(24 + payloadLen);
      const dv = new DataView(buffer);
      dv.setUint32(0, msg.command, true);
      dv.setUint32(4, msg.arg0, true);
      dv.setUint32(8, msg.arg1, true);
      dv.setUint32(12, payloadLen, true);
      let checksum = 0;
      if (payloadLen > 0) {
        const pv = new Uint8Array(msg.payload);
        for (let i = 0; i < payloadLen; i++) checksum += pv[i];
      }
      dv.setUint32(16, checksum, true);
      dv.setUint32(20, (msg.command ^ 0xffffffff) >>> 0);
      if (payloadLen > 0) {
        new Uint8Array(buffer).set(new Uint8Array(msg.payload), 24);
      }

      const data = new Uint8Array(buffer);
      
      const chunkSize = 16384;
      const MAX_RETRIES = 5;
      const RETRY_DELAY = 100;
      let offset = 0;
      while (offset < data.length) {
        const end = Math.min(offset + chunkSize, data.length);
        const chunk = data.slice(offset, end);
        
        let result;
        let lastErr;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            result = await this.usbDevice.transferOut(this.epOut.endpointNumber, chunk);
            break;
          } catch (e) {
            lastErr = e;
            if (e.name === 'NetworkError' || (e.message && e.message.includes('device was disconnected'))) {
              this._closed = true;
              throw new Error('设备已断开连接');
            }
            if (e.message && e.message.includes('transfer error')) {
              await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)));
              continue;
            }
            throw e;
          }
        }
        if (!result) {
          throw new Error('USB 写入失败，已重试 ' + MAX_RETRIES + ' 次: ' + (lastErr ? lastErr.message : '未知错误'));
        }
        if (result.status !== 'ok') {
          throw new Error('USB 写入失败: ' + result.status);
        }
        offset = end;
      }
      
      const packetSize = this.epOut.packetSize || 512;
      if (packetSize > 1 && data.length > 0 && (data.length & (packetSize - 1)) === 0) {
        await this.usbDevice.transferOut(this.epOut.endpointNumber, new Uint8Array(0));
      }
    }
  }

  class AdbDevice {
    constructor(transport) {
      this.transport = transport;
      this.localId = 0;
      this.streams = new Map();
      this.connected = false;
      this.deviceInfo = {};
    }

    async connect(authCallback) {
      const identity = 'host::\x00';
      const payload = new TextEncoder().encode(identity);
      
      const msg = new AdbMessage(CMD_CNXN, PROTOCOL_VERSION, MAX_PAYLOAD, payload.buffer);
      await this.transport.sendMessage(msg);

      let rsaKey = await this._getOrCreateKey();
      let sentPublicKey = false;
      let signatureSent = false;
      let callbackShown = false;

      const startTime = Date.now();
      const AUTH_TIMEOUT = 60000;

      while (Date.now() - startTime < AUTH_TIMEOUT) {
        const msg = await this.transport.readMessage();

        if (msg.command === CMD_CNXN) {
          this.connected = true;
          this.deviceInfo = this._parseConnectPayload(msg.payload);
          return this.deviceInfo;
        }

        if (msg.command === CMD_STLS) {
          throw new Error('设备要求 TLS 连接，当前浏览器不支持。请尝试使用普通 ADB 连接。');
        }

        if (msg.command === CMD_AUTH && msg.arg0 === ADB_AUTH_TOKEN) {
          if (!sentPublicKey && !signatureSent) {
            try {
              const sig = await this._sign(rsaKey, new Uint8Array(msg.payload));
              await this.transport.sendMessage(new AdbMessage(CMD_AUTH, ADB_AUTH_SIGNATURE, 0, sig.buffer));
              signatureSent = true;
              continue;
            } catch (e) {
              sentPublicKey = true;
            }
          } else if (!sentPublicKey && signatureSent) {
            sentPublicKey = true;
          }

          if (sentPublicKey) {
            const encoded = await this._exportPublicKey(rsaKey);
            
            if (authCallback && !callbackShown) {
              callbackShown = true;
              authCallback(encoded);
            }
            await this.transport.sendMessage(new AdbMessage(CMD_AUTH, ADB_AUTH_RSAPUBLICKEY, 0, encoded.buffer));
          }
        } else if (msg.command === CMD_WRTE) {
          await this.transport.sendMessage(new AdbMessage(CMD_CLSE, msg.arg0, msg.arg1, new ArrayBuffer(0)));
        }
      }
      
      throw new Error('认证超时：请在设备上确认 USB 调试授权');
    }

    async open(destination) {
      const localId = ++this.localId;
      const destBytes = new TextEncoder().encode(destination + '\0');
      
      await this.transport.sendMessage(new AdbMessage(CMD_OPEN, localId, 0, destBytes.buffer));
      const msg = await this.transport.readMessage();
      
      if (msg.command !== CMD_OKAY) {
        const hex = (n) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
        throw new Error(`Open failed: expected OKAY, got ${hex(msg.command)}`);
      }
      
      const remoteId = msg.arg0;
      this.streams.set(localId, { remoteId, buffer: [] });
      return { localId, remoteId };
    }

    async shellCommand(command) {
      const stream = await this.open('shell:' + command);
      let output = '';
      try {
        while (true) {
          const msg = await this.transport.readMessage();
          if (msg.command === CMD_WRTE && msg.arg0 === stream.remoteId) {
            output += new TextDecoder().decode(msg.payload);
            await this.transport.sendMessage(new AdbMessage(CMD_OKAY, stream.localId, stream.remoteId, new ArrayBuffer(0)));
          } else if (msg.command === CMD_CLSE && msg.arg0 === stream.remoteId) {
            await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0)));
            break;
          } else if (msg.command === CMD_OKAY && msg.arg0 === stream.remoteId) {
            continue;
          }
        }
      } finally {
        this.streams.delete(stream.localId);
      }
      return output;
    }

    async *shellStream(command) {
      const stream = await this.open('shell:' + command);
      try {
        while (true) {
          const msg = await this.transport.readMessage();
          if (msg.command === CMD_WRTE && msg.arg0 === stream.remoteId) {
            const text = new TextDecoder().decode(msg.payload);
            await this.transport.sendMessage(new AdbMessage(CMD_OKAY, stream.localId, stream.remoteId, new ArrayBuffer(0)));
            yield text;
          } else if (msg.command === CMD_CLSE && msg.arg0 === stream.remoteId) {
            await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0)));
            break;
          }
        }
      } finally {
        this.streams.delete(stream.localId);
      }
    }

    async syncOpen(path, mode = 'STAT') {
      const stream = await this.open('sync:');
      return { stream, path };
    }

    async stat(path) {
      const stream = await this.open('sync:');
      try {
        const pathBytes = new TextEncoder().encode(path);
        const statMsg = new ArrayBuffer(8 + pathBytes.length);
        const dv = new DataView(statMsg);
        dv.setUint32(0, SYNC_STAT, true);
        dv.setUint32(4, pathBytes.length, true);
        new Uint8Array(statMsg).set(pathBytes, 8);
        await this.transport.sendMessage(new AdbMessage(CMD_WRTE, stream.localId, stream.remoteId, statMsg));
        await this.transport.readMessage();
        const rmsg = await this.transport.readMessage();
        if (rmsg.command !== CMD_WRTE) throw new Error('STAT failed');
        const rv = new DataView(rmsg.payload);
        const mode = rv.getUint32(0, true);
        const size = rv.getUint32(4, true);
        const time = rv.getUint32(8, true);
        await this.transport.sendMessage(new AdbMessage(CMD_OKAY, stream.localId, stream.remoteId, new ArrayBuffer(0)));
        await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0)));
        return { mode, size, time };
      } catch (e) {
        await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0)));
        throw e;
      }
    }

    async listDir(path) {
      const stream = await this.open('sync:');
      try {
        const pathBytes = new TextEncoder().encode(path);
        const listMsg = new ArrayBuffer(8 + pathBytes.length);
        const dv = new DataView(listMsg);
        dv.setUint32(0, SYNC_LIST, true);
        dv.setUint32(4, pathBytes.length, true);
        new Uint8Array(listMsg).set(pathBytes, 8);
        await this.transport.sendMessage(new AdbMessage(CMD_WRTE, stream.localId, stream.remoteId, listMsg));

        const entries = [];
        while (true) {
          await this.transport.sendMessage(new AdbMessage(CMD_OKAY, stream.localId, stream.remoteId, new ArrayBuffer(0)));
          const rmsg = await this.transport.readMessage();
          if (rmsg.command === CMD_CLSE) break;
          if (rmsg.command !== CMD_WRTE) continue;
          const payload = new Uint8Array(rmsg.payload);
          const rv = new DataView(rmsg.payload);
          const type = rv.getUint32(0, true);
          if (type === SYNC_DONE) break;
          const entryLen = rv.getUint32(4, true);
          const mode = rv.getUint32(8, true);
          const size = rv.getUint32(12, true);
          const time = rv.getUint32(16, true);
          const nameLen = rv.getUint32(20, true);
          const name = new TextDecoder().decode(payload.subarray(24, 24 + nameLen));
          entries.push({ name, mode, size, time, isDir: (mode & 0x4000) !== 0 });
        }
        await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0)));
        return entries;
      } catch (e) {
        try { await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0))); } catch (_) {}
        throw e;
      }
    }

    async pull(remotePath, onProgress) {
      const stream = await this.open('sync:');
      try {
        const pathBytes = new TextEncoder().encode(remotePath);
        const recvMsg = new ArrayBuffer(8 + pathBytes.length);
        const dv = new DataView(recvMsg);
        dv.setUint32(0, SYNC_RECV, true);
        dv.setUint32(4, pathBytes.length, true);
        new Uint8Array(recvMsg).set(pathBytes, 8);
        await this.transport.sendMessage(new AdbMessage(CMD_WRTE, stream.localId, stream.remoteId, recvMsg));

        const chunks = [];
        let totalSize = 0;
        while (true) {
          await this.transport.sendMessage(new AdbMessage(CMD_OKAY, stream.localId, stream.remoteId, new ArrayBuffer(0)));
          const rmsg = await this.transport.readMessage();
          if (rmsg.command === CMD_CLSE) break;
          if (rmsg.command !== CMD_WRTE) continue;
          const rv = new DataView(rmsg.payload);
          const type = rv.getUint32(0, true);
          if (type === SYNC_DONE) break;
          if (type === SYNC_FAIL) {
            const errLen = rv.getUint32(4, true);
            throw new Error('Pull failed: ' + new TextDecoder().decode(new Uint8Array(rmsg.payload).subarray(8, 8 + errLen)));
          }
          if (type === SYNC_DATA) {
            const dataLen = rv.getUint32(4, true);
            chunks.push(rmsg.payload.slice(8, 8 + dataLen));
            totalSize += dataLen;
            if (onProgress) onProgress(totalSize);
          }
        }
        await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0)));
        return this._concatArrayBuffers(chunks);
      } catch (e) {
        try { await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0))); } catch (_) {}
        throw e;
      }
    }

    async push(data, remotePath, mode = 0o100644, onProgress) {
      const stream = await this.open('sync:');
      try {
        const pathWithMode = remotePath + ',' + mode.toString();
        const pathBytes = new TextEncoder().encode(pathWithMode);
        const sendMsg = new ArrayBuffer(8 + pathBytes.length);
        const dv = new DataView(sendMsg);
        dv.setUint32(0, SYNC_SEND, true);
        dv.setUint32(4, pathBytes.length, true);
        new Uint8Array(sendMsg).set(pathBytes, 8);
        await this.transport.sendMessage(new AdbMessage(CMD_WRTE, stream.localId, stream.remoteId, sendMsg));

        const chunkSize = 64 * 1024;
        let offset = 0;
        const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        while (offset < uint8.length) {
          const end = Math.min(offset + chunkSize, uint8.length);
          const chunk = uint8.slice(offset, end);
          const dataMsg = new ArrayBuffer(8 + chunk.length);
          const ddv = new DataView(dataMsg);
          ddv.setUint32(0, SYNC_DATA, true);
          ddv.setUint32(4, chunk.length, true);
          new Uint8Array(dataMsg).set(chunk, 8);
          await this.transport.sendMessage(new AdbMessage(CMD_WRTE, stream.localId, stream.remoteId, dataMsg));
          offset = end;
          if (onProgress) onProgress(offset, uint8.length);
        }

        const doneMsg = new ArrayBuffer(8);
        const ddv = new DataView(doneMsg);
        ddv.setUint32(0, SYNC_DONE, true);
        ddv.setUint32(4, Math.floor(Date.now() / 1000), true);
        await this.transport.sendMessage(new AdbMessage(CMD_WRTE, stream.localId, stream.remoteId, doneMsg));

        await this.transport.sendMessage(new AdbMessage(CMD_OKAY, stream.localId, stream.remoteId, new ArrayBuffer(0)));
        const rmsg = await this.transport.readMessage();
        if (rmsg.command === CMD_WRTE) {
          const rv = new DataView(rmsg.payload);
          const type = rv.getUint32(0, true);
          if (type === SYNC_FAIL) {
            const errLen = rv.getUint32(4, true);
            throw new Error('Push failed: ' + new TextDecoder().decode(new Uint8Array(rmsg.payload).subarray(8, 8 + errLen)));
          }
        }
        await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0)));
      } catch (e) {
        try { await this.transport.sendMessage(new AdbMessage(CMD_CLSE, stream.localId, stream.remoteId, new ArrayBuffer(0))); } catch (_) {}
        throw e;
      }
    }

    async install(apkData, packageName, onProgress) {
      const session = await this.shellCommand('pm install-create -S ' + apkData.byteLength);
      const match = session.match(/sessionId=(\d+)/);
      if (!match) throw new Error('Failed to create install session: ' + session);
      const sessionId = match[1];
      try {
        const chunkSize = 1024 * 1024;
        let offset = 0;
        const uint8 = apkData instanceof Uint8Array ? apkData : new Uint8Array(apkData);
        let partIndex = 0;
        while (offset < uint8.length) {
          const end = Math.min(offset + chunkSize, uint8.length);
          const chunk = uint8.slice(offset, end);
          const tmpPath = `/data/local/tmp/_ads_install_${partIndex}.apk`;
          await this.push(chunk, tmpPath, 0o100644, onProgress);
          await this.shellCommand(`pm install-write -S ${chunk.length} ${sessionId} ${partIndex} ${tmpPath}`);
          await this.shellCommand(`rm ${tmpPath}`);
          offset = end;
          partIndex++;
        }
        const result = await this.shellCommand(`pm install-commit ${sessionId}`);
        return result;
      } catch (e) {
        await this.shellCommand(`pm install-abandon ${sessionId}`);
        throw e;
      }
    }

    async uninstall(packageName) {
      return await this.shellCommand(`pm uninstall ${packageName}`);
    }

    async getProp(key) {
      const result = await this.shellCommand(`getprop ${key}`);
      return result.trim();
    }

    async getDeviceProps() {
      const props = {};
      const keys = [
        'ro.product.model', 'ro.product.brand', 'ro.product.name',
        'ro.build.version.release', 'ro.build.version.sdk',
        'ro.product.cpu.abi', 'ro.serialno', 'ro.build.display.id',
        'ro.build.version.security_patch', 'ro.product.manufacturer'
      ];
      for (const key of keys) {
        props[key] = await this.getProp(key);
      }
      return props;
    }

    async screencap() {
      const data = await this.pull('/dev/graphics/fb0').catch(() => null);
      if (data) return data;
      const tmpPath = '/data/local/tmp/_ads_screencap.png';
      await this.shellCommand('screencap -p ' + tmpPath);
      const imgData = await this.pull(tmpPath);
      await this.shellCommand('rm ' + tmpPath);
      return imgData;
    }

    async reboot(mode = '') {
      if (mode) await this.shellCommand('reboot ' + mode);
      else await this.shellCommand('reboot');
    }

    async disconnect() {
      for (const [localId, stream] of this.streams) {
        try {
          await this.transport.sendMessage(new AdbMessage(CMD_CLSE, localId, stream.remoteId, new ArrayBuffer(0)));
        } catch (e) { /* ignore */ }
      }
      this.streams.clear();
      this.connected = false;
      await this.transport.disconnect();
    }

    static clearStoredKey() {
      localStorage.removeItem('adb_key');
    }

    static async getPublicKeyFingerprint() {
      const stored = localStorage.getItem('adb_key');
      if (!stored) return null;
      try {
        const keyData = JSON.parse(stored);
        let pubKey;
        if (keyData.pkcs8) {
          const pkcs8Buf = AdbDevice.prototype._base64ToBuffer(keyData.pkcs8);
          const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8Buf, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, true, ['sign']);
          const jwk = await crypto.subtle.exportKey('jwk', privateKey);
          pubKey = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, true, ['verify']);
        } else {
          pubKey = await crypto.subtle.importKey('jwk', { kty: keyData.kty, n: keyData.n, e: keyData.e, alg: 'RS256', ext: true },
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, true, ['verify']);
        }
        const spki = await crypto.subtle.exportKey('spki', pubKey);
        const hashBuffer = await crypto.subtle.digest('SHA-256', spki);
        const hashArray = new Uint8Array(hashBuffer);
        return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join(':');
      } catch (e) {
        return null;
      }
    }

    _concatArrayBuffers(buffers) {
      const totalLen = buffers.reduce((s, b) => s + b.byteLength, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const buf of buffers) {
        result.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }
      return result.buffer;
    }

    _parseConnectPayload(payload) {
      const str = new TextDecoder().decode(payload).replace(/\0/g, '');
      const info = {};
      const pairs = str.split('::');
      if (pairs.length > 1) {
        info.deviceType = pairs[0];
        const parts = pairs[1].split(';');
        for (const part of parts) {
          const [k, v] = part.split('=');
          if (k) info[k.trim()] = (v || '').trim();
        }
      }
      return info;
    }

    async _getOrCreateKey() {
      const stored = localStorage.getItem('adb_key');
      if (stored) {
        try {
          const keyData = JSON.parse(stored);
          if (keyData.pkcs8) {
            const pkcs8Buf = this._base64ToBuffer(keyData.pkcs8);
            return await crypto.subtle.importKey('pkcs8', pkcs8Buf, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['sign']);
          }
          return await crypto.subtle.importKey('jwk', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['sign']);
        } catch (e) { /* regenerate */ }
      }
      const keyPair = await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: ADB_KEY_SIZE, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-1' },
        true, ['sign', 'verify']
      );
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      localStorage.setItem('adb_key', JSON.stringify({ pkcs8: this._bufferToBase64(pkcs8) }));
      return keyPair.privateKey;
    }

    async _sign(key, data) {
      return await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data);
    }

    async _exportPublicKey(key) {
      const stored = localStorage.getItem('adb_key');
      const keyData = JSON.parse(stored);
      const pkcs8Buf = this._base64ToBuffer(keyData.pkcs8);
      const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8Buf, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, true, ['sign']);
      const jwk = await crypto.subtle.exportKey('jwk', privateKey);
      return this._encodeAdbPublicKey(jwk);
    }

    _encodeAdbPublicKey(jwk) {
      const n = this._base64UrlToBigInt(jwk.n);
      const e = this._base64UrlToBigInt(jwk.e);
      const d = this._base64UrlToBigInt(jwk.d);

      const buf = new ArrayBuffer(524);
      const dv = new DataView(buf);
      const u8 = new Uint8Array(buf);

      const ANDROID_PUBKEY_MODULUS_SIZE = 256;
      const ANDROID_PUBKEY_ENCODED_SIZE = 524;

      const rr = (BigInt(2) ** BigInt(4096)) % n;

      let offset = 0;
      const nLen = this._bigIntToBytes(n, u8, offset, ANDROID_PUBKEY_MODULUS_SIZE);
      offset += ANDROID_PUBKEY_MODULUS_SIZE;

      const rrLen = this._bigIntToBytes(rr, u8, offset, ANDROID_PUBKEY_MODULUS_SIZE);
      offset += ANDROID_PUBKEY_MODULUS_SIZE;

      dv.setUint32(offset, Number(e), true);
      offset += 4;

      const username = 'unknown@unknown';
      const encoded = this._bufferToBase64(u8.slice(0, ANDROID_PUBKEY_ENCODED_SIZE));
      return new TextEncoder().encode(encoded + ' ' + username + '\0');
    }

    _base64UrlToBigInt(str) {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      let result = BigInt(0);
      for (let i = 0; i < bytes.length; i++) {
        result = result * BigInt(256) + BigInt(bytes[i]);
      }
      return result;
    }

    _bigIntToBytes(num, target, offset, length) {
      const hex = num.toString(16).padStart(length * 2, '0');
      for (let i = 0; i < length; i++) {
        target[offset + i] = parseInt(hex.substr(i * 2, 2), 16);
      }
      return length;
    }

    _bufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    _base64ToBuffer(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
  }

  class AdbServer {
    constructor() {
      this.devices = [];
    }

    async requestUsbDevice() {
      return await navigator.usb.requestDevice({
        filters: [
          { classCode: 0xFF, subclassCode: 0x42, protocolCode: 0x01 }
        ]
      });
    }

    async getDevices() {
      if ('usb' in navigator) {
        return await navigator.usb.getDevices();
      }
      return [];
    }
  }

  root.AdbServer = AdbServer;
  root.AdbDevice = AdbDevice;
  root.AdbUsbTransport = AdbUsbTransport;
})(window);
