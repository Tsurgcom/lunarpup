#!/usr/bin/env bun

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const buildId =
    process.env.NETLIFY_DEPLOY_ID
    ?? process.env.COMMIT_REF
    ?? process.env.COMMIT_SHA
    ?? (process.env.BUILD_ID && process.env.BUILD_ID !== '0' ? process.env.BUILD_ID : undefined)
    ?? `${Date.now()}`;
const version = { buildId };

const build = Bun.spawnSync(
    ['bun', 'build', './index.html', '--outdir=dist', '--minify', '--splitting', '--target=browser'],
    { cwd: root, stdout: 'inherit', stderr: 'inherit' },
);

if (build.exitCode !== 0) {
    process.exit(build.exitCode ?? 1);
}

const payload = JSON.stringify(version, null, 2);
await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist', 'version.json'), payload);
await writeFile(join(root, 'version.json'), payload);

console.log(`Built with buildId ${buildId}`);
