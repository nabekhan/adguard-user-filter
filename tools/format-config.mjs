import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const configs = [
    ['filter.config.json', 'lists'],
    ['userscripts.config.json', 'scripts'],
];
const collator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base',
});

const category = ([, value]) => {
    if (value?.category === undefined) {
        return '\uffff';
    }

    if (typeof value.category !== 'string') {
        throw new Error('List categories must be strings');
    }

    return value.category;
};

const checking = process.argv.includes('--check');
const unsorted = [];

for (const [filename, collectionName] of configs) {
    const configPath = resolve(root, filename);
    const source = await readFile(configPath, 'utf8');
    const config = JSON.parse(source);
    const collection = Object.fromEntries(
        Object.entries(config[collectionName] ?? {}).sort(
            (left, right) =>
                collator.compare(category(left), category(right)) ||
                collator.compare(left[0], right[0]),
        ),
    );
    const formatted = `${JSON.stringify(
        { ...config, [collectionName]: collection },
        null,
        2,
    )}\n`;

    if (checking) {
        if (source !== formatted) {
            unsorted.push(filename);
        }
    } else {
        await writeFile(configPath, formatted);
    }
}

if (unsorted.length > 0) {
    throw new Error(
        `${unsorted.join(', ')} must be sorted; run npm run format`,
    );
}
