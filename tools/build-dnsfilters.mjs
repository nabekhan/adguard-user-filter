import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import compileHostlist from '@adguard/hostlist-compiler';

import {
    dnsPlatformNames,
    slugPattern,
    targetPattern,
} from './config-definitions.mjs';
import {
    applyRemotePatch,
    fetchRemoteText,
    readRemotePatch,
    remotePatchRelativePath,
} from './remote-patches.mjs';
import { createSubscription } from './subscription-metadata.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(
    await readFile(resolve(root, 'dist', 'dnsfilters.json'), 'utf8'),
);
const rawFiltersUrl = new URL(
    'https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/sources/dnsfilters/',
);
const localFiltersDir = resolve(root, 'sources', 'dnsfilters');
const allowedPlatforms = new Set(dnsPlatformNames);
const platformLabels = {
    mobile: 'Mobile',
    desktop: 'Desktop',
};
const enabled = Object.entries(config.lists ?? {})
    .filter(([, value]) => value?.enabled === true)
    .map(([name, value]) => ({ name, ...value }));

for (const field of ['title', 'description', 'homepage', 'expires']) {
    if (typeof config[field] !== 'string' || config[field].trim() === '') {
        throw new Error(`Missing DNS filter config value: ${field}`);
    }
}

const validatePlatforms = (platforms, field, name) => {
    if (platforms === undefined) {
        return;
    }
    if (!Array.isArray(platforms) || platforms.length === 0) {
        throw new Error(`${field} for ${name} must be a non-empty array`);
    }
    if (
        new Set(platforms).size !== platforms.length ||
        platforms.some((platform) => !allowedPlatforms.has(platform))
    ) {
        throw new Error(`Invalid ${field} for ${name}`);
    }
};

for (const {
    category,
    excludePlatforms,
    name,
    platforms,
    target,
    url,
} of enabled) {
    if (!slugPattern.test(name)) {
        throw new Error(`Invalid DNS list name: ${name}`);
    }
    if (!slugPattern.test(category) || !targetPattern.test(target)) {
        throw new Error(`Invalid DNS list path for ${name}`);
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error(`Invalid DNS list URL for ${name}: ${url}`);
    }
    if (parsedUrl.protocol !== 'https:') {
        throw new Error(`DNS list URL for ${name} must use HTTPS`);
    }
    validatePlatforms(platforms, 'platforms', name);
    validatePlatforms(excludePlatforms, 'excludePlatforms', name);
    if (platforms !== undefined && excludePlatforms !== undefined) {
        throw new Error(
            `${name} cannot define both platforms and excludePlatforms`,
        );
    }
}

const buildDir = resolve(root, '.build', 'dnsfilters');
const preparedFiltersDir = resolve(buildDir, 'sources');
const distFiltersDir = resolve(root, 'dist', 'dnsfilters');
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
            'Resolved local filter must be inside sources/dnsfilters/',
        );
    }

    return localPath;
};

await rm(buildDir, { recursive: true, force: true });
const prepared = [];
for (const entry of enabled) {
    const normalizedUrl = new URL(entry.url).href;
    let source = localFilterPath(normalizedUrl);
    if (source === undefined) {
        const patchRelativePath = remotePatchRelativePath(
            entry.target,
            entry.name,
        );
        const patchLabel = `sources/dnsfilters/${patchRelativePath}`;
        const patch = await readRemotePatch(
            resolve(localFiltersDir, patchRelativePath),
            patchLabel,
        );
        if (patch.source !== normalizedUrl) {
            throw new Error(
                `${patchLabel}.source does not match ${entry.name}`,
            );
        }

        const contents = await fetchRemoteText(
            normalizedUrl,
            `Remote DNS filter ${entry.name}`,
        );
        source = resolve(
            preparedFiltersDir,
            entry.target,
            entry.category,
            `${entry.name}.txt`,
        );
        await mkdir(dirname(source), { recursive: true });
        await writeFile(source, applyRemotePatch(contents, patch, patchLabel));
    }
    prepared.push({ ...entry, source });
}

const appliesToPlatform = (entry, platform) => {
    if (entry.platforms !== undefined) {
        return entry.platforms.includes(platform);
    }
    if (entry.excludePlatforms !== undefined) {
        return !entry.excludePlatforms.includes(platform);
    }
    return true;
};

await rm(distFiltersDir, { recursive: true, force: true });
await mkdir(distFiltersDir, { recursive: true });
for (const platform of dnsPlatformNames) {
    const platformEntries = prepared.filter((entry) =>
        appliesToPlatform(entry, platform),
    );
    if (platformEntries.length === 0) {
        continue;
    }

    const compiled = await compileHostlist({
        name: config.title,
        description: config.description,
        homepage: config.homepage,
        version: '1.0.0.0',
        sources: platformEntries.map(({ name, source }) => ({
            name,
            source,
            type: 'adblock',
        })),
        transformations: [
            'ConvertToAscii',
            'TrimLines',
            'RemoveComments',
            'Validate',
            'Deduplicate',
            'RemoveEmptyLines',
        ],
    });
    const rules = compiled.filter((line) => {
        const trimmed = line.trim();
        return (
            trimmed !== '' &&
            !trimmed.startsWith('!') &&
            !trimmed.startsWith('#')
        );
    });

    await writeFile(
        resolve(distFiltersDir, `${platform}.txt`),
        createSubscription({
            description: config.description,
            expires: config.expires,
            homepage: config.homepage,
            platform: platformLabels[platform],
            rules,
            title: config.title,
        }),
    );
}
