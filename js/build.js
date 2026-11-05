// Construction du fichier public data/data.json + du LOGINS.md (partagé navigateur + Node)
import { encryptJSON } from './crypto.js';

const WORDS = [
  'sapin', 'renne', 'neige', 'etoile', 'flocon', 'lutin', 'cadeau', 'houx', 'bougie', 'cannelle',
  'traineau', 'givre', 'boule', 'grelot', 'chocolat', 'biscuit', 'hiver', 'luge', 'ruban', 'gui',
  'marron', 'clochette', 'chaussette', 'cheminee', 'paquet', 'manteau', 'echarpe', 'bonnet', 'igloo', 'pingouin',
  'ours', 'glacon', 'nougat', 'orange', 'papillote', 'sucre', 'vin', 'buche', 'bonbon', 'veillee',
];

function randInt(max) {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % max;
}

export function generatePassword(words = 2) {
  const parts = [];
  for (let i = 0; i < words; i++) parts.push(WORDS[randInt(WORDS.length)]);
  parts.push(String(randInt(10000)).padStart(4, '0'));
  return parts.join('-');
}

export function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'participant';
}

export function uniqueId(name, existingIds) {
  const base = slugify(name);
  let id = base;
  let n = 2;
  while (existingIds.has(id)) id = `${base}${n++}`;
  return id;
}

/**
 * state = { section, participants: [{id, name, role, password}], rules, assignments, updatedAt }
 */
export async function buildData(state, adminPassword, onProgress = () => {}) {
  const byId = Object.fromEntries(state.participants.map((p) => [p.id, p]));
  const updatedAt = new Date().toISOString();
  const fullState = { ...state, updatedAt };
  const blobs = {};
  let i = 0;
  for (const p of state.participants) {
    const r = byId[state.assignments[p.id]];
    blobs[p.id] = await encryptJSON(
      { name: p.name, role: p.role, receiver: r ? { name: r.name, role: r.role } : null, updatedAt },
      p.password
    );
    onProgress(++i, state.participants.length + 1);
  }
  const admin = await encryptJSON(fullState, adminPassword);
  onProgress(state.participants.length + 1, state.participants.length + 1);

  const participants = state.participants
    .map((p) => ({ id: p.id, name: p.name, role: p.role }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return { version: 1, section: state.section, updatedAt, participants, blobs, admin };
}

export function buildLoginsMarkdown(state, adminPassword, siteUrl = '') {
  const byRole = (role) => state.participants
    .filter((p) => p.role === role)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const table = (list) => [
    '| Nom | Identifiant | Mot de passe |',
    '|---|---|---|',
    ...list.map((p) => `| ${p.name} | \`${p.id}\` | \`${p.password}\` |`),
  ].join('\n');

  const others = state.participants.filter((p) => p.role !== 'élève' && p.role !== 'cadre');
  return [
    `# Identifiants — Secret Santa ${state.section}`,
    '',
    '> ⚠️ Document confidentiel : ne pas publier sur GitHub. Distribuer à chacun **uniquement** sa ligne.',
    '',
    siteUrl ? `Site : ${siteUrl}\n` : '',
    '## Admin',
    '',
    `- Page : \`admin.html\``,
    `- Mot de passe admin : \`${adminPassword}\``,
    '',
    `## Cadres (${byRole('cadre').length})`,
    '',
    table(byRole('cadre')),
    '',
    `## Élèves (${byRole('élève').length})`,
    '',
    table(byRole('élève')),
    '',
    ...(others.length ? ['## Autres', '', table(others), ''] : []),
    `_Généré le ${new Date().toLocaleString('fr-FR')}_`,
    '',
  ].join('\n');
}
