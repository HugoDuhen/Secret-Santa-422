// Chiffrement partagé (navigateur + Node 20+) : PBKDF2-SHA256 -> AES-256-GCM
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

// Les mots de passe sont insensibles à la casse et aux espaces autour
export function normalizePassword(pw) {
  return String(pw || '').trim().toLowerCase();
}

async function deriveKey(password, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(normalizePassword(password)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(obj, password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { salt: bytesToB64(salt), iv: bytesToB64(iv), iter: ITERATIONS, ct: bytesToB64(new Uint8Array(ct)) };
}

// Lève une erreur si le mot de passe est faux
export async function decryptJSON(blob, password) {
  const key = await deriveKey(password, b64ToBytes(blob.salt), blob.iter || ITERATIONS);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(blob.iv) }, key, b64ToBytes(blob.ct));
  return JSON.parse(dec.decode(pt));
}
