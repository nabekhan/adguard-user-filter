import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { compile } from '@adguard/filters-compiler';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(
    await readFile(resolve(root, 'filter.config.json'), 'utf8'),
);
const userscriptsConfig = JSON.parse(
    await readFile(resolve(root, 'userscripts.config.json'), 'utf8'),
);
const rawRoot =
    'https://raw.githubusercontent.com/nabekhan/user-filter-scripts/main/';
const filterId = 100001;
const enabled = Object.entries(config.lists ?? {})
    .filter(([, value]) => value?.enabled === true)
    .map(([name, value]) => ({
        name,
        file: value.file,
        url: value.url,
    }));

for (const field of ['title', 'description', 'homepage', 'expires']) {
    if (typeof config[field] !== 'string' || config[field].trim() === '') {
        throw new Error(`Missing config value: ${field}`);
    }
}

const listsDir = resolve(root, 'lists');

for (const { name, file, url } of enabled) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
        throw new Error(`Invalid list name: ${name}`);
    }

    if ((file === undefined) === (url === undefined)) {
        throw new Error(`List ${name} must specify exactly one of file or url`);
    }

    if (file !== undefined) {
        if (typeof file !== 'string' || file.trim() === '') {
            throw new Error(`Invalid local file for ${name}`);
        }

        const localPath = resolve(listsDir, file);
        const pathWithinLists = relative(listsDir, localPath);
        if (
            pathWithinLists === '' ||
            pathWithinLists === '..' ||
            pathWithinLists.startsWith(`..${sep}`) ||
            isAbsolute(pathWithinLists)
        ) {
            throw new Error(`Local file for ${name} must be inside lists/`);
        }
    }

    if (url !== undefined) {
        if (typeof url !== 'string' || url.trim() === '') {
            throw new Error(`Invalid remote list URL for ${name}`);
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            throw new Error(`Invalid remote list URL for ${name}: ${url}`);
        }

        if (parsedUrl.protocol !== 'https:') {
            throw new Error(`Remote list URL for ${name} must use HTTPS`);
        }
    }
}

const buildDir = resolve(root, '.build');
const sourceDir = resolve(buildDir, 'filters');
const platformsDir = resolve(buildDir, 'platforms');
const distDir = resolve(root, 'dist');
const template = [
    ...enabled.map(({ file, url }) =>
        file === undefined
            ? `@include ${JSON.stringify(new URL(url).href)} /stripComments`
            : `@include ${JSON.stringify(
                  relative(
                      resolve(sourceDir, 'user-filter'),
                      resolve(listsDir, file),
                  )
                      .split(sep)
                      .join('/'),
              )} /stripComments /ignoreTrustLevel`,
    ),
    '',
].join('\n');

const writeJson = (path, value) =>
    writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

const resolveConfig = (source, collectionName, localDirectory) => ({
    ...source,
    [collectionName]: Object.fromEntries(
        Object.entries(source[collectionName] ?? {}).map(([name, entry]) => {
            const { file, url, ...settings } = entry;
            if ((file === undefined) === (url === undefined)) {
                throw new Error(
                    `${collectionName}.${name} must specify exactly one of file or url`,
                );
            }

            let resolvedUrl;
            if (file !== undefined) {
                if (typeof file !== 'string' || file.trim() === '') {
                    throw new Error(`Invalid local file for ${name}`);
                }

                const directoryUrl = new URL(`${localDirectory}/`, rawRoot);
                resolvedUrl = new URL(file, directoryUrl);
                if (!resolvedUrl.href.startsWith(directoryUrl.href)) {
                    throw new Error(
                        `Local file for ${name} must be inside ${localDirectory}/`,
                    );
                }
            } else {
                if (typeof url !== 'string' || url.trim() === '') {
                    throw new Error(`Invalid remote URL for ${name}`);
                }

                resolvedUrl = new URL(url);
            }

            if (resolvedUrl.protocol !== 'https:') {
                throw new Error(`URL for ${name} must use HTTPS`);
            }

            return [name, { ...settings, url: resolvedUrl.href }];
        }),
    ),
});

await rm(buildDir, { recursive: true, force: true });
await rm(distDir, { recursive: true, force: true });
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

await mkdir(distDir, { recursive: true });
await writeJson(
    resolve(distDir, 'filter.config.json'),
    resolveConfig(config, 'lists', 'lists'),
);
await writeJson(
    resolve(distDir, 'userscripts.config.json'),
    resolveConfig(userscriptsConfig, 'scripts', 'userscripts'),
);
for (const [name, source] of Object.entries(subscriptions)) {
    await copyFile(
        resolve(platformsDir, source),
        resolve(distDir, `${name}.txt`),
    );
}
