import {
    mkdir,
    readFile,
    readdir,
    rename,
    rmdir,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import slugifyText from '@sindresorhus/slugify';
import {
    format as formatWithPrettier,
    resolveConfig as resolvePrettierConfig,
} from 'prettier';

import { configDefinitions, targetPattern } from './config-definitions.mjs';
import {
    createRemotePatch,
    readRemotePatch,
    remotePatchRelativePath,
    serializeRemotePatch,
} from './remote-patches.mjs';

const root = resolve(import.meta.dirname, '..');
const formatFile = async (source, path, parser) =>
    formatWithPrettier(source, {
        ...((await resolvePrettierConfig(path)) ?? {}),
        filepath: path,
        parser,
    });
const collator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base',
});

const normalizeSlug = (value, path) => {
    if (typeof value !== 'string') {
        throw new Error(`${path} must be a string`);
    }

    const slug = slugifyText(value);
    if (slug === '') {
        throw new Error(`${path} cannot be converted to a slug`);
    }

    return slug;
};

const normalizeTarget = (value, path) => {
    if (typeof value !== 'string') {
        throw new Error(`${path} must be a string`);
    }

    const target = slugifyText(value.trim().toLowerCase());
    if (!targetPattern.test(target)) {
        throw new Error(`${path} must be a non-empty filesystem-safe label`);
    }

    return target;
};

const classifySource = (value, suffix, path) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${path} must be a non-empty string`);
    }

    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
        let url;
        try {
            url = new URL(value);
        } catch {
            throw new Error(`${path} must be a valid URL or local path`);
        }
        if (url.protocol !== 'https:') {
            throw new Error(`${path} URL must use HTTPS`);
        }
        return { local: false, value };
    }

    if (!value.toLowerCase().endsWith(suffix)) {
        throw new Error(`${path} must end with ${suffix}`);
    }

    return { local: true, value };
};

const normalizePlatforms = (value, allowedPlatforms, path) => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${path} must be a non-empty array`);
    }
    if (allowedPlatforms === undefined) {
        throw new Error(`${path} is not supported by this config`);
    }

    const platforms = value.map((platform, index) =>
        normalizeSlug(platform, `${path}.${index}`),
    );
    const unknown = platforms.filter(
        (platform) => !allowedPlatforms.includes(platform),
    );
    if (unknown.length > 0) {
        throw new Error(`${path} has unknown values: ${unknown.join(', ')}`);
    }
    if (new Set(platforms).size !== platforms.length) {
        throw new Error(`${path} cannot contain duplicates`);
    }

    return platforms.sort(collator.compare);
};

const resolveWithin = (directory, path, label) => {
    const directoryPath = resolve(root, directory);
    const absolutePath = resolve(directoryPath, path);
    const pathWithinDirectory = relative(directoryPath, absolutePath);
    if (
        pathWithinDirectory === '' ||
        pathWithinDirectory === '..' ||
        pathWithinDirectory.startsWith(`..${sep}`) ||
        isAbsolute(pathWithinDirectory)
    ) {
        throw new Error(`${label} must be inside ${directory}/`);
    }

    return absolutePath;
};

const normalizeCollection = (
    entries,
    path,
    { allowedPlatforms, localDirectory, localFileSuffix },
) => {
    const normalized = [];
    const originalsBySlug = new Map();
    const slugsByOriginal = new Map();
    const localFiles = [];
    const moves = [];
    const remotePatches = [];

    for (const [name, value] of Object.entries(entries)) {
        const key = normalizeSlug(name, `${path} entry name`);
        if (originalsBySlug.has(key)) {
            throw new Error(
                `${path}.${name} conflicts with ${path}.${originalsBySlug.get(key)} after formatting`,
            );
        }
        if (
            value === null ||
            typeof value !== 'object' ||
            Array.isArray(value)
        ) {
            throw new Error(`${path}.${name} must be an object`);
        }

        const entryPath = `${path}.${name}`;
        const category = normalizeSlug(value.category, `${entryPath}.category`);
        const target = normalizeTarget(value.target, `${entryPath}.target`);
        const source = classifySource(
            value.source,
            localFileSuffix,
            `${entryPath}.source`,
        );
        const {
            category: ignoredCategory,
            enabled,
            platforms: ignoredPlatforms,
            source: ignoredSource,
            target: ignoredTarget,
            ...settings
        } = value;
        const platforms =
            value.platforms === undefined
                ? undefined
                : normalizePlatforms(
                      value.platforms,
                      allowedPlatforms,
                      `${entryPath}.platforms`,
                  );
        let normalizedSource = source.value;
        if (source.local) {
            normalizedSource = `${target}/${key}${localFileSuffix}`;
            localFiles.push(
                resolveWithin(
                    localDirectory,
                    normalizedSource,
                    `${entryPath}.source`,
                ),
            );

            if (normalizedSource !== source.value) {
                moves.push({
                    source: resolveWithin(
                        localDirectory,
                        source.value,
                        `${entryPath}.source`,
                    ),
                    destination: resolveWithin(
                        localDirectory,
                        normalizedSource,
                        `${entryPath}.source`,
                    ),
                    label: `${entryPath}.source`,
                });
            }
        } else {
            remotePatches.push({
                path: resolveWithin(
                    localDirectory,
                    remotePatchRelativePath(target, key),
                    `${entryPath} patch`,
                ),
                label: `${localDirectory}/${remotePatchRelativePath(target, key)}`,
                source: source.value,
            });
        }
        const normalizedValue = {
            category,
            enabled,
            ...(platforms === undefined ? {} : { platforms }),
            ...settings,
            target,
            source: normalizedSource,
        };

        originalsBySlug.set(key, name);
        slugsByOriginal.set(name, key);
        normalized.push([key, normalizedValue]);
    }

    const compareWithLast = (left, right, last) =>
        Number(left === last) - Number(right === last) ||
        collator.compare(left, right);
    normalized.sort((left, right) => {
        return (
            compareWithLast(left[1].target, right[1].target, 'global') ||
            compareWithLast(left[1].category, right[1].category, 'other') ||
            collator.compare(left[0], right[0])
        );
    });

    return {
        collection: Object.fromEntries(normalized),
        localFiles,
        moves,
        remotePatches,
        slugsByOriginal,
    };
};

