// ==UserScript==
// @name         Nabeel's Userscript Installer
// @namespace    https://github.com/nabekhan/user-filter-scripts
// @version      0.1.0
// @description  Opens installation pages for enabled scripts in the generated config.
// @homepageURL  https://github.com/nabekhan/user-filter-scripts
// @downloadURL  https://raw.githubusercontent.com/nabekhan/user-filter-scripts/main/userscripts/userscript-installer.user.js
// @updateURL    https://raw.githubusercontent.com/nabekhan/user-filter-scripts/main/userscripts/userscript-installer.user.js
// @match        https://github.com/nabekhan/user-filter-scripts*
// @grant        GM.openInTab
// @grant        GM.xmlHttpRequest
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const rawRoot =
    'https://raw.githubusercontent.com/nabekhan/user-filter-scripts/main/';
  const configUrl = `${rawRoot}dist/userscripts.config.json`;
  const installerUrl = `${rawRoot}userscripts/userscript-installer.user.js`;

  const requestText = (url) =>
    new Promise((resolve, reject) => {
      const modernApi = typeof GM === 'object' ? GM : undefined;
      const request =
        typeof modernApi?.xmlHttpRequest === 'function'
          ? modernApi.xmlHttpRequest.bind(modernApi)
          : typeof GM_xmlhttpRequest === 'function'
            ? GM_xmlhttpRequest
            : undefined;

      if (request === undefined) {
        reject(new Error('This userscript manager cannot load the config'));
        return;
      }

      const result = request({
        method: 'GET',
        url,
        onload: (response) => {
          if (response.status < 200 || response.status >= 300) {
            reject(
              new Error(`Config request failed with status ${response.status}`),
            );
            return;
          }

          resolve(response.responseText);
        },
        onerror: () => reject(new Error('Could not load the config')),
        ontimeout: () => reject(new Error('Config request timed out')),
      });

      result?.catch?.(reject);
    });

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

  const loadScripts = async () => {
    const config = JSON.parse(await requestText(configUrl));
    return Object.entries(config.scripts ?? {})
      .filter(([, entry]) => entry?.enabled === true)
      .map(([key, entry]) => resolveSource(key, entry))
      .filter(({ url }) => url !== installerUrl);
  };

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Install userscripts';
  button.style.cssText = [
    'position: fixed',
    'right: 20px',
    'bottom: 20px',
    'z-index: 2147483647',
    'padding: 10px 14px',
    'border: 1px solid #0969da',
    'border-radius: 6px',
    'background: #0969da',
    'color: white',
    'font: 600 14px system-ui, sans-serif',
    'cursor: pointer',
    'box-shadow: 0 2px 8px rgb(0 0 0 / 20%)',
  ].join(';');

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Loading…';

    try {
      const scripts = await loadScripts();
      if (scripts.length === 0) {
        window.alert('No enabled userscripts to install.');
        return;
      }

      const names = scripts.map(({ key }) => `• ${key}`).join('\n');
      const confirmed = window.confirm(
        `Open ${scripts.length} userscript installation page${
          scripts.length === 1 ? '' : 's'
        }?\n\n${names}\n\nConfirm each installation in your userscript manager.`,
      );

      if (confirmed) {
        for (const { url } of scripts) {
          openInTab(url);
        }
      }
    } catch (error) {
      window.alert(`Could not load userscripts: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Install userscripts';
    }
  });

  document.body.append(button);
})();
