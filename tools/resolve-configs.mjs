import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import {
    configDefinitions,
    slugPattern,
    websitePattern,
} from './config-definitions.mjs';

const root = resolve(import.meta.dirname, '..');
const rawRoot =
    'https://raw.githubusercontent.com/nabekhan/user-filter-scripts/main/';
const entryFields = new Set(['category', 'enabled', 'file', 'url', 'website']);

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const requireString = (value, path) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${path} must be a non-empty string`);
    }
};

const requireHttpsUrl = (value, path) => {
    requireString(value, path);

    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${path} must be a valid URL`);
    }

    if (url.protocol !== 'https:') {
        throw new Error(`${path} must use HTTPS`);
    }

    return url;
};

const requirePlatforms = (platforms, allowedPlatforms, path) => {
    if (platforms === undefined) {
        return;
    }
    if (!Array.isArray(platforms) || platforms.length === 0) {
        throw new Error(`${path} must be a non-empty array`);
    }

    for (const [index, platform] of platforms.entries()) {
        requireString(platform, `${path}.${index}`);
        if (!allowedPlatforms.includes(platform)) {
            throw new Error(
                `${path}.${index} has unknown platform: ${platform}`,
            );
        }
    }
    if (new Set(platforms).size !== platforms.length) {
        throw new Error(`${path} cannot contain duplicates`);
    }
};

const rejectUnknownFields = (value, allowedFields, path) => {
    const unknownFields = Object.keys(value).filter(
        (field) => !allowedFields.has(field),
    );
    if (unknownFields.length > 0) {
        throw new Error(
            `${path} has unknown field${unknownFields.length === 1 ? '' : 's'}: ${unknownFields.join(', ')}`,
        );
    }
};

const readConfig = async (sourcePath) => {
    const contents = await readFile(resolve(root, sourcePath), 'utf8');
    try {
        return JSON.parse(contents);
    } catch (error) {
        throw new Error(`${sourcePath} is not valid JSON: ${error.message}`);
    }
};

const resolveConfig = async ({
    sourcePath,
    outputPath,
    collectionName,
    allowedPlatforms,
    localDirectory,
    localFileSuffix,
    platformFlags,
    requiredStringFields,
    optionalStringFields,
}) => {
    const source = await readConfig(sourcePath);
    if (!isObject(source)) {
        throw new Error(`${sourcePath} must contain a JSON object`);
    }

    const topLevelFields = new Set([
        ...requiredStringFields,
        ...optionalStringFields,
        collectionName,
    ]);
    rejectUnknownFields(source, topLevelFields, sourcePath);

    for (const field of requiredStringFields) {
        requireString(source[field], `${sourcePath}.${field}`);
    }
    for (const field of optionalStringFields) {
        if (source[field] !== undefined) {
            requireString(source[field], `${sourcePath}.${field}`);
        }
    }
    requireHttpsUrl(source.homepage, `${sourcePath}.homepage`);

    const entries = source[collectionName];
    if (!isObject(entries)) {
        throw new Error(`${sourcePath}.${collectionName} must be an object`);
    }

    if (
        source.requires !== undefined &&
        !Object.hasOwn(entries, source.requires)
    ) {
        throw new Error(
            `${sourcePath}.requires must name an entry in ${collectionName}`,
        );
    }

    const collection = {};
    const allowedEntryFields = new Set(entryFields);
    if (allowedPlatforms !== undefined) {
        allowedEntryFields.add('platforms');
    }
    for (const [name, entry] of Object.entries(entries)) {
        const entryPath = `${sourcePath}.${collectionName}.${name}`;
        if (!slugPattern.test(name)) {
            throw new Error(`${entryPath} must use lowercase kebab-case`);
        }
        if (!isObject(entry)) {
            throw new Error(`${entryPath} must be an object`);
        }
        rejectUnknownFields(entry, allowedEntryFields, entryPath);
        requireString(entry.category, `${entryPath}.category`);
        if (!slugPattern.test(entry.category)) {
            throw new Error(
                `${entryPath}.category must use lowercase kebab-case`,
            );
        }
        requireString(entry.website, `${entryPath}.website`);
        if (!websitePattern.test(entry.website)) {
            throw new Error(
                `${entryPath}.website must use a lowercase filesystem-safe label`,
            );
        }
        if (typeof entry.enabled !== 'boolean') {
            throw new Error(`${entryPath}.enabled must be a boolean`);
        }
        requirePlatforms(
            entry.platforms,
            allowedPlatforms,
            `${entryPath}.platforms`,
        );

        const { file, platforms, url, ...settings } = entry;
        if ((file === undefined) === (url === undefined)) {
            throw new Error(
                `${entryPath} must specify exactly one of file or url`,
            );
        }

        let resolvedUrl;
        if (file !== undefined) {
            requireString(file, `${entryPath}.file`);
            const filename = `${name}${localFileSuffix}`;
            const expectedFile = `${entry.website}/${entry.category}/${filename}`;
            if (file !== expectedFile) {
                throw new Error(
                    `${entryPath}.file must be organized as ${expectedFile}`,
                );
            }

            const directoryPath = resolve(root, localDirectory);
            const localPath = resolve(directoryPath, file);
            const pathWithinDirectory = relative(directoryPath, localPath);
            if (
                pathWithinDirectory === '' ||
                pathWithinDirectory === '..' ||
                pathWithinDirectory.startsWith(`..${sep}`) ||
                isAbsolute(pathWithinDirectory)
            ) {
                throw new Error(
                    `${entryPath}.file must be inside ${localDirectory}/`,
                );
            }

            let fileStatus;
            try {
                fileStatus = await stat(localPath);
            } catch {
                throw new Error(`${entryPath}.file does not exist`);
            }
            if (!fileStatus.isFile()) {
                throw new Error(`${entryPath}.file must point to a file`);
            }

            const encodedPath = pathWithinDirectory
                .split(sep)
                .map(encodeURIComponent)
                .join('/');
            resolvedUrl = new URL(`${localDirectory}/${encodedPath}`, rawRoot);
        } else {
            resolvedUrl = requireHttpsUrl(url, `${entryPath}.url`);
        }

        if (
            collectionName === 'scripts' &&
            !resolvedUrl.pathname.endsWith('.user.js')
        ) {
            throw new Error(`${entryPath} must point to a .user.js file`);
        }

        collection[name] = {
            ...settings,
            ...(platforms === undefined
                ? {}
                : {
                      platforms: platforms.map((platform) =>
                          platformFlags === undefined
                              ? platform
                              : platformFlags[platform],
                      ),
                  }),
            url: resolvedUrl.href,
        };
    }

    return {
        outputPath,
        value: { ...source, [collectionName]: collection },
    };
};

const outputs = [];
for (const definition of configDefinitions) {
    outputs.push(await resolveConfig(definition));
}

const distDir = resolve(root, 'dist');
for (const { outputPath, value } of outputs) {
    const destination = resolve(distDir, outputPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`);
}
