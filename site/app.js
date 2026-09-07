'use strict';

const platformLabels = {
  ios: 'iOS',
  android: 'Android',
  mac: 'Mac',
  windows: 'Windows',
  linux: 'Linux',
  safari: 'Safari',
  chromium: 'Chromium',
  firefox: 'Firefox',
  mobile: 'Mobile',
  desktop: 'Desktop',
  server: 'Server',
};
const adfilterPlatformNames = [
  'ios',
  'android',
  'mac',
  'windows',
  'linux',
  'safari',
  'chromium',
  'firefox',
];
const dnsPlatformNames = ['mobile', 'desktop', 'server'];

const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
};

const addDetail = (list, label, value) => {
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  list.append(term, description);
};

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();

  if (!copied) {
    throw new Error('Unable to copy the filter URL');
  }
};

const renderSubscriptions = (config, selector, directory, platforms) => {
  const root = document.querySelector(selector);
  root.replaceChildren();

  if (platforms.length === 0) {
    root.textContent = 'None';
    return;
  }

  for (const platform of platforms) {
    const label = platformLabels[platform];
    const url = `https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/${directory}/${platform}.txt`;
    const button = document.createElement('button');
    button.className = 'button';
    button.type = 'button';
    button.textContent = label;
    button.title = `Copy ${config.title} URL for ${label}`;
    button.setAttribute('aria-label', `Copy ${config.title} URL for ${label}`);

    let resetLabel;
    button.addEventListener('click', async () => {
      clearTimeout(resetLabel);
      try {
        await copyText(url);
        button.textContent = 'Copied!';
      } catch {
        button.textContent = 'Copy failed';
      }
      resetLabel = setTimeout(() => {
        button.textContent = label;
      }, 1500);
    });

    root.append(button);
  }
};

const configuredPlatforms = (config, supportedPlatforms) =>
  supportedPlatforms.filter((platform) =>
    Object.values(config.lists).some(
      (list) =>
        list.enabled &&
        (list.platforms?.includes(platform) ??
          !list.excludePlatforms?.includes(platform)),
    ),
  );

const describePlatforms = (entry) => {
  if (entry.platforms !== undefined) {
    return entry.platforms
      .map((platform) => platformLabels[platform])
      .join(', ');
  }
  if (entry.excludePlatforms !== undefined) {
    return `All except ${entry.excludePlatforms
      .map((platform) => platformLabels[platform])
      .join(', ')}`;
  }
  return 'All';
};

const renderUserscripts = (config) => {
  const root = document.querySelector('#userscripts');
  const scripts = Object.entries(config.scripts).map(([key, script]) => ({
    key,
    ...script,
  }));
  root.replaceChildren();

  if (scripts.length === 0) {
    root.textContent = 'None';
    return;
  }

  const position = document.createElement('div');
  position.className = 'position';

  const progress = document.createElement('nav');
  progress.className = 'progress';
  progress.setAttribute('aria-label', 'Userscripts');
  const markers = scripts.map((script, index) => {
    const marker = document.createElement('button');
    marker.className = 'marker';
    marker.type = 'button';
    marker.title = script.key;
    marker.setAttribute('aria-label', `Go to ${script.key}`);
    marker.addEventListener('click', () => show(index));
    progress.append(marker);
    return marker;
  });

  const name = document.createElement('h3');
  name.className = 'script-name';

  const details = document.createElement('dl');
  details.className = 'details';

  const actions = document.createElement('div');
  actions.className = 'actions';
  const previous = document.createElement('button');
  previous.className = 'button';
  previous.type = 'button';
  previous.textContent = '‹';
  previous.title = 'Previous';
  previous.setAttribute('aria-label', 'Previous');
  const copyUrl = document.createElement('button');
  copyUrl.className = 'button primary';
  copyUrl.type = 'button';
  copyUrl.textContent = 'Copy URL';
  const next = document.createElement('button');
  next.className = 'button';
  next.type = 'button';
  next.textContent = '›';
  next.title = 'Next';
  next.setAttribute('aria-label', 'Next');
  actions.append(previous, copyUrl, next);
  root.append(position, progress, name, details, actions);

  let current = Number.parseInt(sessionStorage.getItem('script-index'), 10);
  if (!Number.isInteger(current) || current < 0 || current >= scripts.length) {
    current = 0;
  }

  let resetCopyLabel;
  const show = (index) => {
    clearTimeout(resetCopyLabel);
    current = index;
    const script = scripts[index];
    sessionStorage.setItem('script-index', String(index));
    position.textContent = `${index + 1} of ${scripts.length}`;
    name.textContent = script.key;
    details.replaceChildren();
    addDetail(details, 'Category', script.category);
    addDetail(details, 'Target', script.target);
    addDetail(details, 'Platforms', describePlatforms(script));
    addDetail(details, 'Recommend', script.enabled ? 'Install' : 'Skip');
    copyUrl.textContent = 'Copy URL';
    copyUrl.title = `Copy ${script.key} URL`;
    copyUrl.setAttribute('aria-label', `Copy ${script.key} URL`);
    previous.disabled = index === 0;
    next.disabled = index === scripts.length - 1;
    for (const [markerIndex, marker] of markers.entries()) {
      if (markerIndex === index) {
        marker.setAttribute('aria-current', 'step');
      } else {
        marker.removeAttribute('aria-current');
      }
    }
  };

  copyUrl.addEventListener('click', async () => {
    clearTimeout(resetCopyLabel);
    try {
      await copyText(scripts[current].url);
      copyUrl.textContent = 'Copied!';
    } catch {
      copyUrl.textContent = 'Copy failed';
    }
    resetCopyLabel = setTimeout(() => {
      copyUrl.textContent = 'Copy URL';
    }, 1500);
  });
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  show(current);
};

const showError = (error) => {
  for (const selector of ['#adfilters', '#dnsfilters', '#userscripts']) {
    const root = document.querySelector(selector);
    root.className = 'error';
    root.textContent = error.message;
  }
};

Promise.all([
  loadJson('adfilters.json'),
  loadJson('dnsfilters.json'),
  loadJson('userscripts.json'),
])
  .then(([adfilters, dnsfilters, userscripts]) => {
    renderSubscriptions(
      adfilters,
      '#adfilters',
      'adfilters',
      adfilterPlatformNames,
    );
    renderSubscriptions(
      dnsfilters,
      '#dnsfilters',
      'dnsfilters',
      configuredPlatforms(dnsfilters, dnsPlatformNames),
    );
    renderUserscripts(userscripts);
  })
  .catch(showError);
