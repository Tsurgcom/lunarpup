import { createInterface } from 'node:readline/promises';

/**
 * Human-only mainnet launch gate. Do not call from CI, tests, bots, or autonomous agents.
 * This script intentionally requires both an environment variable and a live terminal y/N prompt.
 */
const CONFIRM_ENV_VALUE = 'YES_I_AM_SURE';

if (process.env.MAINNET_LAUNCH_CONFIRM !== CONFIRM_ENV_VALUE) {
    console.error(`Refusing mainnet launch: set MAINNET_LAUNCH_CONFIRM=${CONFIRM_ENV_VALUE} only during a human-supervised release.`);
    process.exit(1);
}

const prompt = 'This will launch Lunar Pup Solana assets on MAINNET. Type y to continue [y/N]: ';
const answer = (await promptForHuman(prompt)).trim().toLowerCase();
if (answer !== 'y') {
    console.error('Mainnet launch aborted.');
    process.exit(1);
}

console.log('Mainnet launch gate passed. Wire the audited release transaction flow here only after human review.');

async function promptForHuman(message: string): Promise<string> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Refusing mainnet launch without an interactive terminal.');
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await readline.question(message);
    } finally {
        readline.close();
    }
}
