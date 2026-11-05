// PBKDF2-SHA256 -> 512 bits : 128 bits d'identifiant d'entrée + 256 bits de clé AES-GCM
const ITERATIONS = 150000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = globalThis.crypto.subtle;

export function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64ToBytes(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export function utf8ToB64(str) {
  return bytesToB64(enc.encode(str));
}

export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Insensible à la casse et aux espaces autour
export function normalizePassword(pw) {
  return String(pw || '').trim().toLowerCase();
}

export async function derive(password, saltB64, iterations = ITERATIONS) {
  const base = await subtle.importKey('raw', enc.encode(normalizePassword(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle.deriveBits(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations, hash: 'SHA-256' }, base, 512));
  const key = await subtle.importKey('raw', bits.slice(32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { id: toHex(bits.slice(0, 16)), key };
}

export async function seal(obj, key) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

export async function unseal(entry, key) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(entry.iv) }, key, b64ToBytes(entry.ct));
  return JSON.parse(dec.decode(pt));
}

// Renvoie le contenu déchiffré correspondant au mot de passe, ou null
export async function open(data, password) {
  const { id, key } = await derive(password, data.salt, data.iter || ITERATIONS);
  const entry = data.e[id];
  if (!entry) return null;
  try { return await unseal(entry, key); } catch { return null; }
}

export { ITERATIONS };
