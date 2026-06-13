/**
 * ADB Library - Browser implementation based on Sysyz-itcom/tools adb-online
 * Implements: WebUSB transport, ADB protocol, RSA auth (BigInt-based), file sync, install
 * Reference: https://github.com/Sysyz-itcom/tools/blob/main/adb-online/index.js
 */
(function (root) {
  'use strict';

  const CMD_CNXN = 0x4E584E43;
  const CMD_OPEN = 0x4E45504F;
  const CMD_OKAY = 0x59414B4F;
  const CMD_CLSE = 0x45534C43;
  const CMD_WRTE = 0x45545257;
  const CMD_AUTH = 0x48545541;

  const AUTH_TOKEN = 1;
  const AUTH_SIGNATURE = 2;
  const AUTH_RSAPUBLICKEY = 3;

  const PROTOCOL_VERSION = 0x01000000;
  const MAX_PAYLOAD = 262144;

  const SYNC_SEND = 0x444E4553;
  const SYNC_RECV = 0x56434552;
  const SYNC_DATA = 0x41544144;
  const SYNC_DONE = 0x454E4F44;
  const SYNC_LIST = 0x5453494C;
  const SYNC_STAT = 0x54415453;
  const SYNC_FAIL = 0x4C494146;

  const SHELL_V2 = 'shell_v2';
  const USB_FILTER = { classCode: 255, subclassCode: 66, protocolCode: 1 };
  const XOR_MASK = 0xFFFFFFFF;

  // === MD5 implementation (js-md5 minimal) ===
  const md5 = (function() {
    function safeAdd(x, y) {
      const lsw = (x & 0xFFFF) + (y & 0xFFFF);
      return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xFFFF);
    }
    function bitRotateLeft(num, cnt) {
      return (num << cnt) | (num >>> (32 - cnt));
    }
    function md5cmn(q, a, b, x, s, t) {
      return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
    }
    function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
    function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
    function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }
    function binlMD5(x, len) {
      x[len >> 5] |= 0x80 << (len % 32);
      x[((len + 64) >>> 9 << 4) + 14] = len;
      let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
      for (let i = 0; i < x.length; i += 16) {
        const olda = a, oldb = b, oldc = c, oldd = d;
        a = md5ff(a, b, c, d, x[i],      7, -680876936);  d = md5ff(d, a, b, c, x[i+1],  12, -389564586);
        c = md5ff(c, d, a, b, x[i+2],  17, 606105819);   b = md5ff(b, c, d, a, x[i+3],  22, -1044525330);
        a = md5ff(a, b, c, d, x[i+4],   7, -176418897);  d = md5ff(d, a, b, c, x[i+5],  12, 1200080426);
        c = md5ff(c, d, a, b, x[i+6],  17, -1473231341); b = md5ff(b, c, d, a, x[i+7],  22, -45705983);
        a = md5ff(a, b, c, d, x[i+8],   7, 1770035416);  d = md5ff(d, a, b, c, x[i+9],  12, -1958414417);
        c = md5ff(c, d, a, b, x[i+10], 17, -42063);      b = md5ff(b, c, d, a, x[i+11], 22, -1990404162);
        a = md5ff(a, b, c, d, x[i+12],  7, 1804603682);  d = md5ff(d, a, b, c, x[i+13], 12, -40341101);
        c = md5ff(c, d, a, b, x[i+14], 17, -1502002290); b = md5ff(b, c, d, a, x[i+15], 22, 1236535329);
        a = md5gg(a, b, c, d, x[i+1],   5, -165796510);  d = md5gg(d, a, b, c, x[i+6],   9, -1069501632);
        c = md5gg(c, d, a, b, x[i+11], 14, 643717713);   b = md5gg(b, c, d, a, x[i],    20, -373897302);
        a = md5gg(a, b, c, d, x[i+5],   5, -701558691);  d = md5gg(d, a, b, c, x[i+10],  9, 38016083);
        c = md5gg(c, d, a, b, x[i+15], 14, -660478335);  b = md5gg(b, c, d, a, x[i+4],  20, -405537848);
        a = md5gg(a, b, c, d, x[i+9],   5, 568446438);   d = md5gg(d, a, b, c, x[i+14],  9, -1019803690);
        c = md5gg(c, d, a, b, x[i+3],  14, -187363961);  b = md5gg(b, c, d, a, x[i+8],  20, 1163531501);
        a = md5gg(a, b, c, d, x[i+13],  5, -1444681467); d = md5gg(d, a, b, c, x[i+2],   9, -51403784);
        c = md5gg(c, d, a, b, x[i+7],  14, 1735328473);  b = md5gg(b, c, d, a, x[i+12], 20, -1926607734);
        a = md5hh(a, b, c, d, x[i+5],   4, -378558);     d = md5hh(d, a, b, c, x[i+8],  11, -2022574463);
        c = md5hh(c, d, a, b, x[i+11], 16, 1839030562);  b = md5hh(b, c, d, a, x[i+14], 23, -35309556);
        a = md5hh(a, b, c, d, x[i+1],   4, -1530992060); d = md5hh(d, a, b, c, x[i+4],  11, 1272893353);
        c = md5hh(c, d, a, b, x[i+7],  16, -155497632);  b = md5hh(b, c, d, a, x[i+10], 23, -1094730640);
        a = md5hh(a, b, c, d, x[i+13],  4, 681279174);   d = md5hh(d, a, b, c, x[i],    11, -358537222);
        c = md5hh(c, d, a, b, x[i+3],  16, -722521979);  b = md5hh(b, c, d, a, x[i+6],  23, 76029189);
        a = md5hh(a, b, c, d, x[i+9],   4, -640364487);  d = md5hh(d, a, b, c, x[i+12], 11, -421815835);
        c = md5hh(c, d, a, b, x[i+15], 16, 530742520);   b = md5hh(b, c, d, a, x[i+2],  23, -995338651);
        a = md5ii(a, b, c, d, x[i],      6, -198630844);  d = md5ii(d, a, b, c, x[i+7],  10, 1126891415);
        c = md5ii(c, d, a, b, x[i+14], 15, -1416354905); b = md5ii(b, c, d, a, x[i+5],  21, -57434055);
        a = md5ii(a, b, c, d, x[i+12],  6, 1700485571);  d = md5ii(d, a, b, c, x[i+3],  10, -1894986606);
        c = md5ii(c, d, a, b, x[i+10], 15, -1051523);    b = md5ii(b, c, d, a, x[i+1],  21, -2054922799);
        a = md5ii(a, b, c, d, x[i+8],   6, 1873313359);  d = md5ii(d, a, b, c, x[i+15], 10, -30611744);
        c = md5ii(c, d, a, b, x[i+6],  15, -1560198380); b = md5ii(b, c, d, a, x[i+13], 21, 1309151649);
        a = md5ii(a, b, c, d, x[i+4],   6, -145523070);  d = md5ii(d, a, b, c, x[i+11], 10, -1120210379);
        c = md5ii(c, d, a, b, x[i+2],  15, 718787259);   b = md5ii(b, c, d, a, x[i+9],  21, -343485551);
        a = safeAdd(a, olda); b = safeAdd(b, oldb); c = safeAdd(c, oldc); d = safeAdd(d, oldd);
      }
      return [a, b, c, d];
    }
    function binl2rstr(input) {
      let output = '';
      for (let i = 0; i < input.length * 32; i += 8)
        output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xFF);
      return output;
    }
    function rstr2binl(input) {
      const output = [];
      for (let i = 0; i < input.length * 8; i += 32) {
        output[i >> 5] = 0;
      }
      for (let i = 0; i < input.length * 8; i += 8) {
        output[i >> 5] |= (input.charCodeAt(i / 8) & 0xFF) << (i % 32);
      }
      return output;
    }
    function rstrMD5(s) {
      return binl2rstr(binlMD5(rstr2binl(s), s.length * 8));
    }
    function rstr2hex(input) {
      const hexTab = '0123456789abcdef';
      let output = '';
      for (let i = 0; i < input.length; i++) {
        const x = input.charCodeAt(i);
        output += hexTab.charAt((x >>> 4) & 0x0F) + hexTab.charAt(x & 0x0F);
      }
      return output;
    }
    return {
      hashBinary: function(b64str) {
        return rstr2hex(rstrMD5(atob(b64str)));
      }
    };
  })();

  // === BigInt helpers (exact from bundle) ===
  function dataViewToBigInt(dv, offset = 0, length = dv.byteLength - offset, littleEndian = false) {
    const bytes = new Uint8Array(dv.buffer, offset, length);
    return littleEndian
      ? bytes.reduceRight((acc, b) => (acc << 8n) + BigInt(b), 0n)
      : bytes.reduce((acc, b) => (acc << 8n) + BigInt(b), 0n);
  }

  function bigIntToDataView(dv, offset, n, littleEndian = false) {
    if (littleEndian) {
      while (n > 0n) {
        dv.setBigUint64(offset, n, true);
        offset += 8;
        n >>= 64n;
      }
    } else {
      const parts = [];
      while (n > 0n) {
        parts.push(BigInt.asUintN(64, n));
        n >>= 64n;
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        dv.setBigUint64(offset, parts[i], false);
        offset += 8;
      }
    }
  }

  function bigIntToArrayBuffer(n, littleEndian = false) {
    const buf = new ArrayBuffer(Math.ceil(n.toString(2).length / 8));
    bigIntToDataView(new DataView(buf), 0, n, littleEndian);
    return buf;
  }

  function modExp(base, exp, mod) {
    if (mod === 1n) return 0n;
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (BigInt.asUintN(1, exp) === 1n) {
        result = result * base % mod;
      }
      base = base * base % mod;
      exp >>= 1n;
    }
    return result;
  }

  function modInverse(e, t) {
    e = ((e % t) + t) % t;
    if (!e || t < 2) return NaN;
    const n = [];
    let r = t;
    while (r) {
      [e, r] = [r, e % r];
      n.push({ a: e, b: r });
    }
    if (e !== 1) return NaN;
    let i = 1, s = 0;
    for (let o = n.length - 2; o >= 0; o--) {
      [i, s] = [s, i - s * Math.floor(n[o].a / n[o].b)];
    }
    return ((s % t) + t) % t;
  }

  // === Crypto helpers (exact from bundle) ===
  const PKCS8_KEY_OFFSET = 38;
  const PKCS8_PRIVATE_EXP_OFFSET = 303;
  const MODULUS_BYTES = 2048 / 8;  // 256
  const MODULUS_WORDS = MODULUS_BYTES / 4;  // 64
  const RSA_EXPONENT = 65537;

  function base64ToUint8Array(b64) {
    return Uint8Array.from(window.atob(b64), c => c.charCodeAt(0));
  }

  function arrayBufferToBase64(buffer) {
    return window.btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  function extractRsaComponents(pkcs8B64) {
    const bytes = typeof pkcs8B64 === 'string' ? base64ToUint8Array(pkcs8B64) : pkcs8B64;
    const dv = new DataView(bytes.buffer);
    return {
      n: dataViewToBigInt(dv, PKCS8_KEY_OFFSET, MODULUS_BYTES),
      d: dataViewToBigInt(dv, PKCS8_PRIVATE_EXP_OFFSET, MODULUS_BYTES)
    };
  }

  // RSA sign using BigInt modular exponentiation (PKCS#1 v1.5 + SHA-1 DigestInfo)
  async function rsaSign(privateKeyB64, tokenBuffer) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', tokenBuffer));
    // PKCS#1 v1.5 padding for SHA-1 (218 bytes FF padding)
    const padded = new Uint8Array(256);
    padded[0] = 0; padded[1] = 1;
    for (let i = 2; i < 220; i++) padded[i] = 0xFF;
    padded[220] = 0;
    // DER-encoded DigestInfo + SHA-1 hash
    const digestInfo = new Uint8Array([
      0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14,
      ...digest
    ]);
    padded.set(digestInfo, 221);

    const { d, n } = extractRsaComponents(privateKeyB64);
    const message = dataViewToBigInt(new DataView(padded.buffer), 0, 256);
    const signed = modExp(message, d, n);
    return bigIntToArrayBuffer(signed, true);
  }

  // Format Android ADB public key (exact from bundle's r_ function)
  function formatAdbPublicKey({ privateKey, username, hostname }) {
    const buf = new Uint8Array(524);
    const dv = new DataView(buf.buffer);
    const { n } = extractRsaComponents(privateKey);
    const rr = 2n ** 4096n % n;
    const n0inv = modInverse(-Number(BigInt.asUintN(32, n)), 2 ** 32);

    dv.setUint32(0, MODULUS_WORDS, true);
    dv.setUint32(4, n0inv, true);
    bigIntToDataView(dv, 8, n, true);
    bigIntToDataView(dv, 264, rr, true);
    dv.setUint32(520, RSA_EXPONENT, true);

    const b64 = arrayBufferToBase64(buf.buffer);
    return `${b64} ${username || 'unknown'}@${hostname || 'unknown'}`;
  }

  // MD5 fingerprint of ADB public key
  function keyFingerprint(publicKey) {
    let b64 = typeof publicKey === 'string' ? publicKey : arrayBufferToBase64(publicKey);
    return md5.hashBinary(window.atob(b64.split(' ')[0]))
      .match(/.{1,2}/g)
      .join(':')
      .toUpperCase();
  }

  // Load or generate ADB key pair (matches bundle's l_ function)
  async function loadOrGenerateKey() {
    let privateKey = localStorage.getItem('privateKey');
    let publicKey = localStorage.getItem('publicKey');
    if (!privateKey || !publicKey) {
      privateKey = await generatePrivateKey();
      publicKey = formatAdbPublicKey({
        privateKey,
        username: Math.random().toString(16).substring(3),
        hostname: 'adb.http.gs'
      });
      localStorage.setItem('privateKey', privateKey);
      localStorage.setItem('publicKey', publicKey);
    }
    return { privateKey, publicKey };
  }

  // Generate RSA-2048 key pair, export private key as PKCS8 base64
  async function generatePrivateKey() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: 'SHA-1' }
      },
      true,
      ['sign', 'verify']
    );
    return arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  }

  // === ADB Client class (based on bundle's class Ee) ===
  class AdbClient {
    constructor() {
      this.device = null;
      this.endpoints = null;
      this.banner = null;
      if (!navigator.usb) throw new Error('当前浏览器不支持 WebUSB API');
    }

    static loadEndpoints(confInterface) {
      const find = dir => confInterface.alternate.endpoints.find(
        e => e.direction === dir && e.type === 'bulk'
      ).endpointNumber;
      return { in: find('in'), out: find('out') };
    }

    static checksum(data) {
      if (!data || data.byteLength === 0) return 0;
      return new Uint8Array(data).reduce((sum, b) => sum + b, 0) & XOR_MASK;
    }

    async requestDevice() {
      if (!this.device) {
        try {
          this.device = await navigator.usb.requestDevice({ filters: [USB_FILTER] });
        } catch (e) { /* user cancelled */ }
      }
      return !!this.device;
    }

    async reloadDevice() {
      this.banner = undefined;
      this.device = (await navigator.usb.getDevices()).find(d => {
        try {
          return d.configuration?.interfaces?.some(
            ({ alternate: { interfaceClass: c, interfaceSubclass: s, interfaceProtocol: p } }) =>
              c === 255 && s === 66 && p === 1
          );
        } catch { return false; }
      });
      return !!this.device;
    }

    async forgetDevice() {
      await this.device?.forget?.();
      this.device = undefined;
      this.banner = undefined;
    }

    async open() {
      if (!this.device) return;
      await this.device.open();
      const { confInterface, configurationValue, alternateSetting } = this.filterConfiguration();
      const { interfaceNumber, claimed } = confInterface;
      if (this.device.configuration?.configurationValue !== configurationValue) {
        await this.device.selectConfiguration(configurationValue);
      }
      if (!claimed) {
        try {
          await this.device.claimInterface(interfaceNumber);
        } catch {
          throw new Error('USB 接口被占用。请关闭其他 ADB 工具后重试。');
        }
      }
      if (confInterface.alternate.alternateSetting !== alternateSetting) {
        await this.device.selectAlternateInterface(interfaceNumber, alternateSetting);
      }
      this.endpoints = AdbClient.loadEndpoints(confInterface);
    }

    filterConfiguration() {
      if (!this.device) throw new Error('设备未连接');
      for (const conf of this.device.configurations) {
        for (const iface of conf.interfaces) {
          for (const alt of iface.alternates) {
            if (alt.interfaceClass === 255 && alt.interfaceSubclass === 66 && alt.interfaceProtocol === 1) {
              return {
                confInterface: iface,
                configurationValue: conf.configurationValue,
                alternateSetting: alt.alternateSetting
              };
            }
          }
        }
      }
      throw new Error('未找到 ADB 接口 (0xFF/0x42/0x01)。请确保设备已启用 USB 调试。');
    }

    parseBanner(data) {
      const str = new TextDecoder().decode(data);
      return str.slice(8).split(';').reduce((obj, part) => {
        if (!part.includes('=')) return obj;
        const [key, val] = part.split('=');
        if (key === 'features') obj.features = val.split(',');
        else obj[key] = val;
        return obj;
      }, {});
    }

    isSupportedFeature(feature) {
      if (!this.banner) throw new Error('设备未连接');
      return this.banner.features?.includes(feature) ?? false;
    }

    async pair({ privateKey, publicKey, userGestureCallback }) {
      await this.send({ command: CMD_CNXN, arg0: PROTOCOL_VERSION, arg1: MAX_PAYLOAD, data: 'host::stopapp' });
      const { data: token } = await this.receiveExpect({ command: CMD_AUTH, arg0: AUTH_TOKEN });
      await this.send({ command: CMD_AUTH, arg0: AUTH_SIGNATURE, data: await rsaSign(privateKey, token.buffer) });

      let msg = await this.receive();
      if (msg.command !== CMD_CNXN) {
        if (msg.command === CMD_AUTH) {
          await this.send({ command: CMD_AUTH, arg0: AUTH_RSAPUBLICKEY, data: publicKey });
          let fp;
          try { fp = keyFingerprint(publicKey); } catch { fp = null; }
          userGestureCallback?.(fp);
          while (msg.command !== CMD_CNXN) {
            msg = await this.receive();
            if (msg.command === CMD_AUTH) {
              await this.send({ command: CMD_AUTH, arg0: AUTH_SIGNATURE, data: await rsaSign(privateKey, msg.data.buffer) });
            } else if (msg.command !== CMD_CNXN) {
              throw new Error('ADB 认证失败：未知响应');
            }
          }
        } else {
          throw new Error('ADB 认证失败：未知响应');
        }
      }
      this.banner = this.parseBanner(msg.data);
    }

    async exec(command) {
      await this.send({ command: CMD_OPEN, arg0: 1, arg1: 0, data: `shell:${command}` });
      await this.receiveExpect({ command: CMD_OKAY });
      const parts = [];
      const decoder = new TextDecoder();
      let msg;
      while ((msg = await this.receive())) {
        if (msg.command === CMD_WRTE) {
          await this.send({ command: CMD_OKAY, arg0: msg.arg1, arg1: msg.arg0 });
          if (msg.data) parts.push(decoder.decode(msg.data.buffer));
        } else if (msg.command === CMD_CLSE) {
          await this.send({ command: CMD_CLSE, arg0: msg.arg1, arg1: msg.arg0 });
          break;
        } else {
          throw new Error('未知 ADB 命令');
        }
      }
      return parts.length ? parts.join('') : null;
    }

    async execV2(command) {
      if (!this.isSupportedFeature(SHELL_V2)) {
        return this.exec(command);
      }
      await this.send({ command: CMD_OPEN, arg0: 1, arg1: 0, data: `shell,v2,raw:${command}` });
      await this.receiveExpect({ command: CMD_OKAY });
      const stdout = [], stderr = [];
      const decoder = new TextDecoder();
      let exitCode;
      let msg;
      while ((msg = await this.receive())) {
        if (msg.command === CMD_WRTE) {
          await this.send({ command: CMD_OKAY, arg0: msg.arg1, arg1: msg.arg0 });
          if (!msg.data) continue;
          const streamId = msg.data.getInt8(0);
          const len = msg.data.getUint32(1, true);
          const payload = new Uint8Array(msg.data.buffer).slice(5, 5 + len);
          if (streamId === 1 || streamId === 2) {
            const text = decoder.decode(payload);
            (streamId === 1 ? stdout : stderr).push(text);
          } else if (streamId === 3) {
            exitCode = payload[0];
          }
        } else if (msg.command === CMD_CLSE) {
          await this.send({ command: CMD_CLSE, arg0: msg.arg1, arg1: msg.arg0 });
          await this.receiveExpect({ command: CMD_CLSE });
          try { await timeout(this.receiveExpect({ command: CMD_CLSE }), 300); } catch {}
          break;
        } else {
          throw new Error('未知 ADB 命令');
        }
      }
      return {
        stdout: stdout.length ? stdout.join('') : null,
        stderr: stderr.length ? stderr.join('') : null,
        exitCode: exitCode ?? -1
      };
    }

    async close() {
      if (this.device?.opened) {
        try {
          const ifaceNum = this.device.configuration?.interfaces?.[0]?.interfaceNumber ?? 0;
          await this.device.releaseInterface(ifaceNum);
          await this.device.close();
        } catch {}
      }
    }

    async read(length) {
      if (!this.device || !this.endpoints) throw new Error('设备未连接');
      const { data, status } = await this.device.transferIn(this.endpoints.in, length);
      if (status !== 'ok') throw new Error('USB 读取失败: ' + status);
      return data;
    }

    async write(buffer) {
      if (!this.device || !this.endpoints) throw new Error('设备未连接');
      const { bytesWritten, status } = await this.device.transferOut(this.endpoints.out, buffer);
      if (bytesWritten !== buffer.byteLength) throw new Error('USB 写入字节数不匹配');
      if (status !== 'ok') throw new Error('USB 写入失败: ' + status);
    }

    async receive() {
      const header = await this.read(24);
      if (!header) throw new Error('响应为空');
      const cmd = header.getUint32(0, true);
      const arg0 = header.getUint32(4, true);
      const arg1 = header.getUint32(8, true);
      const dataLen = header.getUint32(12, true);
      const data = dataLen > 0 ? await this.read(dataLen) : undefined;
      return { command: cmd, arg0, arg1, data };
    }

    async send({ command, arg0, arg1, data }) {
      const header = new ArrayBuffer(24);
      if (typeof data === 'string') {
        data = new TextEncoder().encode(data + '\0').buffer;
      }
      const dv = new DataView(header);
      dv.setUint32(0, command, true);
      dv.setUint32(4, arg0 ?? 0, true);
      dv.setUint32(8, arg1 ?? 0, true);
      dv.setUint32(12, data?.byteLength ?? 0, true);
      dv.setUint32(16, AdbClient.checksum(data), true);
      dv.setUint32(20, command ^ XOR_MASK, true);
      await this.write(header);
      if (data) await this.write(data);
    }

    async receiveExpect(expected) {
      const msg = await this.receive();
      for (const [key, val] of Object.entries(expected)) {
        if (msg[key] !== val) {
          throw new Error(`ADB 协议错误: 期望 ${key}=0x${val.toString(16)}, 收到 0x${msg[key].toString(16)}`);
        }
      }
      return msg;
    }
  }

  function timeout(promise, ms) {
    if (ms <= 0) return promise;
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(reject, ms, new Error('请求超时')); })
    ]).finally(() => clearTimeout(timer));
  }

  // === High-level ADB Device (preserves existing API for adb-module.js) ===
  class AdbDevice {
    constructor(client) {
      this.client = client;
      this.connected = false;
      this._shellV2 = false;
    }

    async connect(authCallback) {
      const { privateKey, publicKey } = await loadOrGenerateKey();
      await this.client.open();
      await this.client.pair({
        privateKey,
        publicKey,
        userGestureCallback: authCallback
      });
      this.connected = true;
      this._shellV2 = this.client.isSupportedFeature(SHELL_V2);
    }

    async shellCommand(command) {
      if (this._shellV2) {
        const result = await this.client.execV2(command);
        if (result.exitCode !== 0 && result.stderr) {
          throw new Error(result.stderr);
        }
        return result.stdout || '';
      }
      return await this.client.exec(command) || '';
    }

    async *shellStream(command) {
      // For streaming, use exec approach with yielding
      const result = await this.shellCommand(command);
      yield result;
    }

    async listDir(path) {
      const stream = await this._openSync();
      try {
        const pathBytes = new TextEncoder().encode(path);
        const msg = new ArrayBuffer(8 + pathBytes.length);
        const dv = new DataView(msg);
        dv.setUint32(0, SYNC_LIST, true);
        dv.setUint32(4, pathBytes.length, true);
        new Uint8Array(msg).set(pathBytes, 8);
        await this._syncWrite(stream, msg);

        const entries = [];
        while (true) {
          await this._sendOkay(stream);
          const rmsg = await this._syncRead(stream);
          if (rmsg.type === SYNC_DONE) break;
          if (rmsg.type !== SYNC_LIST) continue;
          const rv = new DataView(rmsg.data.buffer);
          const mode = rv.getUint32(0, true);
          const size = rv.getUint32(4, true);
          const time = rv.getUint32(8, true);
          const nameLen = rv.getUint32(12, true);
          const name = new TextDecoder().decode(rmsg.data.subarray(16, 16 + nameLen));
          entries.push({ name, mode, size, time, isDir: (mode & 0x4000) !== 0 });
        }
        await this._closeSync(stream);
        return entries;
      } catch (e) {
        try { await this._closeSync(stream); } catch {}
        throw e;
      }
    }

    async pull(remotePath, onProgress) {
      const stream = await this._openSync();
      try {
        const pathBytes = new TextEncoder().encode(remotePath);
        const msg = new ArrayBuffer(8 + pathBytes.length);
        const dv = new DataView(msg);
        dv.setUint32(0, SYNC_RECV, true);
        dv.setUint32(4, pathBytes.length, true);
        new Uint8Array(msg).set(pathBytes, 8);
        await this._syncWrite(stream, msg);

        const chunks = [];
        let total = 0;
        while (true) {
          await this._sendOkay(stream);
          const rmsg = await this._syncRead(stream);
          if (rmsg.type === SYNC_DONE) break;
          if (rmsg.type === SYNC_FAIL) {
            throw new Error('Pull 失败: ' + new TextDecoder().decode(rmsg.data));
          }
          if (rmsg.type === SYNC_DATA) {
            chunks.push(rmsg.data.buffer);
            total += rmsg.data.byteLength;
            onProgress?.(total);
          }
        }
        await this._closeSync(stream);
        return this._concatBuffers(chunks);
      } catch (e) {
        try { await this._closeSync(stream); } catch {}
        throw e;
      }
    }

    async push(data, remotePath, mode = 0o100644, onProgress) {
      const stream = await this._openSync();
      try {
        const pathWithMode = remotePath + ',' + mode.toString();
        const pathBytes = new TextEncoder().encode(pathWithMode);
        const msg = new ArrayBuffer(8 + pathBytes.length);
        const dv = new DataView(msg);
        dv.setUint32(0, SYNC_SEND, true);
        dv.setUint32(4, pathBytes.length, true);
        new Uint8Array(msg).set(pathBytes, 8);
        await this._syncWrite(stream, msg);

        const chunkSize = 64 * 1024;
        const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        let offset = 0;
        while (offset < uint8.length) {
          const end = Math.min(offset + chunkSize, uint8.length);
          const chunk = uint8.slice(offset, end);
          const dataMsg = new ArrayBuffer(8 + chunk.length);
          const ddv = new DataView(dataMsg);
          ddv.setUint32(0, SYNC_DATA, true);
          ddv.setUint32(4, chunk.length, true);
          new Uint8Array(dataMsg).set(chunk, 8);
          await this._syncWrite(stream, dataMsg);
          offset = end;
          onProgress?.(offset, uint8.length);
        }

        const doneMsg = new ArrayBuffer(8);
        const ddv = new DataView(doneMsg);
        ddv.setUint32(0, SYNC_DONE, true);
        ddv.setUint32(4, Math.floor(Date.now() / 1000), true);
        await this._syncWrite(stream, doneMsg);
        await this._sendOkay(stream);

        const rmsg = await this._syncRead(stream);
        if (rmsg.type === SYNC_FAIL) {
          throw new Error('Push 失败: ' + new TextDecoder().decode(rmsg.data));
        }
        await this._closeSync(stream);
      } catch (e) {
        try { await this._closeSync(stream); } catch {}
        throw e;
      }
    }

    async install(apkData, packageName, onProgress) {
      const session = await this.shellCommand('pm install-create -S ' + apkData.byteLength);
      const match = session.match(/sessionId=(\d+)/);
      if (!match) throw new Error('创建安装会话失败: ' + session);
      const sessionId = match[1];
      try {
        const chunkSize = 1024 * 1024;
        const uint8 = apkData instanceof Uint8Array ? apkData : new Uint8Array(apkData);
        let offset = 0, partIndex = 0;
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
        return await this.shellCommand(`pm install-commit ${sessionId}`);
      } catch (e) {
        await this.shellCommand(`pm install-abandon ${sessionId}`);
        throw e;
      }
    }

    async uninstall(packageName) {
      return await this.shellCommand(`pm uninstall ${packageName}`);
    }

    async getProp(key) {
      return (await this.shellCommand(`getprop ${key}`)).trim();
    }

    async getDeviceProps() {
      const keys = [
        'ro.product.model', 'ro.product.brand', 'ro.product.name',
        'ro.build.version.release', 'ro.build.version.sdk',
        'ro.product.cpu.abi', 'ro.serialno', 'ro.build.display.id',
        'ro.build.version.security_patch', 'ro.product.manufacturer'
      ];
      const props = {};
      for (const key of keys) {
        props[key] = await this.getProp(key);
      }
      return props;
    }

    async screencap() {
      const tmpPath = '/data/local/tmp/_ads_screencap.png';
      await this.shellCommand('screencap -p ' + tmpPath);
      const data = await this.pull(tmpPath);
      await this.shellCommand('rm ' + tmpPath);
      return data;
    }

    async reboot(mode = '') {
      await this.shellCommand(mode ? `reboot ${mode}` : 'reboot');
    }

    async disconnect() {
      this.connected = false;
      await this.client.close();
    }

    static clearStoredKey() {
      localStorage.removeItem('privateKey');
      localStorage.removeItem('publicKey');
      localStorage.removeItem('adb_key');
    }

    // === Sync protocol helpers ===
    _localId = 0;
    _streams = new Map();

    async _openSync() {
      const localId = ++this._localId;
      await this.client.send({ command: CMD_OPEN, arg0: localId, arg1: 0, data: 'sync:' });
      const msg = await this.client.receiveExpect({ command: CMD_OKAY });
      const remoteId = msg.arg0;
      const stream = { localId, remoteId };
      this._streams.set(localId, stream);
      return stream;
    }

    async _syncWrite(stream, payload) {
      await this.client.send({ command: CMD_WRTE, arg0: stream.localId, arg1: stream.remoteId, data: payload });
    }

    async _sendOkay(stream) {
      await this.client.send({ command: CMD_OKAY, arg0: stream.localId, arg1: stream.remoteId });
    }

    async _syncRead(stream) {
      const msg = await this.client.receive();
      if (msg.command === CMD_CLSE) return { type: SYNC_DONE };
      if (msg.command !== CMD_WRTE) return { type: 0 };
      const dv = new DataView(msg.data.buffer);
      const type = dv.getUint32(0, true);
      const len = dv.getUint32(4, true);
      const payload = new Uint8Array(msg.data.buffer).slice(8, 8 + len);
      return { type, data: payload };
    }

    async _closeSync(stream) {
      try {
        await this.client.send({ command: CMD_CLSE, arg0: stream.localId, arg1: stream.remoteId });
      } catch {}
      this._streams.delete(stream.localId);
    }

    _concatBuffers(buffers) {
      const totalLen = buffers.reduce((s, b) => s + b.byteLength, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const buf of buffers) {
        result.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }
      return result.buffer;
    }
  }

  // === USB device request helper ===
  class AdbServer {
    constructor() {
      this.devices = [];
    }

    async requestUsbDevice() {
      return await navigator.usb.requestDevice({ filters: [USB_FILTER] });
    }

    async getDevices() {
      if ('usb' in navigator) return await navigator.usb.getDevices();
      return [];
    }
  }

  root.AdbClient = AdbClient;
  root.AdbServer = AdbServer;
  root.AdbDevice = AdbDevice;
})(window);
