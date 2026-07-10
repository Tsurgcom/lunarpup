#!/usr/bin/env bun

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const version = { buildId: `${Date.now()}` };
await writeFile(join(root, 'version.json'), JSON.stringify(version, null, 2));

// No --hot for the game: Bun 1.3's HMR chokes on the R3F/React import graph
// ("Failed to load bundled module ... bug in Bun's bundler"). Plain serve still
// rebundles on refresh; only in-place HMR is lost.
const game = Bun.spawn(['bun', './index.html'], {
    stdout: 'inherit',
    stderr: 'inherit',
});

const server = Bun.spawn(['bun', '--hot', 'src/server.ts'], {
    env: { ...process.env, EXTENSIONS: process.env.EXTENSIONS ?? 'agent-harness' },
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
