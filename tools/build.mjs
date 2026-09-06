import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { compile } from '@adguard/filters-compiler';

import {
    filterPlatformFlags,
    slugPattern,
    targetPattern,
} from './config-definitions.mjs';
import {
    applyRemotePatch,
    fetchRemoteText,
    readRemotePatch,
    remotePatchRelativePath,
} from './remote-patches.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(
    await readFile(resolve(root, 'dist', 'filter.json'), 'utf8'),
);
const rawFiltersUrl = new URL(
    'https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/filters/',
);
const localFiltersDir = resolve(root, 'sources', 'filters');
const allowedPlatformFlags = new Set(Object.values(filterPlatformFlags));
const filterId = 100001;
const enabled = Object.entries(config.lists ?? {})
    .filter(([, value]) => value?.enabled === true)
    .map(([name, value]) => ({
        category: value.category,
        name,
        platforms: value.platforms,
        target: value.target,
        url: value.url,
    }));

for (const field of ['title', 'description', 'homepage', 'expires']) {
    if (typeof config[field] !== 'string' || config[field].trim() === '') {
        throw new Error(`Missing config value: ${field}`);
    }
}

for (const { category, name, platforms, target, url } of enabled) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
        throw new Error(`Invalid list name: ${name}`);
    }

    if (typeof url !== 'string' || url.trim() === '') {
        throw new Error(`Invalid list URL for ${name}`);
    }
    if (!slugPattern.test(category) || !targetPattern.test(target)) {
        throw new Error(`Invalid list path for ${name}`);
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error(`Invalid list URL for ${name}: ${url}`);
    }

    if (parsedUrl.protocol !== 'https:') {
        throw new Error(`List URL for ${name} must use HTTPS`);
    }

    if (platforms !== undefined) {
        if (!Array.isArray(platforms) || platforms.length === 0) {
            throw new Error(`Platforms for ${name} must be a non-empty array`);
        }
        if (
            new Set(platforms).size !== platforms.length ||
            platforms.some((platform) => !allowedPlatformFlags.has(platform))
        ) {
            throw new Error(`Invalid platforms for ${name}`);
        }
    }
}

const buildDir = resolve(root, '.build');
const sourceDir = resolve(buildDir, 'filters');
const platformsDir = resolve(buildDir, 'platforms');
const remoteFiltersDir = resolve(buildDir, 'remote-filters');
const distFiltersDir = resolve(root, 'dist', 'filters');
const localFilterPath = (url) => {
    const source = new URL(url);
    if (
        source.origin !== rawFiltersUrl.origin ||
        !source.pathname.startsWith(rawFiltersUrl.pathname)
    ) {
        return undefined;
    }

    const path = source.pathname
        .slice(rawFiltersUrl.pathname.length)
        .split('/')
        .map(decodeURIComponent);
    const localPath = resolve(localFiltersDir, ...path);
    const pathWithinDirectory = relative(localFiltersDir, localPath);
    if (
        pathWithinDirectory === '' ||
        pathWithinDirectory === '..' ||
        pathWithinDirectory.startsWith(`..${sep}`) ||
        isAbsolute(pathWithinDirectory)
    ) {
        throw new Error(
            'Resolved local filter must be inside sources/filters/',
        );
    }

    return localPath;
};
const writeJson = (path, value) =>
    writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

await rm(buildDir, { recursive: true, force: true });
const includes = [];
for (const { category, name, platforms, target, url } of enabled) {
    const normalizedUrl = new URL(url).href;
    let localPath = localFilterPath(normalizedUrl);
    if (localPath === undefined) {
        const patchRelativePath = remotePatchRelativePath(target, name);
        const patchLabel = `sources/filters/${patchRelativePath}`;
        const patch = await readRemotePatch(
            resolve(localFiltersDir, patchRelativePath),
            patchLabel,
        );
        if (patch.source !== normalizedUrl) {
            throw new Error(`${patchLabel}.source does not match ${name}`);
        }
        if (patch.replacements.length > 0) {
            const contents = await fetchRemoteText(
                normalizedUrl,
                `Remote filter ${name}`,
            );
            localPath = resolve(
                remoteFiltersDir,
                target,
                category,
                `${name}.txt`,
            );
            await mkdir(dirname(localPath), { recursive: true });
            await writeFile(
                localPath,
                applyRemotePatch(contents, patch, patchLabel),
            );
        }
    }

    let include;
    if (localPath === undefined) {
        include = `@include ${JSON.stringify(normalizedUrl)} /stripComments`;
    } else {
        const relativePath = relative(
            resolve(sourceDir, 'user-filter'),
            localPath,
        )
            .split(sep)
            .join('/');
        include = `@include ${JSON.stringify(relativePath)} /stripComments /ignoreTrustLevel`;
    }

    includes.push(
        platforms === undefined
            ? include
            : [`!#if (${platforms.join(' || ')})`, include, '!#endif'].join(
                  '\n',
              ),
    );
}
const template = [...includes, ''].join('\n');

await mkdir(resolve(sourceDir, 'user-filter'), { recursive: true });
await writeFile(resolve(sourceDir, 'user-filter', 'template.txt'), template);
await writeFile(resolve(sourceDir, 'user-filter', 'exclude.txt'), '');
await writeJson(resolve(sourceDir, 'user-filter', 'metadata.json'), {
    filterId,
    name: config.title,
    description: config.description,
    timeAdded: 1788652800000,
    homepage: config.homepage,
    expires: config.expires,
    displayNumber: 1,
    groupId: 1,
    tags: ['purpose:other'],
    trustLevel: 'full',
});

await mkdir(resolve(buildDir, 'groups'), { recursive: true });
await mkdir(resolve(buildDir, 'tags'), { recursive: true });
await mkdir(resolve(buildDir, 'locales', 'en'), { recursive: true });
await writeJson(resolve(buildDir, 'groups', 'metadata.json'), [
    { groupId: 1, groupName: 'User filters', displayNumber: 1 },
]);
await writeJson(resolve(buildDir, 'tags', 'metadata.json'), [
    { tagId: 1, keyword: 'purpose:other' },
]);
await writeJson(resolve(buildDir, 'locales', 'en', 'filters.json'), [
    {
        [`filter.${filterId}.name`]: config.title,
        [`filter.${filterId}.description`]: config.description,
    },
]);
await writeJson(resolve(buildDir, 'locales', 'en', 'groups.json'), [
    {
        'group.1.name': 'User filters',
        'group.1.description': 'User-defined filters',
    },
]);
await writeJson(resolve(buildDir, 'locales', 'en', 'tags.json'), [
    { 'tag.1.name': 'Other', 'tag.1.description': 'User-defined rules' },
]);

await compile(
    sourceDir,
    resolve(buildDir, 'build.log'),
    resolve(buildDir, 'report.txt'),
    platformsDir,
    [filterId],
    [],
);

const subscriptions = {
    android: 'android/filters/100001.txt',
    ios: 'ios/filters/100001.txt',
    linux: 'cli/filters/100001.txt',
    mac: 'mac_v3/filters/100001.txt',
    safari: 'extension/safari/filters/100001.txt',
    chromium: 'extension/chromium-mv3/filters/100001.txt',
    firefox: 'extension/firefox/filters/100001.txt',
    windows: 'windows/filters/100001.txt',
};

await mkdir(distFiltersDir, { recursive: true });
for (const [name, source] of Object.entries(subscriptions)) {
    await copyFile(
        resolve(platformsDir, source),
        resolve(distFiltersDir, `${name}.txt`),
    );
}
