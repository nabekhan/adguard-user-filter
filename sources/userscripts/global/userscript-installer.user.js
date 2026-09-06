// ==UserScript==
// @name         Userscript Installer
// @namespace    https://github.com/nabekhan/filters-userscripts
// @version      0.9.8
// @description  Opens userscripts from the current JSON config page.
// @homepageURL  https://github.com/nabekhan/filters-userscripts
// @downloadURL  https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/userscript-installer.user.js
// @updateURL    https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/userscript-installer.user.js
// @match        https://*/*
// @inject-into  content
// @grant        GM.openInTab
// @grant        GM.registerMenuCommand
// @grant        GM.xmlHttpRequest
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-end
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
      scripts.map(async (script) => {
        const contents = await fetchText(script.url, script.key);
        const name =
          contents.match(/^\/\/\s*@name\s+(.+?)\s*$/m)?.[1] ?? script.key;
        const filename = name
          .trim()
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
          .replace(/[. ]+$/g, '');
        return {
          contents,
          name: `${filename || script.key}.user.js`,
        };
      }),
    );
    return createZip(files);
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

  const installerId = 'userscript-installer';
  const itemId = (index) => `${installerId}-item-${index + 1}`;

  const actionStyles = (primary) =>
    [
      'display: block',
      'box-sizing: border-box',
      'padding: 5px 10px',
      `border: 1px solid ${primary ? '#0969da' : '#8c959f'}`,
      'border-radius: 6px',
      `background: ${primary ? '#0969da' : 'Canvas'}`,
      `color: ${primary ? 'white' : 'CanvasText'}`,
      'font: 600 13px/1.2 system-ui, sans-serif',
      'text-align: center',
      'text-decoration: none',
      'cursor: pointer',
    ].join(';');

  const addDetail = (details, label, value) => {
    const term = document.createElement('dt');
    term.textContent = label;
    term.style.fontWeight = '600';
    const description = document.createElement('dd');
    description.textContent = value;
    description.style.cssText = 'margin: 0; overflow-wrap: anywhere';
    details.append(term, description);
  };

  const createNavigation = (label, title, destination) => {
    const control = document.createElement(destination ? 'a' : 'span');
    control.textContent = label;
    control.title = title;
    control.setAttribute('aria-label', title);
    control.style.cssText = actionStyles(false);
    if (destination === undefined) {
      control.setAttribute('aria-disabled', 'true');
      control.style.opacity = '0.35';
    } else {
      control.href = `#${destination}`;
    }
    return control;
  };

  const createInstaller = (scripts) => {
    const root = document.createElement('details');
    root.id = installerId;
    root.style.cssText = [
      'position: fixed',
      'right: 8px',
      'bottom: 8px',
      'z-index: 2147483647',
      'color: CanvasText',
      'font: 13px/1.4 system-ui, sans-serif',
    ].join(';');

    const summary = document.createElement('summary');
    summary.textContent = 'Install';
    summary.title = 'Install userscripts from this page';
    summary.setAttribute('aria-label', summary.title);
    summary.style.cssText = [
      'display: flex',
      'align-items: center',
      'height: 32px',
      'padding: 0 12px',
      'border: 1px solid #0969da',
      'border-radius: 16px',
      'background: #0969da',
      'color: white',
      'font: 700 13px/1 system-ui, sans-serif',
      'opacity: 0.8',
      'touch-action: manipulation',
      '-webkit-tap-highlight-color: transparent',
      'cursor: pointer',
      'box-shadow: 0 1px 3px rgb(0 0 0 / 25%)',
      'list-style: none',
    ].join(';');
    root.append(summary);

    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Install userscripts');
    panel.style.cssText = [
      'position: absolute',
      'right: 0',
      'bottom: 40px',
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

    if (scripts.length === 0) {
      panel.textContent = 'No userscripts.';
      root.append(panel);
      return root;
    }

    const header = document.createElement('div');
    header.style.cssText =
      'display: flex; align-items: center; justify-content: space-between; gap: 8px';
    const heading = document.createElement('div');
    const headingTitle = document.createElement('div');
    headingTitle.textContent = 'Installer';
    headingTitle.style.fontWeight = '700';
    heading.append(headingTitle);
    for (let index = 0; index < scripts.length; index += 1) {
      const position = document.createElement('div');
      position.className = 'userscript-installer-position';
      position.dataset.index = String(index);
      position.textContent = `${index + 1} of ${scripts.length}`;
      position.style.cssText =
        'display: none; color: GrayText; font-size: 12px';
      heading.append(position);
    }

    const downloadLink = document.createElement('a');
    downloadLink.textContent = 'Download all';
    downloadLink.title = 'Preparing ZIP…';
    downloadLink.setAttribute('aria-disabled', 'true');
    downloadLink.style.cssText = `${actionStyles(false)}; opacity: 0.5; pointer-events: none`;
    header.append(heading, downloadLink);
    panel.append(header);

    const progress = document.createElement('div');
    progress.style.cssText =
      'display: flex; gap: 4px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #8c959f';
    for (let index = 0; index < scripts.length; index += 1) {
      const marker = document.createElement('a');
      marker.className = 'userscript-installer-marker';
      marker.dataset.index = String(index);
      marker.href = `#${itemId(index)}`;
      marker.title = `Go to ${scripts[index].key}`;
      marker.setAttribute('aria-label', marker.title);
      marker.style.cssText = [
        'height: 13px',
        'flex: 1',
        'padding: 5px 0',
        'border: 0',
        'background: transparent',
        'cursor: pointer',
      ].join(';');
      const dash = document.createElement('span');
      dash.style.cssText = [
        'display: block',
        'width: 100%',
        'height: 3px',
        'border-radius: 2px',
        'background: #8c959f',
        'opacity: 0.45',
        'pointer-events: none',
      ].join(';');
      marker.append(dash);
      progress.append(marker);
    }
    panel.append(progress);

    for (let index = 0; index < scripts.length; index += 1) {
      const script = scripts[index];
      const card = document.createElement('section');
      card.id = itemId(index);
      card.className = 'userscript-installer-card';
      card.dataset.index = String(index);
      card.style.display = 'none';

      const title = document.createElement('div');
      title.textContent = script.key;
      title.style.cssText =
        'margin-top: 2px; font-size: 14px; font-weight: 700; overflow-wrap: anywhere';
      card.append(title);

      const details = document.createElement('dl');
      details.style.cssText = [
        'display: grid',
        'grid-template-columns: auto 1fr',
        'gap: 4px 10px',
        'margin: 10px 0 0',
      ].join(';');
      addDetail(details, 'Category', script.category);
      addDetail(details, 'Target', script.target);
      addDetail(
        details,
        'Platforms',
        script.platforms.length === 0
          ? 'All'
          : script.platforms
              .map((platform) => platformLabels[platform] ?? platform)
              .join(', '),
      );
      addDetail(details, 'Recommendation', script.enabled ? 'Install' : 'Skip');
      card.append(details);

      const actions = document.createElement('div');
      actions.style.cssText =
        'display: grid; grid-template-columns: auto 1fr auto; gap: 8px; margin-top: 12px';
      const previous = createNavigation(
        '‹',
        'Previous',
        index === 0 ? undefined : itemId(index - 1),
      );

      const installLink = document.createElement('a');
      installLink.href = script.url;
      installLink.textContent = 'Install';
      installLink.style.cssText = actionStyles(true);
      installLink.addEventListener('click', (event) => {
        event.preventDefault();
        openInTab(script.url);
      });

      const next = createNavigation(
        '›',
        'Next',
        index === scripts.length - 1 ? undefined : itemId(index + 1),
      );
      actions.append(previous, installLink, next);
      card.append(actions);
      panel.append(card);
    }

    const selectors = [];
    for (let index = 0; index < scripts.length; index += 1) {
      const target = `#${itemId(index)}:target`;
      selectors.push(
        `#${installerId}:has(${target}) .userscript-installer-position[data-index="${index}"] { display: block !important; }`,
        `#${installerId}:has(${target}) .userscript-installer-marker[data-index="${index}"] span { background: CanvasText !important; opacity: 1 !important; }`,
      );
    }
    const style = document.createElement('style');
    style.textContent = `
      #${installerId} > summary::-webkit-details-marker { display: none; }
      #${installerId}:not(:has(.userscript-installer-card:target)) .userscript-installer-position[data-index="0"] { display: block !important; }
      #${installerId}:not(:has(.userscript-installer-card:target)) .userscript-installer-marker[data-index="0"] span { background: CanvasText !important; opacity: 1 !important; }
      #${installerId}:not(:has(.userscript-installer-card:target)) .userscript-installer-card[data-index="0"],
      #${installerId} .userscript-installer-card:target { display: block !important; }
      ${selectors.join('\n')}
    `;
    root.append(panel, style);

    downloadScripts(scripts)
      .then((archive) => {
        downloadLink.href = URL.createObjectURL(archive);
        downloadLink.download = 'userscripts.zip';
        downloadLink.title = 'Save ZIP';
        downloadLink.removeAttribute('aria-disabled');
        downloadLink.style.opacity = '1';
        downloadLink.style.pointerEvents = 'auto';
      })
      .catch((error) => {
        downloadLink.textContent = 'Download unavailable';
        downloadLink.title = error.message;
      });

    return root;
  };

  const existingInstaller = document.getElementById(installerId);
  if (existingInstaller !== null) {
    existingInstaller.open = location.hash.startsWith(`#${installerId}-item-`);
    return;
  }

  let scripts;
  try {
    scripts = loadScripts(parseConfig(document.body?.textContent ?? ''));
  } catch {
    return;
  }

  const installer = createInstaller(scripts);
  installer.open = location.hash.startsWith(`#${installerId}-item-`);
  document.body.append(installer);

  const modernApi = typeof GM === 'object' ? GM : undefined;
  const registerMenuCommand =
    typeof modernApi?.registerMenuCommand === 'function'
      ? modernApi.registerMenuCommand.bind(modernApi)
      : typeof GM_registerMenuCommand === 'function'
        ? GM_registerMenuCommand
        : undefined;
  registerMenuCommand?.('Install userscripts from this page', () => {
    installer.open = !installer.open;
  });
})();
