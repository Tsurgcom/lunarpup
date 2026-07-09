/**
 * Deterministic terrain sampling shared by simulation and R3F terrain
 * presentation. This module intentionally has no renderer or mutable state
 * dependencies so terrain shape can be tested independently.
 */
function hash2(x: number, z: number) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return n - Math.floor(n);
}

function smoothstep(t: number) {
    return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, amount: number) {
    return start + (end - start) * amount;
}

function valueNoise(x: number, z: number) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = smoothstep(x - ix);
    const fz = smoothstep(z - iz);

    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);

    const ab = lerp(a, b, fx);
    const cd = lerp(c, d, fx);
    return lerp(ab, cd, fz) * 2 - 1;
}

function fractalNoise(x: number, z: number) {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < 5; i++) {
        total += valueNoise(x * freq, z * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return total / norm;
}

export function calculateTerrainHeight(x: number, z: number) {
    let y = fractalNoise(x * 0.0032, z * 0.0032) * 28;
    y += fractalNoise(x * 0.012 + 50, z * 0.012 - 20) * 9;

    y += Math.pow(Math.max(0, Math.sin(x * 0.0033 + Math.sin(z * 0.0025) * 2.2)), 2.15) * 64;
    y += Math.pow(Math.max(0, Math.cos((x + z) * 0.0028)), 2.8) * 38;

    const cell = 720;
    const baseCx = Math.floor(x / cell);
    const baseCz = Math.floor(z / cell);
    for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
            const gx = baseCx + ox;
            const gz = baseCz + oz;
            const px = (gx + hash2(gx, gz) * 0.8 + 0.1) * cell;
            const pz = (gz + hash2(gx + 91, gz - 47) * 0.8 + 0.1) * cell;
            const radius = 170 + hash2(gx - 12, gz + 31) * 260;
            const height = 45 + hash2(gx + 7, gz + 13) * 95;
            const dx = x - px;
            const dz = z - pz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const t = Math.max(0, 1 - dist / radius);
            y += Math.pow(t, 2.35) * height;
        }
    }

    const craterCell = 560;
    const ccx = Math.floor(x / craterCell);
    const ccz = Math.floor(z / craterCell);
    for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
            const gx = ccx + ox;
            const gz = ccz + oz;
            if (hash2(gx + 201, gz - 109) < 0.48) continue;

            const cx = (gx + 0.18 + hash2(gx + 5, gz + 6) * 0.64) * craterCell;
            const cz = (gz + 0.18 + hash2(gx - 8, gz + 3) * 0.64) * craterCell;
            const radius = 105 + hash2(gx + 22, gz + 22) * 105;
            const depth = 32 + hash2(gx - 44, gz + 11) * 46;
            const rimHeight = 8 + hash2(gx + 14, gz - 14) * 12;
            const dx = x - cx;
            const dz = z - cz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < radius * 1.18) {
                const t = dist / radius;
                if (t < 1) {
                    const bowl = -depth * Math.pow(1 - t * t, 1.28);
                    const rim = Math.exp(-Math.pow((t - 0.9) * 6.2, 2)) * rimHeight;
                    y += bowl + rim;
                } else {
                    const outer = Math.max(0, 1 - (t - 1) / 0.18);
                    y += outer * rimHeight * 0.35;
                }
            }
        }
    }

    return y;
}
