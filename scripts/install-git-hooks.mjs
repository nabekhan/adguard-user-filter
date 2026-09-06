import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

if (existsSync(resolve(root, '.git'))) {
    execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
        cwd: root,
        stdio: 'inherit',
    });
}
