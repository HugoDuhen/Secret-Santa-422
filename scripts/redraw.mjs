#!/usr/bin/env node
// Usage : node scripts/redraw.mjs <mot-de-passe-admin>
// Refait le tirage en gardant participants, mots de passe et règles (lus dans data/data.json).
import { readFile, writeFile } from 'node:fs/promises';
import { decryptJSON } from '../js/crypto.js';
import { draw, validate, cycles } from '../js/draw.js';
import { buildData } from '../js/build.js';

const adminPassword = process.argv[2];
const file = new URL('../data/data.json', import.meta.url);
const data = JSON.parse(await readFile(file, 'utf8'));
const state = await decryptJSON(data.admin, adminPassword);
const ids = state.participants.map((p) => p.id);
state.assignments = draw(ids, state.rules);
const { errors, warnings } = validate(ids, state.assignments, state.rules);
if (errors.length || warnings.length) throw new Error([...errors, ...warnings].join('\n'));
await writeFile(file, JSON.stringify(await buildData(state, adminPassword), null, 1) + '\n');
console.log(`✅ Nouveau tirage : ${cycles(ids, state.assignments).length} boucle(s), ${ids.length} participants.`);
