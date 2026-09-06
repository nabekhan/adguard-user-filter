import {
    mkdir,
    readFile,
    readdir,
    rename,
    rmdir,
    stat,
    writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import slugifyText from '@sindresorhus/slugify';

import { configDefinitions, websitePattern } from './config-definitions.mjs';

const root = resolve(import.meta.dirname, '..');
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

const normalizeWebsite = (value, path) => {
    if (typeof value !== 'string') {
        throw new Error(`${path} must be a string`);
    }

    const website = slugifyText(value.trim().toLowerCase());
    if (!websitePattern.test(website)) {
        throw new Error(`${path} must be a non-empty filesystem-safe label`);
    }

    return website;
};

const requireFile = (value, suffix, path) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${path} must be a non-empty string`);
    }

    if (!value.toLowerCase().endsWith(suffix)) {
        throw new Error(`${path} must end with ${suffix}`);
    }
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
    { localDirectory, localFileSuffix },
) => {
    const normalized = [];
    const originalsBySlug = new Map();
    const slugsByOriginal = new Map();
    const moves = [];

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
        const website = normalizeWebsite(value.website, `${entryPath}.website`);
        let normalizedValue = { ...value, category, website };
        if (value.file !== undefined) {
            requireFile(value.file, localFileSuffix, `${entryPath}.file`);
            const file = `${website}/${category}/${key}${localFileSuffix}`;

            if (file !== value.file) {
                moves.push({
                    source: resolveWithin(
                        localDirectory,
                        value.file,
                        `${entryPath}.file`,
                    ),
                    destination: resolveWithin(
                        localDirectory,
                        file,
                        `${entryPath}.file`,
                    ),
                    label: `${entryPath}.file`,
                });
            }

            normalizedValue = { ...normalizedValue, file };
        }

        originalsBySlug.set(key, name);
        slugsByOriginal.set(name, key);
        normalized.push([key, normalizedValue]);
    }

    const compareWithLast = (left, right, last) =>
        Number(left === last) - Number(right === last) ||
        collator.compare(left, right);
    normalized.sort((left, right) => {
        return (
            compareWithLast(left[1].website, right[1].website, 'global') ||
            compareWithLast(left[1].category, right[1].category, 'other') ||
            collator.compare(left[0], right[0])
        );
    });

    return {
        collection: Object.fromEntries(normalized),
        moves,
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

const checking = process.argv.includes('--check');
const formattingIssues = [];
const plans = [];

for (const definition of configDefinitions) {
    const { sourcePath, collectionName } = definition;
    const configPath = resolve(root, sourcePath);
    const source = await readFile(configPath, 'utf8');
    const config = JSON.parse(source);
    const { collection, moves, slugsByOriginal } = normalizeCollection(
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
    const formatted = `${JSON.stringify(
        { ...normalizedConfig, [collectionName]: collection },
        null,
        2,
    )}\n`;

    if (checking && source !== formatted) {
        formattingIssues.push(sourcePath);
    }
    plans.push({ configPath, formatted, moves });
}

if (formattingIssues.length > 0) {
    throw new Error(
        `${formattingIssues.join(', ')} must be formatted; run npm run format`,
    );
}

if (!checking) {
    await applyMoves(plans.flatMap(({ moves }) => moves));
    for (const { configPath, formatted } of plans) {
        await writeFile(configPath, formatted);
    }
    for (const { localDirectory } of configDefinitions) {
        await pruneEmptyDirectories(resolve(root, localDirectory));
    }
}
