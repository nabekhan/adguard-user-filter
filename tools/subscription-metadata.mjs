import { createHash } from 'node:crypto';

const checksum = (contents) =>
    createHash('md5')
        .update(contents.replace(/\r/g, '').replace(/\n+/g, '\n'))
        .digest('base64')
        .replace(/=+$/g, '');

const countRules = (contents) =>
    contents.split(/\r?\n/).filter((line) => {
        const trimmed = line.trim();
        return trimmed !== '' && !trimmed.startsWith('!');
    }).length;

export const addSubscriptionMetadata = (contents, { homepage, platform }) => {
    const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
    const checksumPattern = /^! Checksum:[^\r\n]*(?:\r?\n)/;
    const descriptionPattern = /^! Description:[^\r\n]*$/m;
    const withoutChecksum = contents.replace(checksumPattern, '');
    const description = withoutChecksum.match(descriptionPattern)?.[0];

    if (withoutChecksum === contents || description === undefined) {
        throw new Error(`Missing generated filter metadata for ${platform}`);
    }

    const metadata = [
        description,
        `! Homepage: ${homepage}`,
        `! Platform: ${platform}`,
        `! Rules: ${countRules(withoutChecksum)}`,
    ].join(lineEnding);
    const withMetadata = withoutChecksum.replace(description, metadata);

    return `! Checksum: ${checksum(withMetadata)}${lineEnding}${withMetadata}`;
};

export const createSubscription = ({
    description,
    expires,
    homepage,
    platform,
    rules,
    title,
    version = '1.0.0.0',
}) => {
    const lineEnding = '\r\n';
    const timeUpdated = new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const contents = `${[
        `! Title: ${title}`,
        `! Description: ${description}`,
        `! Homepage: ${homepage}`,
        `! Platform: ${platform}`,
        `! Rules: ${rules.length}`,
        `! Version: ${version}`,
        `! TimeUpdated: ${timeUpdated}`,
        `! Expires: ${expires} (update frequency)`,
        ...rules,
    ].join(lineEnding)}${lineEnding}`;

    return `! Checksum: ${checksum(contents)}${lineEnding}${contents}`;
};
