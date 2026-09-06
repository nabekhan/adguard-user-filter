import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const configPath = resolve(import.meta.dirname, '..', 'filter.config.json');
const source = await readFile(configPath, 'utf8');
const config = JSON.parse(source);
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

const lists = Object.fromEntries(
    Object.entries(config.lists ?? {}).sort(
        (left, right) =>
            collator.compare(category(left), category(right)) ||
            collator.compare(left[0], right[0]),
    ),
);
const formatted = `${JSON.stringify({ ...config, lists }, null, 2)}\n`;

if (process.argv.includes('--check')) {
    if (source !== formatted) {
        throw new Error('filter.config.json is not sorted; run npm run format');
    }
} else {
    await writeFile(configPath, formatted);
}
