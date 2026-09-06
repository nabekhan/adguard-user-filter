// ==UserScript==
// @name         Userscript Installer
// @namespace    https://github.com/nabekhan/filters-userscripts
// @version      0.5.0
// @description  Installs enabled userscripts from the current JSON config page.
// @homepageURL  https://github.com/nabekhan/filters-userscripts
// @downloadURL  https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/tools/userscript-installer.user.js
// @updateURL    https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/userscripts/global/tools/userscript-installer.user.js
// @match        https://*/*
// @grant        GM.openInTab
// @grant        GM.registerMenuCommand
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

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

  const resolveSource = (key, entry) => {
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

    return { key, url: source.href };
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
      .filter(([, entry]) => entry?.enabled === true)
      .map(([key, entry]) => resolveSource(key, entry))
      .filter(({ key, url }) => key !== config.requires && !ownUrls.has(url));
  };

  let panel;

  const closePanel = () => {
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

    const title = document.createElement('div');
    title.textContent = `Install ${scripts.length} userscript${
      scripts.length === 1 ? '' : 's'
    }?`;
    title.style.fontWeight = '600';
    installPanel.append(title);

    const list = document.createElement('ul');
    list.style.cssText = 'margin: 8px 0; padding-left: 20px';
    for (const { key } of scripts) {
      const item = document.createElement('li');
      item.textContent = key;
      list.append(item);
    }
    installPanel.append(list);

    const actions = document.createElement('div');
    actions.style.cssText =
      'display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px';
    actions.append(
      createAction('Cancel', false, closePanel),
      createAction('Install', true, () => {
        for (const { url } of scripts) {
          openInTab(url);
        }
        closePanel();
      }),
    );
    installPanel.append(actions);
  };

  const install = async (getConfig) => {
    try {
      const scripts = loadScripts(await getConfig());
      if (scripts.length === 0) {
        showMessage('No enabled userscripts.');
        return;
      }
      showInstallPanel(scripts);
    } catch (error) {
      showMessage(`Could not load userscripts: ${error.message}`);
    }
  };

  const configFromCurrentPage = () =>
    parseConfig(document.body?.textContent ?? '');

  const installFromCurrentPage = () => install(configFromCurrentPage);

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
  button.textContent = '⇩';
  button.title = 'Install userscripts from this page';
  button.setAttribute('aria-label', button.title);
  button.style.cssText = [
    'position: fixed',
    'right: 8px',
    'bottom: 8px',
    'z-index: 2147483647',
    'width: 28px',
    'height: 28px',
    'padding: 0',
    'border: 1px solid #0969da',
    'border-radius: 50%',
    'background: #0969da',
    'color: white',
    'font: 700 16px/1 system-ui, sans-serif',
    'opacity: 0.65',
    'cursor: pointer',
    'box-shadow: 0 1px 3px rgb(0 0 0 / 25%)',
  ].join(';');
  button.addEventListener('click', () => install(() => currentPageConfig));

  document.body.append(button);
})();
