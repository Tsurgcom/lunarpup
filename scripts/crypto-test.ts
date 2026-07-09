import { RoomCipher, generateRoomKey, deriveRoomId, bytesToBase64url, base64urlToBytes } from '../src/net/crypto.ts';

// 1. base64url round-trip
const raw = crypto.getRandomValues(new Uint8Array(32));
const b64 = bytesToBase64url(raw);
const back = base64urlToBytes(b64);
console.assert(back.length === 32 && back.every((b, i) => b === raw[i]), 'base64url round-trip OK');

// 2. key gen + deriveRoomId determinism + opacity
const key = generateRoomKey();
console.assert(key.length > 20, 'key generated:', key.slice(0, 8) + '…');
const rid1 = await deriveRoomId(key);
const rid2 = await deriveRoomId(key);
console.assert(rid1 === rid2, 'deriveRoomId deterministic:', rid1);
const ridOther = await deriveRoomId(generateRoomKey());
console.assert(rid1 !== ridOther, 'different keys -> different room ids');

// 3. encrypt/decrypt round-trip of a player state + chat payload
const cipher = await RoomCipher.fromKey(key);
const state = { x: 1.5, y: 0.42, z: -3.2, qx: 0, qy: 0.4, qz: 0, qw: 0.91, heading: 2.1, speed: 0.8, isGrounded: true, boardTiltX: 0.1, boardTiltZ: -0.05 };
const env = await cipher.encrypt(state);
console.assert(typeof env.iv === 'string' && typeof env.data === 'string', 'envelope has iv+data');
const dec = await cipher.decrypt<typeof state>(env);
console.assert(JSON.stringify(dec) === JSON.stringify(state), 'state round-trip OK');

const chatEnv = await cipher.encrypt({ name: 'Pup123', text: 'hello world' });
const chatDec = await cipher.decrypt<{ name: string; text: string }>(chatEnv);
console.assert(chatDec?.name === 'Pup123' && chatDec?.text === 'hello world', 'chat round-trip OK');

// 4. wrong key cannot decrypt (tamper / different room)
const otherCipher = await RoomCipher.fromKey(generateRoomKey());
const bad = await otherCipher.decrypt<typeof state>(env);
console.assert(bad === null, 'wrong key -> null (cannot read)');

// 5. tampered ciphertext -> null
const tampered = { iv: env.iv, data: env.data.slice(0, -2) + 'AA' };
const tamperedDec = await cipher.decrypt<typeof state>(tampered);
console.assert(tamperedDec === null, 'tampered ciphertext -> null (AES-GCM auth)');

console.log('ALL CRYPTO TESTS PASSED ✅');