const fileStatus = async (path) => {
    try {
        return await stat(path);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
};

const applyMoves = async (moves) => {
    const destinations = new Set();
    const pending = [];

    for (const move of moves) {
        if (destinations.has(move.destination)) {
            throw new Error(
                `Multiple local files would move to ${move.destination}`,
            );
        }
        destinations.add(move.destination);

        if (move.source === move.destination) {
            continue;
        }

        const [sourceStatus, destinationStatus] = await Promise.all([
            fileStatus(move.source),
            fileStatus(move.destination),
        ]);
        if (sourceStatus === undefined) {
            if (destinationStatus !== undefined && destinationStatus.isFile()) {
                continue;
            }
            throw new Error(`${move.label} does not exist`);
        }
        if (!sourceStatus.isFile()) {
            throw new Error(`${move.label} must point to a file`);
        }
        if (destinationStatus !== undefined) {
            throw new Error(`${move.destination} already exists`);
        }

        pending.push(move);
    }

    for (const { source, destination } of pending) {
        await mkdir(dirname(destination), { recursive: true });
        await rename(source, destination);
    }
};

const pruneEmptyDirectories = async (directory, keep = directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            await pruneEmptyDirectories(resolve(directory, entry.name), keep);
        }
    }

    if (directory !== keep && (await readdir(directory)).length === 0) {
        await rmdir(directory);
    }
};

const findFiles = async (directory, matches) => {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await findFiles(path, matches)));
        } else if (entry.isFile() && matches(entry.name)) {
            files.push(path);
        }
    }
    return files;
};

const confirmLocalRemoval = async (paths) => {
    console.warn('Local files not listed in config:');
    for (const path of paths) {
        console.warn(`  ${relative(root, path)}`);
    }

    if (process.argv.includes('--prune-local')) {
        console.warn('Removing unlisted local files.');
        return;
    }
    if (!process.stdin.isTTY) {
        throw new Error(
            'Local files were not removed; run npm run format:prune',
        );
    }

    const prompt = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await prompt.question('Remove these files? [y/N] ');
    prompt.close();
    if (!/^y(?:es)?$/i.test(answer.trim())) {
        throw new Error('Local files were not removed');
    }
};

const checking = process.argv.includes('--check');
const formattingIssues = [];
const missingRemotePatches = [];
const remotePatchFormats = [];
const plans = [];

