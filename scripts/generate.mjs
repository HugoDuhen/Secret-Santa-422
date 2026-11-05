#!/usr/bin/env node
// Usage : node scripts/generate.mjs
// Lit participants.json, génère les mots de passe, fait le tirage,
// écrit data/data.json (public, chiffré) et LOGINS.md (privé, ignoré par git).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draw, validate } from '../js/draw.js';
import { buildData, buildLoginsMarkdown, generatePassword, uniqueId } from '../js/build.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await readFile(join(root, 'participants.json'), 'utf8'));

const ids = new Set();
const participants = [];
for (const [list, role] of [[cfg.cadres || [], 'cadre'], [cfg.eleves || [], 'élève']]) {
  for (const name of list) {
    const id = uniqueId(name, ids);
    ids.add(id);
    participants.push({ id, name, role, password: generatePassword() });
  }
}

const idByName = (name) => {
  const p = participants.find((x) => x.name === name);
  if (!p) throw new Error(`Nom inconnu dans les règles : "${name}"`);
  return p.id;
};
const r = cfg.regles || {};
const exclusions = [];
for (const [a, b, sensUnique] of r.exclusions || []) {
  exclusions.push([idByName(a), idByName(b)]);
  if (!sensUnique) exclusions.push([idByName(b), idByName(a)]);
}
const rules = {
  noReciprocal: r.pasDeReciprocite !== false,
  exclusions,
  forced: (r.pairesForcees || []).map(([a, b]) => [idByName(a), idByName(b)]),
};

const allIds = participants.map((p) => p.id);
const assignments = draw(allIds, rules);
const check = validate(allIds, assignments, rules);
if (check.errors.length) throw new Error(check.errors.join('\n'));

const adminPassword = generatePassword(3);
const state = { section: cfg.section, participants, rules, assignments };

const data = await buildData(state, adminPassword);
await mkdir(join(root, 'data'), { recursive: true });
await writeFile(join(root, 'data', 'data.json'), JSON.stringify(data, null, 1) + '\n');
await writeFile(join(root, 'LOGINS.md'), buildLoginsMarkdown(state, adminPassword, process.argv[2] || ''));

console.log(`✅ ${participants.length} participants (${participants.filter((p) => p.role === 'cadre').length} cadres).`);
console.log('   data/data.json  → à committer (chiffré)');
console.log('   LOGINS.md       → PRIVÉ, à garder pour toi (ignoré par git)');
console.log(`   Mot de passe admin : ${adminPassword}`);
