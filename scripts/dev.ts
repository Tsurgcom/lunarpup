#!/usr/bin/env bun

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const version = { buildId: `${Date.now()}` };
await writeFile(join(root, 'version.json'), JSON.stringify(version, null, 2));

const game = Bun.spawn(['bun', '--hot', './index.html'], {
    stdout: 'inherit',
    stderr: 'inherit',
});

const server = Bun.spawn(['bun', '--hot', 'src/server.ts'], {
    stdout: 'inherit',
    stderr: 'inherit',
});

function shutdown() {
    game.kill();
    server.kill();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await Promise.all([game.exited, server.exited]);