for (const definition of configDefinitions) {
    const { sourcePath, collectionName } = definition;
    const configPath = resolve(root, sourcePath);
    const source = await readFile(configPath, 'utf8');
    const config = JSON.parse(source);
    const { collection, localFiles, moves, remotePatches, slugsByOriginal } =
        normalizeCollection(
            config[collectionName] ?? {},
            `${sourcePath}.${collectionName}`,
            definition,
        );
    const normalizedConfig = { ...config };
    if (typeof config.requires === 'string') {
        normalizedConfig.requires =
            slugsByOriginal.get(config.requires) ??
            normalizeSlug(config.requires, `${sourcePath}.requires`);
    }
    const formatted = await formatFile(
        JSON.stringify(
            { ...normalizedConfig, [collectionName]: collection },
            null,
            2,
        ),
        configPath,
        'json',
    );

    if (checking && source !== formatted) {
        formattingIssues.push(sourcePath);
    }
    for (const remotePatch of remotePatches) {
        const status = await fileStatus(remotePatch.path);
        if (status === undefined) {
            missingRemotePatches.push(remotePatch);
        } else if (!status.isFile()) {
            throw new Error(`${remotePatch.label} must be a file`);
        } else {
            const patch = await readRemotePatch(
                remotePatch.path,
                remotePatch.label,
            );
            const formatted = await formatFile(
                serializeRemotePatch({
                    source: remotePatch.source,
                    replacements: patch.replacements,
                }),
                remotePatch.path,
                'babel',
            );
            const current = await readFile(remotePatch.path, 'utf8');
            if (checking && current !== formatted) {
                formattingIssues.push(remotePatch.label);
            }
            remotePatchFormats.push({ path: remotePatch.path, formatted });
        }
    }
    plans.push({ configPath, formatted, localFiles, moves, remotePatches });
}

const expectedRemotePatches = new Set(
    plans.flatMap(({ remotePatches }) => remotePatches.map(({ path }) => path)),
);
const existingRemotePatches = (
    await Promise.all(
        configDefinitions.map(({ localDirectory }) =>
            findFiles(
                resolve(root, localDirectory),
                (name) =>
                    name.endsWith('.patch.json') || name.endsWith('.patch.mjs'),
            ),
        ),
    )
).flat();
const obsoleteRemotePatches = existingRemotePatches.filter(
    (path) => !expectedRemotePatches.has(path),
);
const expectedLocalFiles = new Set(
    plans.flatMap(({ localFiles }) => localFiles),
);
const movingLocalFiles = new Set(
    plans.flatMap(({ moves }) => moves.map(({ source }) => source)),
);
const localMovesByDestination = new Map(
    plans.flatMap(({ moves }) => moves.map((move) => [move.destination, move])),
);
const missingLocalFiles = [];
for (const path of expectedLocalFiles) {
    const status = await fileStatus(path);
    if (status !== undefined) {
        if (!status.isFile()) {
            throw new Error(`${relative(root, path)} must be a file`);
        }
        continue;
    }

    const move = localMovesByDestination.get(path);
    const sourceStatus =
        move === undefined ? undefined : await fileStatus(move.source);
    if (sourceStatus === undefined) {
        missingLocalFiles.push(path);
    } else if (!sourceStatus.isFile()) {
        throw new Error(`${relative(root, move.source)} must be a file`);
    }
}
const existingLocalFiles = (
    await Promise.all(
        configDefinitions.map(({ localDirectory, localFileSuffix }) =>
            findFiles(resolve(root, localDirectory), (name) =>
                name.toLowerCase().endsWith(localFileSuffix),
            ),
        ),
    )
).flat();
const obsoleteLocalFiles = existingLocalFiles.filter(
    (path) => !expectedLocalFiles.has(path) && !movingLocalFiles.has(path),
);

if (formattingIssues.length > 0) {
    throw new Error(
        `${formattingIssues.join(', ')} must be formatted; run npm run format`,
    );
}
if (missingLocalFiles.length > 0) {
    throw new Error(
        `${missingLocalFiles.map((path) => relative(root, path)).join(', ')} listed in config but missing`,
    );
}
if (checking && missingRemotePatches.length > 0) {
    throw new Error(
        `${missingRemotePatches.map(({ label }) => label).join(', ')} missing; run npm run format`,
    );
}
if (checking && obsoleteRemotePatches.length > 0) {
    throw new Error(
        `${obsoleteRemotePatches.map((path) => relative(root, path)).join(', ')} obsolete; run npm run format`,
    );
}
if (checking && obsoleteLocalFiles.length > 0) {
    throw new Error(
        `${obsoleteLocalFiles.map((path) => relative(root, path)).join(', ')} not listed in config`,
    );
}

if (!checking) {
    if (obsoleteLocalFiles.length > 0) {
        await confirmLocalRemoval(obsoleteLocalFiles);
    }
    await applyMoves(plans.flatMap(({ moves }) => moves));
    for (const { path, source } of missingRemotePatches) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, serializeRemotePatch(createRemotePatch(source)));
    }
    for (const { configPath, formatted } of plans) {
        await writeFile(configPath, formatted);
    }
    for (const { path, formatted } of remotePatchFormats) {
        await writeFile(path, formatted);
    }
    for (const path of obsoleteRemotePatches) {
        await unlink(path);
    }
    for (const path of obsoleteLocalFiles) {
        await unlink(path);
    }
    for (const { localDirectory } of configDefinitions) {
        await pruneEmptyDirectories(resolve(root, localDirectory));
    }
}
