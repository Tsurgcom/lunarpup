/**
 * End-to-end blind-relay test.
 *
 * Two clients connect through the REAL dev WebSocket relay (src/server.ts) with a
 * shared room key. They exchange join/state/chat. We assert:
 *   1. each client decrypts the other's name, position, and chat correctly, and
 *   2. the raw frames the relay forwards contain NONE of the plaintext — proving
 *      the relay (and anything it stores/logs) cannot read player data.
 */
import { RoomCipher, generateRoomKey, deriveRoomId } from '../src/net/crypto.ts';

const PORT = 3099;
const URL = `ws://localhost:${PORT}`;

const server = Bun.spawn(['bun', 'src/server.ts'], {
    env: { ...process.env, PORT: String(PORT) },
    stdout: 'inherit',
    stderr: 'inherit',
});

// wait for the relay to listen
await new Promise((resolve) => setTimeout(resolve, 600));

let failures = 0;
function check(cond: boolean, msg: string) {
    if (cond) console.log('  ✓', msg);
    else { console.error('  ✗', msg); failures++; }
}

const key = generateRoomKey();
const roomId = await deriveRoomId(key);
const cipherA = await RoomCipher.fromKey(key);
const cipherB = await RoomCipher.fromKey(key);

const rawFramesA: string[] = []; // everything the relay sent to A (what it "sees")

function connect(name: string, cipher: RoomCipher, capture = false) {
    const ws = new WebSocket(URL);
    const queue: ((raw: string) => void)[] = [];
    let welcome: any = null;

    ws.onmessage = (ev) => {
        const raw = String(ev.data);
        if (capture) rawFramesA.push(raw);
        const next = queue.shift();
        if (next) next(raw);
    };

    const nextFrame = () => new Promise<string>((resolve) => queue.push(resolve));

    const ready = new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
    });

    return {
        ready,
        async join() {
            await ready;
            const nameEnv = await cipher.encrypt(name);
            const stateEnv = await cipher.encrypt({ x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, heading: 0, speed: 0, isGrounded: true, boardTiltX: 0, boardTiltZ: 0 });
            ws.send(JSON.stringify({ type: 'join', room: roomId, name: nameEnv, state: stateEnv, seq: 0 }));
            const raw = await nextFrame();
            welcome = JSON.parse(raw);
            return welcome;
        },
        async sendState(seq: number, state: any) {
            const env = await cipher.encrypt(state);
            ws.send(JSON.stringify({ type: 'state', seq, state: env }));
        },
        async sendChat(text: string) {
            const payload = await cipher.encrypt({ name, text });
            ws.send(JSON.stringify({ type: 'chat', payload }));
        },
        nextFrame,
        close: () => ws.close(),
    };
}

try {
    const a = connect('Alice', cipherA, true);
    const wa = await a.join();
    check(wa.type === 'welcome', 'A welcomed');
    check(Array.isArray(wa.players) && wa.players.length === 0, 'A sees empty room');

    const b = connect('Bob', cipherB);
    // A should receive player_joined for B once B joins.
    const aJoinFrame = a.nextFrame();
    await b.join();
    const joinedRaw = await aJoinFrame;
    const joined = JSON.parse(joinedRaw);
    check(joined.type === 'player_joined', 'A notified of B joining');

    // A decrypts B's name + state from the encrypted snapshot.
    const bSnap = joined.player;
    const bName = await cipherA.decrypt<string>(bSnap.name);
    const bState = await cipherA.decrypt<any>(bSnap.state);
    check(bName === 'Bob', `A decrypts B's name -> "${bName}"`);
    check(bState && bState.qw === 1, "A decrypts B's state");

    // B sends a state update; A receives + decrypts.
    const aStateFrame = a.nextFrame();
    await b.sendState(1, { x: 12.5, y: 0.4, z: -7.25, qx: 0, qy: 0.3, qz: 0, qw: 0.95, heading: 1.2, speed: 0.9, isGrounded: true, boardTiltX: 0.05, boardTiltZ: -0.03 });
    const stateMsg = JSON.parse(await aStateFrame);
    check(stateMsg.type === 'state' && stateMsg.seq === 1, 'A received B state update w/ seq');
    const decState = await cipherA.decrypt<any>(stateMsg.state);
    check(decState && decState.x === 12.5 && decState.z === -7.25, 'A decrypted B position');

    // B sends chat; A receives + decrypts name+text.
    const aChatFrame = a.nextFrame();
    await b.sendChat('hello from bob');
    const chatMsg = JSON.parse(await aChatFrame);
    check(chatMsg.type === 'chat', 'A received chat');
    const chat = await cipherA.decrypt<{ name: string; text: string }>(chatMsg.payload);
    check(chat?.name === 'Bob' && chat?.text === 'hello from bob', 'A decrypted chat name+text');

    // THE BLIND-RELAY ASSERTION: everything the relay forwarded to A is
    // inspected as raw text. None of the plaintext may appear — the relay only
    // ever saw encrypted envelopes.
    const allRaw = rawFramesA.join('\n');
    check(!allRaw.includes('Alice'), 'relay never saw plaintext "Alice"');
    check(!allRaw.includes('Bob'), 'relay never saw plaintext "Bob"');
    check(!allRaw.includes('hello from bob'), 'relay never saw plaintext chat');
    check(!allRaw.includes('12.5') && !allRaw.includes('-7.25'), 'relay never saw plaintext positions');
    check(allRaw.includes('"iv"') && allRaw.includes('"data"'), 'relay only saw encrypted envelopes');

    a.close();
    b.close();
} catch (err) {
    console.error('TEST ERROR:', err);
    failures++;
} finally {
    server.kill();
}

await new Promise((r) => setTimeout(r, 200));
if (failures === 0) console.log('\nALL E2E BLIND-RELAY TESTS PASSED ✅');
else { console.error(`\n${failures} CHECK(S) FAILED ❌`); process.exit(1); }
