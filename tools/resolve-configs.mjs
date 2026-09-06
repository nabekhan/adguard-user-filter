import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const rawRoot =
    'https://raw.githubusercontent.com/nabekhan/user-filter-scripts/main/';
const configs = [
    {
        filename: 'filter.config.json',
        collectionName: 'lists',
        localDirectory: 'lists',
    },
    {
        filename: 'userscripts.config.json',
        collectionName: 'scripts',
        localDirectory: 'userscripts',
    },
];

const distDir = resolve(root, 'dist');
await mkdir(distDir, { recursive: true });

for (const { filename, collectionName, localDirectory } of configs) {
    const source = JSON.parse(await readFile(resolve(root, filename), 'utf8'));
    const collection = {};

    for (const [name, entry] of Object.entries(source[collectionName] ?? {})) {
        if (entry === null || typeof entry !== 'object') {
            throw new Error(`Invalid entry: ${collectionName}.${name}`);
        }

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
                    `Local file for ${name} must be inside ${localDirectory}/`,
                );
            }

            await access(localPath);
            const encodedPath = pathWithinDirectory
                .split(sep)
                .map(encodeURIComponent)
                .join('/');
            resolvedUrl = new URL(`${localDirectory}/${encodedPath}`, rawRoot);
        } else {
            if (typeof url !== 'string' || url.trim() === '') {
                throw new Error(`Invalid remote URL for ${name}`);
            }

            resolvedUrl = new URL(url);
        }

        if (resolvedUrl.protocol !== 'https:') {
            throw new Error(`URL for ${name} must use HTTPS`);
        }

        if (
            collectionName === 'scripts' &&
            !resolvedUrl.pathname.endsWith('.user.js')
        ) {
            throw new Error(`Userscript ${name} must point to a .user.js file`);
        }

        collection[name] = { ...settings, url: resolvedUrl.href };
    }

    await writeFile(
        resolve(distDir, filename),
        `${JSON.stringify({ ...source, [collectionName]: collection }, null, 2)}\n`,
    );
}
