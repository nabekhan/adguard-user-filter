import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const siteSource = resolve(root, 'site');
const siteOutput = resolve(root, '.build', 'site');
const userscripts = JSON.parse(
    await readFile(resolve(root, 'dist', 'userscripts.json'), 'utf8'),
);
const rawRoot = new URL(
    'https://raw.githubusercontent.com/nabekhan/filters-userscripts/main/',
);

const readScript = async (url, key) => {
    const source = new URL(url);
    if (
        source.origin === rawRoot.origin &&
        source.pathname.startsWith(rawRoot.pathname)
    ) {
        const sourcePath = resolve(
            root,
            ...source.pathname
                .slice(rawRoot.pathname.length)
                .split('/')
                .map(decodeURIComponent),
        );
        const pathWithinRoot = relative(root, sourcePath);
        if (
            pathWithinRoot === '' ||
            pathWithinRoot === '..' ||
            pathWithinRoot.startsWith(`..${sep}`) ||
            isAbsolute(pathWithinRoot)
        ) {
            throw new Error(`${key} resolves outside the repository`);
        }
        return readFile(sourcePath, 'utf8');
    }

    const response = await fetch(source);
    if (!response.ok) {
        throw new Error(`${key} returned HTTP ${response.status}`);
    }
    return response.text();
};

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return value >>> 0;
});

const crc32 = (data) => {
    let value = 0xffffffff;
    for (const byte of data) {
        value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
    }
    return (value ^ 0xffffffff) >>> 0;
};

const createZip = (files) => {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const data = encoder.encode(file.contents);
        const checksum = crc32(data);
        const local = new Uint8Array(30);
        const localView = new DataView(local.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0x0800, true);
        localView.setUint16(12, 33, true);
        localView.setUint32(14, checksum, true);
        localView.setUint32(18, data.length, true);
        localView.setUint32(22, data.length, true);
        localView.setUint16(26, name.length, true);
        localParts.push(local, name, data);

        const central = new Uint8Array(46);
        const centralView = new DataView(central.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0x0800, true);
        centralView.setUint16(14, 33, true);
        centralView.setUint32(16, checksum, true);
        centralView.setUint32(20, data.length, true);
        centralView.setUint32(24, data.length, true);
        centralView.setUint16(28, name.length, true);
        centralView.setUint32(42, offset, true);
        centralParts.push(central, name);
        offset += local.length + name.length + data.length;
    }

    const centralSize = centralParts.reduce(
        (size, part) => size + part.length,
        0,
    );
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return Buffer.concat([...localParts, ...centralParts, end]);
};

const scriptFiles = await Promise.all(
    Object.entries(userscripts.scripts).map(async ([key, script]) => {
        const contents = await readScript(script.url, key);
        const metadataName = contents.match(/^\/\/\s*@name\s+(.+?)\s*$/m)?.[1];
        const safeName = (metadataName ?? key)
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
            .replace(/[. ]+$/g, '');
        return {
            name: `${safeName || key}.user.js`,
            contents,
        };
    }),
);

const duplicateNames = scriptFiles
    .map(({ name }) => name)
    .filter((name, index, names) => names.indexOf(name) !== index);
if (duplicateNames.length > 0) {
    throw new Error(
        `Duplicate userscript filenames: ${duplicateNames.join(', ')}`,
    );
}

await mkdir(siteOutput, { recursive: true });
for (const path of ['index.html', 'app.js', 'style.css']) {
    await copyFile(
        resolve(siteSource, path),
        resolve(siteOutput, basename(path)),
    );
}
for (const path of ['filter.json', 'userscripts.json']) {
    await copyFile(resolve(root, 'dist', path), resolve(siteOutput, path));
}
await writeFile(resolve(siteOutput, 'userscripts.zip'), createZip(scriptFiles));
