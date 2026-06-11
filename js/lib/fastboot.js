/**
 * Fastboot Library - Based on kdrag0n/fastboot.js patterns
 * Implements Fastboot protocol over WebUSB
 */
(function (root) {
  'use strict';

  const FASTBOOT_USB_CLASS = 0xFF;
  const FASTBOOT_USB_SUBCLASS = 0x42;
  const FASTBOOT_USB_PROTOCOL = 0x03;

  const BULK_TRANSFER_SIZE = 16384;
  const DEFAULT_DOWNLOAD_SIZE = 512 * 1024 * 1024;
  const MAX_DOWNLOAD_SIZE = 1024 * 1024 * 1024;
  const GETVAR_TIMEOUT = 10000;

  class FastbootError extends Error {
    constructor(status, message) {
      super(`Bootloader replied with ${status}: ${message}`);
      this.status = status;
      this.bootloaderMessage = message;
      this.name = 'FastbootError';
    }
  }

  class UsbError extends Error {
    constructor(message) {
      super(message);
      this.name = 'UsbError';
    }
  }

  class FastbootDevice {
    constructor() {
      this.device = null;
      this.epIn = null;
      this.epOut = null;
      this.maxDownloadSize = DEFAULT_DOWNLOAD_SIZE;
      this.connected = false;
      this._disconnectHandler = null;
    }

    get isConnected() {
      return this.device !== null && this.device.opened && this.connected;
    }

    async connect(usbDevice) {
      if (usbDevice) {
        this.device = usbDevice;
      } else {
        const devices = await navigator.usb.getDevices();
        const fastbootDevices = devices.filter(d => this._matchesFastboot(d));
        
        if (fastbootDevices.length === 1) {
          this.device = fastbootDevices[0];
        } else {
          this.device = await navigator.usb.requestDevice({
            filters: [{
              classCode: FASTBOOT_USB_CLASS,
              subclassCode: FASTBOOT_USB_SUBCLASS,
              protocolCode: FASTBOOT_USB_PROTOCOL
            }]
          });
        }
      }

      await this._validateAndConnect();
    }

    _matchesFastboot(device) {
      for (const iface of device.configurations?.[0]?.interfaces || []) {
        const alt = iface.alternate;
        if (alt.interfaceClass === FASTBOOT_USB_CLASS &&
            alt.interfaceSubclass === FASTBOOT_USB_SUBCLASS &&
            alt.interfaceProtocol === FASTBOOT_USB_PROTOCOL) {
          return true;
        }
      }
      return false;
    }

    async _validateAndConnect() {
      if (!this.device) throw new UsbError('No device');

      const iface = this.device.configuration?.interfaces?.find(i =>
        i.alternate.interfaceClass === FASTBOOT_USB_CLASS &&
        i.alternate.interfaceSubclass === FASTBOOT_USB_SUBCLASS &&
        i.alternate.interfaceProtocol === FASTBOOT_USB_PROTOCOL
      );

      if (!iface) throw new UsbError('Fastboot interface not found');

      const alt = iface.alternate;
      const endpoints = alt.endpoints;
      
      if (endpoints.length !== 2) {
        throw new UsbError('Interface has wrong number of endpoints');
      }

      this.epIn = null;
      this.epOut = null;

      for (const ep of endpoints) {
        if (ep.type !== 'bulk') {
          throw new UsbError('Endpoint is not bulk');
        }
        if (ep.direction === 'in' && this.epIn === null) {
          this.epIn = ep.endpointNumber;
        } else if (ep.direction === 'out' && this.epOut === null) {
          this.epOut = ep.endpointNumber;
        }
      }

      if (this.epIn === null || this.epOut === null) {
        throw new UsbError('Missing bulk endpoints');
      }

      try {
        await this.device.open();
      } catch (e) {
        if (e.name === 'SecurityError' || e.message.includes('Access denied')) {
          throw new UsbError('USB 设备访问被拒绝。请关闭命令行 fastboot 工具、Android Studio 或其他可能占用设备的程序');
        }
        throw e;
      }
      
      try { await this.device.reset(); } catch (e) { /* ignore */ }
      await this.device.selectConfiguration(1);
      await this.device.claimInterface(iface.interfaceNumber);

      this.connected = true;

      this._disconnectHandler = (e) => {
        if (e.device === this.device) {
          this.connected = false;
        }
      };
      navigator.usb.addEventListener('disconnect', this._disconnectHandler);

      try {
        const maxDl = await this._getVariable('max-download-size');
        if (maxDl) {
          const parsed = parseInt(maxDl.toLowerCase(), 16);
          if (!isNaN(parsed)) {
            this.maxDownloadSize = Math.min(parsed, MAX_DOWNLOAD_SIZE);
          }
        }
      } catch (e) { /* use default */ }
    }

    async disconnect() {
      if (this._disconnectHandler) {
        navigator.usb.removeEventListener('disconnect', this._disconnectHandler);
        this._disconnectHandler = null;
      }
      if (this.device) {
        try { await this.device.close(); } catch (e) { /* ignore */ }
        this.device = null;
      }
      this.connected = false;
      this.epIn = null;
      this.epOut = null;
    }

    async _readResponse() {
      let fullResponse = '';

      while (true) {
        const result = await this.device.transferIn(this.epIn, 64);
        const text = new TextDecoder().decode(result.data);
        fullResponse += text;

        const status = fullResponse.substring(0, 4);

        if (status === 'OKAY') {
          return fullResponse.substring(4);
        } else if (status === 'FAIL') {
          throw new FastbootError('FAIL', fullResponse.substring(4));
        } else if (status === 'DATA') {
          return { dataSize: fullResponse.substring(4, 12) };
        } else if (status === 'INFO') {
          continue;
        }

        if (fullResponse.length > 4096) {
          return fullResponse;
        }
      }
    }

    async runCommand(command) {
      if (command.length > 64) {
        throw new RangeError('Command too long');
      }

      const encoder = new TextEncoder();
      await this.device.transferOut(this.epOut, encoder.encode(command));
      return await this._readResponse();
    }

    async _getVariable(varName) {
      try {
        const result = await this._runWithTimeout(
          this.runCommand(`getvar:${varName}`),
          GETVAR_TIMEOUT
        );
        return typeof result === 'string' ? result.trim() : null;
      } catch (e) {
        if (e instanceof FastbootError && e.status === 'FAIL') {
          return null;
        }
        throw e;
      }
    }

    async _runWithTimeout(promise, timeoutMs) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        )
      ]);
    }

    async getvar(variable) {
      const result = await this.runCommand(`getvar:${variable}`);
      return typeof result === 'string' ? result : result.dataSize || '';
    }

    async getAllVars() {
      const vars = {};
      const keys = [
        'version', 'version-bootloader', 'version-baseband',
        'serialno', 'product', 'variant', 'secure', 'unlocked',
        'off-mode-charge', 'battery-soc', 'battery-voltage',
        'slot-count', 'current-slot',
        'slot-successful:a', 'slot-successful:b',
        'slot-unbootable:a', 'slot-unbootable:b',
        'has-slot:boot', 'has-slot:system', 'has-slot:vendor',
        'has-slot:recovery', 'max-download-size',
        'partition-size:boot', 'partition-size:system',
        'partition-size:vendor', 'partition-size:userdata'
      ];

      for (const key of keys) {
        try {
          const val = await this.getvar(key);
          if (val && val !== 'OKAY' && val !== '') {
            vars[key] = val;
          }
        } catch (e) { /* skip */ }
      }
      return vars;
    }

    async flash(partition, data, onProgress) {
      const currentSlot = await this.getvar('current-slot').catch(() => null);
      const hasSlot = await this.getvar(`has-slot:${partition}`).catch(() => 'no');
      
      if (hasSlot === 'yes' && currentSlot) {
        partition = `${partition}_${currentSlot}`;
      }

      await this._download(data, onProgress);
      const result = await this.runCommand(`flash:${partition}`);
      if (typeof result === 'object' && result.dataSize) {
        throw new FastbootError('FAIL', 'Unexpected DATA response');
      }
      return result;
    }

    async erase(partition) {
      const result = await this.runCommand(`erase:${partition}`);
      return result;
    }

    async boot(data) {
      await this._download(data);
      const result = await this.runCommand('boot');
      return result;
    }

    async reboot(target = '') {
      const cmd = target ? `reboot-${target}` : 'reboot';
      return await this.runCommand(cmd);
    }

    async flashingUnlock() {
      return await this.runCommand('flashing unlock');
    }

    async flashingLock() {
      return await this.runCommand('flashing lock');
    }

    async oemUnlock() {
      return await this.runCommand('oem unlock');
    }

    async oemLock() {
      return await this.runCommand('oem lock');
    }

    async setActiveSlot(slot) {
      return await this.runCommand(`set_active:${slot}`);
    }

    async continue() {
      return await this.runCommand('continue');
    }

    async oem(command) {
      return await this.runCommand(`oem ${command}`);
    }

    async _download(data, onProgress) {
      const size = data.byteLength || data.length;
      const hexSize = size.toString(16).padStart(8, '0');

      const downloadResult = await this.runCommand(`download:${hexSize}`);
      if (typeof downloadResult === 'object' && downloadResult.dataSize) {
        const requestedSize = parseInt(downloadResult.dataSize, 16);
        if (requestedSize !== size) {
          throw new FastbootError('FAIL', `Size mismatch: requested ${size}, got ${requestedSize}`);
        }
      }

      const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
      let offset = 0;

      while (offset < uint8.length) {
        const end = Math.min(offset + BULK_TRANSFER_SIZE, uint8.length);
        const chunk = uint8.slice(offset, end);
        await this.device.transferOut(this.epOut, chunk);
        offset = end;
        if (onProgress) onProgress(offset, size);
      }

      const result = await this._readResponse();
      if (typeof result === 'object' && result.dataSize) {
        throw new FastbootError('FAIL', 'Unexpected DATA during download');
      }
      return result;
    }
  }

  class FastbootServer {
    async getDevices() {
      const devices = await navigator.usb.getDevices();
      return devices.filter(d => {
        for (const iface of d.configuration?.interfaces || []) {
          const alt = iface.alternate;
          if (alt.interfaceClass === FASTBOOT_USB_CLASS &&
              alt.interfaceSubclass === FASTBOOT_USB_SUBCLASS &&
              alt.interfaceProtocol === FASTBOOT_USB_PROTOCOL) {
            return true;
          }
        }
        return false;
      });
    }

    async requestDevice() {
      return await navigator.usb.requestDevice({
        filters: [{
          classCode: FASTBOOT_USB_CLASS,
          subclassCode: FASTBOOT_USB_SUBCLASS,
          protocolCode: FASTBOOT_USB_PROTOCOL
        }]
      });
    }
  }

  root.FastbootDevice = FastbootDevice;
  root.FastbootServer = FastbootServer;
  root.FastbootError = FastbootError;
  root.UsbError = UsbError;
})(window);
