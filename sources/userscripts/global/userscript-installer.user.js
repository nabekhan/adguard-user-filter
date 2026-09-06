// ==UserScript==
// @name         Userscript Installer
// @namespace    https://github.com/nabekhan/filters-userscripts
// @version      0.9.0
// @description  Opens userscripts from the current JSON config page.
// @homepageURL  https://github.com/nabekhan/filters-userscripts
// @downloadURL  https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/userscript-installer.user.js
// @updateURL    https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/userscript-installer.user.js
// @match        https://*/*
// @grant        GM.deleteValue
// @grant        GM.download
// @grant        GM.getValue
// @grant        GM.openInTab
// @grant        GM.registerMenuCommand
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @grant        GM_deleteValue
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const platformLabels = {
    android: 'Android',
    chromium: 'Chromium',
    firefox: 'Firefox',
    ios: 'iOS',
    linux: 'Linux',
    mac: 'Mac',
    safari: 'Safari',
    windows: 'Windows',
  };
  const archiveKey = 'userscript-installer-archive';
  const downloadHelper =
    'https://github.com/nabekhan/filters-userscripts#userscript-installer-download';
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  const parseConfig = (text) => {
    let config;
    try {
      config = JSON.parse(text);
    } catch {
      throw new Error('The config response is not valid JSON');
    }

    if (
      config === null ||
      Array.isArray(config) ||
      typeof config !== 'object'
    ) {
      throw new Error('The config JSON must be an object');
    }

    if (
      config.scripts === null ||
      Array.isArray(config.scripts) ||
      typeof config.scripts !== 'object'
    ) {
      throw new Error('The config JSON must contain a scripts object');
    }

    return config;
  };

  const openInTab = (url) => {
    const modernApi = typeof GM === 'object' ? GM : undefined;
    if (typeof modernApi?.openInTab === 'function') {
      modernApi.openInTab(url, false);
      return;
    }

    if (typeof GM_openInTab === 'function') {
      GM_openInTab(url, false);
      return;
    }

    window.open(url, '_blank', 'noopener');
  };

  const fetchText = (url, name) => {
    const modernApi = typeof GM === 'object' ? GM : undefined;
    const request =
      typeof modernApi?.xmlHttpRequest === 'function'
        ? modernApi.xmlHttpRequest.bind(modernApi)
        : typeof GM_xmlhttpRequest === 'function'
          ? GM_xmlhttpRequest
          : undefined;

    if (request === undefined) {
      return fetch(url).then((response) => {
        if (!response.ok) {
          throw new Error(`${name} returned HTTP ${response.status}`);
        }
        return response.text();
      });
    }

    return new Promise((resolve, reject) => {
      const pending = request({
        method: 'GET',
        url,
        responseType: 'text',
        onload: (response) => {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`${name} returned HTTP ${response.status}`));
            return;
          }
          const text =
            typeof response.responseText === 'string'
              ? response.responseText
              : response.response;
          if (typeof text !== 'string') {
            reject(new Error(`${name} did not return text`));
            return;
          }
          resolve(text);
        },
        onerror: () => reject(new Error(`${name} could not be downloaded`)),
        ontimeout: () => reject(new Error(`${name} timed out`)),
      });
      pending?.catch?.(reject);
    });
  };

  const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return value >>> 0;
  });

  const crc32 = (data) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
    }
    return (value ^ 0xffffffff) >>> 0;
  };

  const createZip = (files) => {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.contents);
      const checksum = crc32(data);

      const local = new Uint8Array(30);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(12, 33, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, name.length, true);
      localParts.push(local, name, data);

      const central = new Uint8Array(46);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(14, 33, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, offset, true);
      centralParts.push(central, name);

      offset += local.length + name.length + data.length;
    }

    const centralSize = centralParts.reduce(
      (size, part) => size + part.length,
      0,
    );
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);

    return new Blob([...localParts, ...centralParts, end], {
      type: 'application/zip',
    });
  };

  const downloadScripts = async (scripts) => {
    const files = await Promise.all(
      scripts.map(async (script) => ({
        name: `${script.key}.user.js`,
        contents: await fetchText(script.url, script.key),
      })),
    );
    return createZip(files);
  };

  const encodeArchive = async (archive) => {
    const bytes = new Uint8Array(await archive.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };

  const decodeArchive = (encoded) => {
    const binary = atob(encoded);
    return new Blob(
      [Uint8Array.from(binary, (character) => character.charCodeAt(0))],
      { type: 'application/zip' },
    );
  };

  const storeArchive = async (archive) => {
    const encoded = await encodeArchive(archive);
    const modernApi = typeof GM === 'object' ? GM : undefined;
    if (typeof modernApi?.setValue === 'function') {
      await modernApi.setValue(archiveKey, encoded);
    } else if (typeof GM_setValue === 'function') {
      await GM_setValue(archiveKey, encoded);
    } else {
      throw new Error('This userscript manager cannot save the ZIP');
    }
    openInTab(downloadHelper);
  };

  const takeArchive = async () => {
    const modernApi = typeof GM === 'object' ? GM : undefined;
    let encoded;
    if (typeof modernApi?.getValue === 'function') {
      encoded = await modernApi.getValue(archiveKey);
      await modernApi.deleteValue(archiveKey);
    } else if (typeof GM_getValue === 'function') {
      encoded = await GM_getValue(archiveKey);
      await GM_deleteValue(archiveKey);
    }
    return typeof encoded === 'string' ? decodeArchive(encoded) : undefined;
  };

  const downloadNatively = async (archive) => {
    const modernApi = typeof GM === 'object' ? GM : undefined;
    if (typeof modernApi?.download === 'function') {
      await modernApi.download({
        name: 'userscripts.zip',
        saveAs: true,
        url: archive,
      });
      return true;
    }
    if (typeof GM_download !== 'function') {
      return false;
    }

    const url = URL.createObjectURL(archive);
    try {
      await new Promise((resolve, reject) => {
        const pending = GM_download({
          name: 'userscripts.zip',
          onerror: reject,
          onload: resolve,
          saveAs: true,
          url,
        });
        pending?.catch?.(reject);
      });
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const saveArchive = async (archive) => {
    try {
      if (await downloadNatively(archive)) {
        return;
      }
    } catch {
      // Use the browser-page fallback below.
    }
    await storeArchive(archive);
  };

  const resolveSource = (key, entry) => {
    if (!slugPattern.test(key)) {
      throw new Error(`${key} is not a valid key`);
    }
    if (typeof entry?.url !== 'string' || entry.url.trim() === '') {
      throw new Error(`${key} does not have a URL`);
    }

    const source = new URL(entry.url);

    if (source.protocol !== 'https:') {
      throw new Error(`${key} must use HTTPS`);
    }

    if (!source.pathname.endsWith('.user.js')) {
      throw new Error(`${key} must point to a .user.js file`);
    }

    for (const field of ['category', 'target']) {
      if (typeof entry[field] !== 'string' || !slugPattern.test(entry[field])) {
        throw new Error(`${key} has an invalid ${field}`);
      }
    }
    if (typeof entry.enabled !== 'boolean') {
      throw new Error(`${key} does not have an enabled value`);
    }
    if (
      entry.platforms !== undefined &&
      (!Array.isArray(entry.platforms) ||
        entry.platforms.length === 0 ||
        entry.platforms.some(
          (platform) =>
            typeof platform !== 'string' ||
            !Object.hasOwn(platformLabels, platform),
        ) ||
        new Set(entry.platforms).size !== entry.platforms.length)
    ) {
      throw new Error(`${key} has invalid platforms`);
    }

    return {
      category: entry.category,
      enabled: entry.enabled,
      key,
      platforms: entry.platforms ?? [],
      target: entry.target,
      url: source.href,
    };
  };

  const loadScripts = (config) => {
    const modernApi = typeof GM === 'object' ? GM : undefined;
    const scriptInfo =
      modernApi?.info ?? (typeof GM_info === 'object' ? GM_info : undefined);
    const ownUrls = new Set(
      [scriptInfo?.script?.downloadURL, scriptInfo?.script?.updateURL].filter(
        (url) => typeof url === 'string' && url !== '',
      ),
    );

    return Object.entries(config.scripts ?? {})
      .map(([key, entry]) => resolveSource(key, entry))
      .filter(({ key, url }) => key !== config.requires && !ownUrls.has(url));
  };

  let downloadUrl;
  let index = 0;
  let panel;

  const revokeDownload = () => {
    if (downloadUrl !== undefined) {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = undefined;
    }
  };

  const closePanel = () => {
    revokeDownload();
    panel?.remove();
    panel = undefined;
  };

  const createPanel = () => {
    closePanel();
    panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.style.cssText = [
      'position: fixed',
      'right: 8px',
      'bottom: 44px',
      'z-index: 2147483647',
      'box-sizing: border-box',
      'width: min(300px, calc(100vw - 16px))',
      'max-height: min(400px, calc(100vh - 60px))',
      'overflow: auto',
      'padding: 12px',
      'border: 1px solid #8c959f',
      'border-radius: 8px',
      'background: Canvas',
      'color: CanvasText',
      'font: 13px/1.4 system-ui, sans-serif',
      'box-shadow: 0 4px 16px rgb(0 0 0 / 25%)',
    ].join(';');
    document.body.append(panel);
    return panel;
  };

  const createAction = (label, primary, action) => {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.textContent = label;
    actionButton.style.cssText = [
      'padding: 5px 10px',
      `border: 1px solid ${primary ? '#0969da' : '#8c959f'}`,
      'border-radius: 6px',
      `background: ${primary ? '#0969da' : 'Canvas'}`,
      `color: ${primary ? 'white' : 'CanvasText'}`,
      'font: 600 13px/1.2 system-ui, sans-serif',
      'cursor: pointer',
    ].join(';');
    actionButton.addEventListener('click', action);
    return actionButton;
  };

  const createDownloadLink = (archive) => {
    downloadUrl = URL.createObjectURL(archive);
    const saveLink = document.createElement('a');
    saveLink.href = downloadUrl;
    saveLink.download = 'userscripts.zip';
    saveLink.textContent = 'Save ZIP';
    saveLink.style.cssText = [
      'padding: 5px 10px',
      'border: 1px solid #0969da',
      'border-radius: 6px',
      'background: #0969da',
      'color: white',
      'font: 600 13px/1.2 system-ui, sans-serif',
      'text-decoration: none',
      'cursor: pointer',
    ].join(';');
    saveLink.addEventListener('click', () => {
      const savedUrl = downloadUrl;
      downloadUrl = undefined;
      setTimeout(() => URL.revokeObjectURL(savedUrl), 60_000);
    });
    return saveLink;
  };

  const createSaveButton = (archive) => {
    const saveButton = createAction('Save ZIP', true, async () => {
      saveButton.disabled = true;
      try {
        await saveArchive(archive);
      } catch (error) {
        showMessage(`Could not save userscripts: ${error.message}`);
      } finally {
        saveButton.disabled = false;
      }
    });
    return saveButton;
  };

  const showDownloadHelper = async () => {
    try {
      const archive = await takeArchive();
      if (archive === undefined) {
        showMessage('No userscripts ZIP is ready.');
        return;
      }
      const downloadPanel = createPanel();
      downloadPanel.setAttribute('aria-label', 'Download userscripts');
      const text = document.createElement('div');
      text.textContent = 'userscripts.zip is ready.';
      const actions = document.createElement('div');
      actions.style.cssText =
        'display: flex; justify-content: flex-end; margin-top: 10px';
      actions.append(createDownloadLink(archive));
      downloadPanel.append(text, actions);
    } catch (error) {
      showMessage(`Could not load userscripts: ${error.message}`);
    }
  };

  const showMessage = (message) => {
    const messagePanel = createPanel();
    const text = document.createElement('div');
    text.textContent = message;
    messagePanel.append(text);

    const actions = document.createElement('div');
    actions.style.cssText =
      'display: flex; justify-content: flex-end; margin-top: 10px';
    actions.append(createAction('Close', false, closePanel));
    messagePanel.append(actions);
  };

  const showInstallPanel = (scripts) => {
    const installPanel = createPanel();
    installPanel.setAttribute('aria-label', 'Install userscripts');
    index = Math.min(index, scripts.length - 1);

    const render = () => {
      revokeDownload();
      const script = scripts[index];
      installPanel.replaceChildren();

      const header = document.createElement('div');
      header.style.cssText =
        'display: flex; align-items: center; justify-content: space-between; gap: 8px';
      const heading = document.createElement('div');
      const headingTitle = document.createElement('div');
      headingTitle.textContent = 'Installer';
      headingTitle.style.fontWeight = '700';
      const position = document.createElement('div');
      position.textContent = `${index + 1} of ${scripts.length}`;
      position.style.cssText = 'color: GrayText; font-size: 12px';
      heading.append(headingTitle, position);

      const downloadArea = document.createElement('div');
      const downloadButton = createAction('Download all', false, async () => {
        downloadButton.disabled = true;
        downloadButton.textContent = 'Downloading…';
        try {
          const archive = await downloadScripts(scripts);
          if (panel === installPanel) {
            downloadArea.replaceChildren(createSaveButton(archive));
          }
        } catch (error) {
          if (panel === installPanel) {
            showMessage(`Could not download userscripts: ${error.message}`);
          }
        }
      });
      downloadArea.append(downloadButton);
      header.append(heading, downloadArea);
      installPanel.append(header);

      const progress = document.createElement('div');
      progress.style.cssText =
        'display: flex; gap: 4px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #8c959f';
      for (let item = 0; item < scripts.length; item += 1) {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.title = `Go to ${scripts[item].key}`;
        marker.setAttribute('aria-label', marker.title);
        marker.style.cssText = [
          'height: 3px',
          'flex: 1',
          'padding: 5px 0',
          'border: 0',
          'border-radius: 2px',
          `background: ${item === index ? 'CanvasText' : '#8c959f'}`,
          'background-clip: content-box',
          `opacity: ${item === index ? '1' : '0.45'}`,
          'cursor: pointer',
        ].join(';');
        marker.addEventListener('click', () => {
          index = item;
          render();
        });
        progress.append(marker);
      }
      installPanel.append(progress);

      const title = document.createElement('div');
      title.textContent = script.key;
      title.style.cssText =
        'margin-top: 2px; font-size: 14px; font-weight: 700; overflow-wrap: anywhere';
      installPanel.append(title);

      const details = document.createElement('dl');
      details.style.cssText = [
        'display: grid',
        'grid-template-columns: auto 1fr',
        'gap: 4px 10px',
        'margin: 10px 0 0',
      ].join(';');
      const addDetail = (label, value) => {
        const term = document.createElement('dt');
        term.textContent = label;
        term.style.fontWeight = '600';
        const description = document.createElement('dd');
        description.textContent = value;
        description.style.cssText = 'margin: 0; overflow-wrap: anywhere';
        details.append(term, description);
      };
      addDetail('Category', script.category);
      addDetail('Target', script.target);
      addDetail(
        'Platforms',
        script.platforms.length === 0
          ? 'All'
          : script.platforms
              .map((platform) => platformLabels[platform] ?? platform)
              .join(', '),
      );
      addDetail('Recommended', script.enabled ? 'Install' : 'Skip');
      installPanel.append(details);

      const actions = document.createElement('div');
      actions.style.cssText =
        'display: grid; grid-template-columns: auto 1fr auto; gap: 8px; margin-top: 12px';
      const previous = createAction('‹', false, () => {
        index -= 1;
        render();
      });
      previous.disabled = index === 0;
      previous.title = 'Previous';
      previous.setAttribute('aria-label', previous.title);
      previous.style.opacity = previous.disabled ? '0.35' : '1';

      const installButton = createAction('Install', true, () => {
        openInTab(script.url);
      });

      const next = createAction('›', false, () => {
        index += 1;
        render();
      });
      next.disabled = index === scripts.length - 1;
      next.title = 'Next';
      next.setAttribute('aria-label', next.title);
      next.style.opacity = next.disabled ? '0.35' : '1';

      actions.append(previous, installButton, next);
      installPanel.append(actions);
    };

    render();
  };

  const install = (getConfig) => {
    try {
      const scripts = loadScripts(getConfig());
      if (scripts.length === 0) {
        showMessage('No userscripts.');
        return;
      }
      showInstallPanel(scripts);
    } catch (error) {
      showMessage(`Could not load userscripts: ${error.message}`);
    }
  };

  const configFromCurrentPage = () =>
    parseConfig(document.body?.textContent ?? '');

  const toggleInstaller = (getConfig) => {
    if (panel !== undefined) {
      closePanel();
      return;
    }
    install(getConfig);
  };

  const installFromCurrentPage = () => toggleInstaller(configFromCurrentPage);

  if (
    location.hostname === 'github.com' &&
    location.pathname.replace(/\/$/, '') === '/nabekhan/filters-userscripts' &&
    location.hash === '#userscript-installer-download'
  ) {
    showDownloadHelper();
    return;
  }

  const modernApi = typeof GM === 'object' ? GM : undefined;
  const registerMenuCommand =
    typeof modernApi?.registerMenuCommand === 'function'
      ? modernApi.registerMenuCommand.bind(modernApi)
      : typeof GM_registerMenuCommand === 'function'
        ? GM_registerMenuCommand
        : undefined;

  if (registerMenuCommand !== undefined) {
    registerMenuCommand(
      'Install userscripts from this page',
      installFromCurrentPage,
    );
  }

  let currentPageConfig;
  try {
    currentPageConfig = configFromCurrentPage();
  } catch {
    currentPageConfig = undefined;
  }

  if (currentPageConfig === undefined) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Install';
  button.title = 'Install userscripts from this page';
  button.setAttribute('aria-label', button.title);
  button.style.cssText = [
    'position: fixed',
    'right: 8px',
    'bottom: 8px',
    'z-index: 2147483647',
    'height: 32px',
    'padding: 0 12px',
    'border: 1px solid #0969da',
    'border-radius: 16px',
    'background: #0969da',
    'color: white',
    'font: 700 13px/1 system-ui, sans-serif',
    'opacity: 0.8',
    'cursor: pointer',
    'box-shadow: 0 1px 3px rgb(0 0 0 / 25%)',
  ].join(';');
  button.addEventListener('click', () =>
    toggleInstaller(() => currentPageConfig),
  );

  document.body.append(button);
})();
