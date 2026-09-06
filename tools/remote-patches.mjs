import { readFile } from 'node:fs/promises';

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

export const emptyRemotePatch = { replacements: [] };

export const remotePatchRelativePath = (target, category, name) =>
    `${target}/${category}/${name}.patch.json`;

export const readRemotePatch = async (path, label) => {
    let contents;
    try {
        contents = await readFile(path, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`${label} is missing; run npm run format`);
        }
        throw error;
    }

    let patch;
    try {
        patch = JSON.parse(contents);
    } catch (error) {
        throw new Error(`${label} is not valid JSON: ${error.message}`);
    }

    if (!isObject(patch)) {
        throw new Error(`${label} must contain a JSON object`);
    }
    const unknownFields = Object.keys(patch).filter(
        (field) => field !== 'replacements',
    );
    if (unknownFields.length > 0) {
        throw new Error(
            `${label} has unknown fields: ${unknownFields.join(', ')}`,
        );
    }
    if (!Array.isArray(patch.replacements)) {
        throw new Error(`${label}.replacements must be an array`);
    }

    const replacements = patch.replacements.map((replacement, index) => {
        const rulePath = `${label}.replacements.${index}`;
        if (!isObject(replacement)) {
            throw new Error(`${rulePath} must be an object`);
        }
        const unknownRuleFields = Object.keys(replacement).filter(
            (field) => !['flags', 'pattern', 'replacement'].includes(field),
        );
        if (unknownRuleFields.length > 0) {
            throw new Error(
                `${rulePath} has unknown fields: ${unknownRuleFields.join(', ')}`,
            );
        }
        if (
            typeof replacement.pattern !== 'string' ||
            replacement.pattern === ''
        ) {
            throw new Error(`${rulePath}.pattern must be a non-empty string`);
        }
        if (typeof replacement.replacement !== 'string') {
            throw new Error(`${rulePath}.replacement must be a string`);
        }
        const flags = replacement.flags ?? 'g';
        if (typeof flags !== 'string') {
            throw new Error(`${rulePath}.flags must be a string`);
        }
        try {
            new RegExp(replacement.pattern, flags);
        } catch (error) {
            throw new Error(`${rulePath} is invalid: ${error.message}`);
        }

        return {
            pattern: replacement.pattern,
            flags,
            replacement: replacement.replacement,
        };
    });

    return { replacements };
};

export const fetchRemoteText = async (url, label) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${label} returned HTTP ${response.status}`);
    }
    return response.text();
};

export const applyRemotePatch = (contents, patch, label) => {
    let result = contents;
    for (const [index, replacement] of patch.replacements.entries()) {
        const regex = new RegExp(replacement.pattern, replacement.flags);
        if (!regex.test(result)) {
            throw new Error(
                `${label}.replacements.${index}.pattern did not match`,
            );
        }
        regex.lastIndex = 0;
        result = result.replace(regex, replacement.replacement);
    }
    return result;
};
