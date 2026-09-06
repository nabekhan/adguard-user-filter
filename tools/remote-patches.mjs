import { readFile } from 'node:fs/promises';

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

export const createRemotePatch = (source) => ({ source, replacements: [] });

export const remotePatchRelativePath = (target, name) =>
    `${target}/${name}.patch.mjs`;

export const serializeRemotePatch = ({ source, replacements }) => {
    const rules = replacements
        .map(
            ({ from, to }) => `
    {
        from: ${typeof from === 'string' ? JSON.stringify(from) : `/${from.source}/${from.flags}`},
        to: ${JSON.stringify(to)},
    },`,
        )
        .join('');
    return `export default {
    source: ${JSON.stringify(source)},
    replacements: [${rules}
    ],
};\n`;
};

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

    let imported;
    try {
        imported = await import(
            `data:text/javascript;charset=utf-8,${encodeURIComponent(contents)}`
        );
    } catch (error) {
        throw new Error(`${label} is invalid: ${error.message}`);
    }
    const patch = imported.default;

    if (!isObject(patch)) {
        throw new Error(`${label} must default-export an object`);
    }
    const unknownFields = Object.keys(patch).filter(
        (field) => !['source', 'replacements'].includes(field),
    );
    if (unknownFields.length > 0) {
        throw new Error(
            `${label} has unknown fields: ${unknownFields.join(', ')}`,
        );
    }
    if (!Array.isArray(patch.replacements)) {
        throw new Error(`${label}.replacements must be an array`);
    }
    if (typeof patch.source !== 'string' || patch.source.trim() === '') {
        throw new Error(`${label}.source must be a non-empty string`);
    }
    let source;
    try {
        source = new URL(patch.source);
    } catch {
        throw new Error(`${label}.source must be a valid URL`);
    }
    if (source.protocol !== 'https:') {
        throw new Error(`${label}.source must use HTTPS`);
    }

    const replacements = patch.replacements.map((replacement, index) => {
        const rulePath = `${label}.replacements.${index}`;
        if (!isObject(replacement)) {
            throw new Error(`${rulePath} must be an object`);
        }
        const unknownRuleFields = Object.keys(replacement).filter(
            (field) => !['from', 'to'].includes(field),
        );
        if (unknownRuleFields.length > 0) {
            throw new Error(
                `${rulePath} has unknown fields: ${unknownRuleFields.join(', ')}`,
            );
        }
        if (!(
            replacement.from instanceof RegExp ||
            (typeof replacement.from === 'string' && replacement.from !== '')
        )) {
            throw new Error(
                `${rulePath}.from must be a non-empty string or regular expression`,
            );
        }
        if (typeof replacement.to !== 'string') {
            throw new Error(`${rulePath}.to must be a string`);
        }
        return {
            from:
                typeof replacement.from === 'string'
                    ? replacement.from
                    : new RegExp(
                          replacement.from.source,
                          replacement.from.flags,
                      ),
            to: replacement.to,
        };
    });

    return { source: source.href, replacements };
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
        const from =
            typeof replacement.from === 'string'
                ? replacement.from
                : new RegExp(replacement.from.source, replacement.from.flags);
        const matches =
            typeof from === 'string'
                ? result.includes(from)
                : from.test(result);
        if (!matches) {
            throw new Error(
                `${label}.replacements.${index}.from did not match`,
            );
        }
        if (from instanceof RegExp) {
            from.lastIndex = 0;
        }
        result =
            typeof from === 'string'
                ? result.replaceAll(from, replacement.to)
                : result.replace(from, replacement.to);
    }
    return result;
};
