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
};

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

const renderFilters = (config) => {
  const root = document.querySelector('#filters');
  root.replaceChildren();

  for (const [platform, label] of Object.entries(platformLabels)) {
    const url = `https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/dist/filters/${platform}.txt`;
    const subscription = new URL('abp:subscribe');
    subscription.searchParams.set('location', url);
    subscription.searchParams.set('title', `${config.title} (${label})`);

    const link = document.createElement('a');
    link.className = 'button';
    link.href = subscription.href;
    link.textContent = label;
    root.append(link);
  }
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
  const install = document.createElement('a');
  install.className = 'button primary';
  install.textContent = 'Install';
  install.target = '_blank';
  install.rel = 'noopener';
  const next = document.createElement('button');
  next.className = 'button';
  next.type = 'button';
  next.textContent = '›';
  next.title = 'Next';
  next.setAttribute('aria-label', 'Next');
  actions.append(previous, install, next);
  root.append(position, progress, name, details, actions);

  let current = Number.parseInt(sessionStorage.getItem('script-index'), 10);
  if (!Number.isInteger(current) || current < 0 || current >= scripts.length) {
    current = 0;
  }

  const show = (index) => {
    current = index;
    const script = scripts[index];
    sessionStorage.setItem('script-index', String(index));
    position.textContent = `${index + 1} of ${scripts.length}`;
    name.textContent = script.key;
    details.replaceChildren();
    addDetail(details, 'Category', script.category);
    addDetail(details, 'Target', script.target);
    addDetail(
      details,
      'Platforms',
      script.platforms
        ?.map((platform) => platformLabels[platform])
        .join(', ') || 'All',
    );
    addDetail(details, 'Recommendation', script.enabled ? 'Install' : 'Skip');
    install.href = script.url;
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

  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  show(current);
};

const showError = (error) => {
  for (const selector of ['#filters', '#userscripts']) {
    const root = document.querySelector(selector);
    root.className = 'error';
    root.textContent = error.message;
  }
};

Promise.all([loadJson('filter.json'), loadJson('userscripts.json')])
  .then(([filters, userscripts]) => {
    renderFilters(filters);
    renderUserscripts(userscripts);
  })
  .catch(showError);
