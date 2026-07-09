import { getTerrainHeight } from '../game/terrain.ts';
import { getRemotePlayerMarkers } from '../game/remotePlayers.ts';
import { playerGroup, multiplayerClient } from '../state.ts';

const SIZE = 132;
const RANGE = 600;
const GRID = 48;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let heightCache: Float32Array | null = null;
let cacheCenterX = NaN;
let cacheCenterZ = NaN;

export function bindMinimapCanvas(nextCanvas: HTMLCanvasElement) {
    const nextContext = nextCanvas.getContext('2d');
    if (!nextContext) return () => {};

    canvas = nextCanvas;
    ctx = nextContext;
    heightCache = null;
    cacheCenterX = NaN;
    cacheCenterZ = NaN;

    return () => {
        if (canvas !== nextCanvas) return;

        canvas = null;
        ctx = null;
        heightCache = null;
        cacheCenterX = NaN;
        cacheCenterZ = NaN;
    };
}

export function updateMinimap() {
    if (!ctx || !canvas) return;

    const px = playerGroup.position.x;
    const pz = playerGroup.position.z;

    if (px !== cacheCenterX || pz !== cacheCenterZ) {
        heightCache = sampleHeights(px, pz);
        cacheCenterX = px;
        cacheCenterZ = pz;
    }

    ctx.clearRect(0, 0, SIZE, SIZE);
    drawTerrain(ctx, heightCache!);
    drawPlayers(ctx, px, pz);
}

function sampleHeights(cx: number, cz: number) {
    const data = new Float32Array(GRID * GRID);
    const half = RANGE / 2;
    let min = Infinity;
    let max = -Infinity;

    for (let z = 0; z < GRID; z++) {
        for (let x = 0; x < GRID; x++) {
            const wx = cx - half + (x / (GRID - 1)) * RANGE;
            const wz = cz - half + (z / (GRID - 1)) * RANGE;
            const h = getTerrainHeight(wx, wz);
            data[z * GRID + x] = h;
            if (h < min) min = h;
            if (h > max) max = h;
        }
    }

    // Normalize heights into 0..1 in-place for drawing
    const span = Math.max(max - min, 1);
    for (let i = 0; i < data.length; i++) {
        data[i] = (data[i]! - min) / span;
    }
    return data;
}

function drawTerrain(ctx: CanvasRenderingContext2D, heights: Float32Array) {
    const cell = SIZE / GRID;
    for (let z = 0; z < GRID; z++) {
        for (let x = 0; x < GRID; x++) {
            const t = heights[z * GRID + x]!;
            const r = Math.floor(70 + t * 55);
            const g = Math.floor(75 + t * 60);
            const b = Math.floor(95 + t * 70);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x * cell, z * cell, cell + 0.5, cell + 0.5);
        }
    }

    ctx.strokeStyle = 'rgba(160,196,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
}

function worldToMap(wx: number, wz: number, cx: number, cz: number) {
    const half = RANGE / 2;
    const x = ((wx - (cx - half)) / RANGE) * SIZE;
    const y = ((wz - (cz - half)) / RANGE) * SIZE;
    return { x, y };
}

function drawPlayers(ctx: CanvasRenderingContext2D, cx: number, cz: number) {
    const remotes = getRemotePlayerMarkers();
    for (const remote of remotes) {
        const { x, y } = worldToMap(remote.x, remote.z, cx, cz);
        if (x < -4 || y < -4 || x > SIZE + 4 || y > SIZE + 4) continue;
        drawDot(ctx, x, y, remote.color, 4);
    }

    const localColor = multiplayerClient?.color ?? 0xffb703;
    drawDot(ctx, SIZE / 2, SIZE / 2, localColor, 5, true);
}

function drawDot(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: number,
    radius: number,
    pulse = false,
) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    if (pulse) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}
