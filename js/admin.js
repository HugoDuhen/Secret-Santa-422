import { decryptJSON, utf8ToB64 } from './crypto.js';
import { draw, validate, cycles } from './draw.js';
import { buildData, buildLoginsMarkdown, generatePassword, uniqueId } from './build.js';

const $ = (id) => document.getElementById(id);
let state = null;          // état complet déchiffré
let adminPassword = '';
let dirty = false;
let showPw = false;
let chainView = false;

const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
};

const byId = () => Object.fromEntries(state.participants.map((p) => [p.id, p]));
const nameOf = (id) => byId()[id]?.name || id;
const ids = () => state.participants.map((p) => p.id);
const sorted = () => state.participants.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(c));
  return e;
}

function roleBadge(role) {
  return el('span', { class: 'badge' + (role === 'cadre' ? ' cadre' : '') }, role === 'cadre' ? 'Cadre' : 'Élève');
}

function setMsg(id, type, content) {
  const m = $(id);
  m.className = 'msg ' + (type || '');
  m.innerHTML = '';
  if (Array.isArray(content)) {
    const ul = el('ul');
    content.forEach((c) => ul.append(el('li', {}, c)));
    m.append(ul);
  } else if (content) m.append(content);
}

function markDirty() {
  dirty = true;
  renderStatus();
}

function renderStatus() {
  $('dirty-dot').className = 'status-dot' + (dirty ? ' dirty' : '');
  $('publish-status').textContent = dirty
    ? '🟠 Tu as des modifications non publiées.'
    : `🟢 Tout est publié (dernière mise à jour : ${state.updatedAt ? new Date(state.updatedAt).toLocaleString('fr-FR') : '—'}).`;
}

/* ---------- TIRAGE ---------- */
function renderDraw() {
  const { errors, warnings } = validate(ids(), state.assignments, state.rules, nameOf);
  if (errors.length) setMsg('draw-msg', 'error', ['❌ Tirage invalide :', ...errors]);
  else if (warnings.length) setMsg('draw-msg', 'warn', ['⚠️ Tirage valide mais :', ...warnings]);
  else setMsg('draw-msg', 'ok', `✅ Tirage valide — ${state.participants.length} participants.`);

  // Repère les lignes problématiques
  const counts = {};
  Object.values(state.assignments).forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  const excl = new Set(state.rules.exclusions.map(([a, b]) => a + '>' + b));

  const body = $('draw-body');
  body.innerHTML = '';
  for (const p of sorted()) {
    const r = state.assignments[p.id];
    const bad = !r || r === p.id || counts[r] > 1;
    const warned = !bad && excl.has(p.id + '>' + r);
    const sel = el('select', {
      onchange: (e) => {
        if (e.target.value) state.assignments[p.id] = e.target.value;
        else delete state.assignments[p.id];
        markDirty(); renderDraw();
      },
    });
    sel.append(el('option', { value: '' }, '— personne —'));
    for (const q of sorted()) {
      if (q.id === p.id) continue;
      const taken = Object.entries(state.assignments).some(([g, rr]) => rr === q.id && g !== p.id);
      sel.append(el('option', { value: q.id, selected: q.id === r }, q.name + (taken ? ' (déjà pris)' : '')));
    }
    body.append(el('tr', { class: bad ? 'bad' : warned ? 'warned' : '' },
      el('td', {}, el('strong', {}, p.name), ' ', roleBadge(p.role)),
      el('td', {}, '🎁→'),
      el('td', {}, sel),
      el('td', {}, r ? roleBadge(byId()[r]?.role) : '')));
  }

  const cv = $('chain-view');
  cv.innerHTML = '';
  const loops = cycles(sorted().map((p) => p.id), state.assignments);
  loops.forEach((loop, i) => {
    const div = el('div', { class: 'chain' }, el('strong', {}, `Boucle ${i + 1} (${loop.length}) : `));
    loop.forEach((id, j) => {
      if (j) div.append(el('span', { class: 'arrow' }, '→'));
      div.append(nameOf(id));
    });
    const last = state.assignments[loop[loop.length - 1]];
    if (last) { div.append(el('span', { class: 'arrow' }, '→')); div.append(nameOf(last)); }
    cv.append(div);
  });
}

$('redraw').addEventListener('click', () => {
  if (!confirm('Relancer complètement le tirage ? Les modifications manuelles seront perdues.')) return;
  try {
    state.assignments = draw(ids(), state.rules);
    markDirty(); renderDraw();
  } catch (err) {
    setMsg('draw-msg', 'error', err.message);
  }
});

$('toggle-view').addEventListener('click', () => {
  chainView = !chainView;
  $('table-view').classList.toggle('hidden', chainView);
  $('chain-view').classList.toggle('hidden', !chainView);
  $('toggle-view').textContent = chainView ? 'Voir en tableau' : 'Voir en boucles';
});

/* ---------- RÈGLES ---------- */
function fillPersonSelect(sel) {
  sel.innerHTML = '';
  sel.append(el('option', { value: '' }, '— choisir —'));
  sorted().forEach((p) => sel.append(el('option', { value: p.id }, p.name)));
}

function renderRules() {
  $('no-recip').checked = !!state.rules.noReciprocal;
  ['forced-a', 'forced-b', 'excl-a', 'excl-b'].forEach((id) => fillPersonSelect($(id)));

  const fl = $('forced-list');
  fl.innerHTML = '';
  state.rules.forced.forEach(([a, b], i) => fl.append(el('li', {},
    el('span', {}, `${nameOf(a)} → ${nameOf(b)}`),
    el('button', { class: 'btn small ghost', onclick: () => { state.rules.forced.splice(i, 1); markDirty(); renderRules(); renderDraw(); } }, 'Retirer'))));
  if (!state.rules.forced.length) fl.append(el('li', { class: 'muted' }, 'Aucune'));

  const xl = $('excl-list');
  xl.innerHTML = '';
  state.rules.exclusions.forEach(([a, b], i) => xl.append(el('li', {},
    el('span', {}, `${nameOf(a)} ✕→ ${nameOf(b)}`),
    el('button', { class: 'btn small ghost', onclick: () => { state.rules.exclusions.splice(i, 1); markDirty(); renderRules(); renderDraw(); } }, 'Retirer'))));
  if (!state.rules.exclusions.length) xl.append(el('li', { class: 'muted' }, 'Aucune'));
}

$('no-recip').addEventListener('change', (e) => { state.rules.noReciprocal = e.target.checked; markDirty(); renderDraw(); });

$('add-forced').addEventListener('click', () => {
  const a = $('forced-a').value, b = $('forced-b').value;
  if (!a || !b || a === b) return alert('Choisis deux personnes différentes.');
  if (state.rules.forced.some(([x, y]) => x === a || y === b)) return alert('Cette personne a déjà une paire forcée.');
  state.rules.forced.push([a, b]);
  if (confirm(`Appliquer tout de suite : ${nameOf(a)} offre à ${nameOf(b)} ? (le tirage sera relancé en respectant cette règle)`)) {
    try { state.assignments = draw(ids(), state.rules); } catch (err) { alert(err.message); }
  }
  markDirty(); renderRules(); renderDraw();
});

$('add-excl').addEventListener('click', () => {
  const a = $('excl-a').value, b = $('excl-b').value;
  if (!a || !b || a === b) return alert('Choisis deux personnes différentes.');
  const add = (x, y) => { if (!state.rules.exclusions.some(([p, q]) => p === x && q === y)) state.rules.exclusions.push([x, y]); };
  add(a, b);
  if ($('excl-both').checked) add(b, a);
  markDirty(); renderRules(); renderDraw();
});

/* ---------- PARTICIPANTS ---------- */
function renderPeople() {
  $('people-count').textContent = `(${state.participants.length} — ${state.participants.filter((p) => p.role === 'cadre').length} cadres)`;
  const body = $('people-body');
  body.innerHTML = '';
  for (const p of sorted()) {
    const roleSel = el('select', { onchange: (e) => { p.role = e.target.value; markDirty(); renderAll(); } },
      el('option', { value: 'élève', selected: p.role === 'élève' }, 'Élève'),
      el('option', { value: 'cadre', selected: p.role === 'cadre' }, 'Cadre'));
    roleSel.style.minWidth = '90px';
    body.append(el('tr', {},
      el('td', {}, p.name),
      el('td', {}, roleSel),
      el('td', {}, el('code', {}, p.id)),
      el('td', {}, el('code', {}, showPw ? p.password : '••••••••')),
      el('td', {},
        el('button', {
          class: 'btn small ghost', title: 'Générer un nouveau mot de passe',
          onclick: () => {
            if (!confirm(`Générer un nouveau mot de passe pour ${p.name} ? L'ancien ne marchera plus après publication.`)) return;
            p.password = generatePassword(); showPw = true; markDirty(); renderPeople();
          },
        }, '🔑'),
        ' ',
        el('button', {
          class: 'btn small ghost', title: 'Supprimer',
          onclick: () => {
            if (!confirm(`Supprimer ${p.name} ? La personne qui lui offrait n'aura plus personne : relance le tirage ensuite.`)) return;
            state.participants = state.participants.filter((x) => x.id !== p.id);
            delete state.assignments[p.id];
            for (const [g, r] of Object.entries(state.assignments)) if (r === p.id) delete state.assignments[g];
            state.rules.forced = state.rules.forced.filter(([a, b]) => a !== p.id && b !== p.id);
            state.rules.exclusions = state.rules.exclusions.filter(([a, b]) => a !== p.id && b !== p.id);
            markDirty(); renderAll();
          },
        }, '🗑️'))));
  }
  $('toggle-pw').textContent = showPw ? '🙈 Masquer les mots de passe' : '👁️ Afficher les mots de passe';
}

$('toggle-pw').addEventListener('click', () => { showPw = !showPw; renderPeople(); });

$('add-person').addEventListener('click', () => {
  const name = $('new-name').value.trim();
  if (!name) return;
  if (state.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) return alert('Ce nom existe déjà.');
  const id = uniqueId(name, new Set(ids()));
  const password = generatePassword();
  state.participants.push({ id, name, role: $('new-role').value, password });
  $('new-name').value = '';
  alert(`${name} ajouté(e).\nIdentifiant : ${id}\nMot de passe : ${password}\n\nPense à relancer le tirage puis à publier.`);
  markDirty(); renderAll();
});

/* ---------- PUBLICATION ---------- */
async function build() {
  const { errors } = validate(ids(), state.assignments, state.rules, nameOf);
  if (errors.length && !confirm('⚠️ Le tirage est invalide :\n\n' + errors.join('\n') + '\n\nPublier quand même ?')) throw new Error('Publication annulée.');
  const bar = $('progress');
  bar.classList.remove('hidden');
  const data = await buildData(state, adminPassword, (i, n) => { bar.firstElementChild.style.width = `${(100 * i) / n}%`; });
  setTimeout(() => bar.classList.add('hidden'), 600);
  return data;
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('download-data').addEventListener('click', async (e) => {
  e.target.disabled = true;
  try {
    const data = await build();
    download('data.json', JSON.stringify(data, null, 1) + '\n', 'application/json');
    setMsg('publish-msg', 'ok', 'Fichier téléchargé. Remplace data/data.json dans le dépôt pour publier.');
  } catch (err) { setMsg('publish-msg', 'error', err.message); }
  e.target.disabled = false;
});

$('publish-gh').addEventListener('click', async (e) => {
  const owner = $('gh-owner').value.trim(), repo = $('gh-repo').value.trim();
  const branch = $('gh-branch').value.trim() || 'main', token = $('gh-token').value.trim();
  if (!owner || !repo || !token) return setMsg('publish-msg', 'error', 'Renseigne le propriétaire, le dépôt et le token.');
  ss.set('ss422-gh', JSON.stringify({ owner, repo, branch }));
  ss.set('ss422-token', token);
  e.target.disabled = true;
  try {
    const data = await build();
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/data/data.json`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const res = await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Secret Santa : mise à jour du tirage (${new Date().toLocaleString('fr-FR')})`,
        content: utf8ToB64(JSON.stringify(data, null, 1) + '\n'),
        branch,
        sha,
      }),
    });
    if (!res.ok) throw new Error(`GitHub a répondu ${res.status} : ${(await res.json().catch(() => ({}))).message || ''}`);
    state.updatedAt = data.updatedAt;
    dirty = false; renderStatus();
    setMsg('publish-msg', 'ok', '✅ Publié ! Le site sera à jour d\'ici une minute environ (le temps que GitHub Pages se reconstruise).');
  } catch (err) { setMsg('publish-msg', 'error', err.message); }
  e.target.disabled = false;
});

$('download-logins').addEventListener('click', () => {
  const site = location.href.replace(/admin\.html.*$/, '');
  download('LOGINS.md', buildLoginsMarkdown(state, adminPassword, site), 'text/markdown');
});

/* ---------- GÉNÉRAL ---------- */
function renderAll() { renderDraw(); renderRules(); renderPeople(); renderStatus(); }

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('hidden', s.dataset.tab !== b.dataset.tab));
});

window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

function initGithubFields() {
  let saved = {};
  try { saved = JSON.parse(ss.get('ss422-gh') || '{}'); } catch {}
  let owner = 'HugoDuhen', repo = 'Secret-Santa-422';
  if (location.hostname.endsWith('.github.io')) {
    owner = location.hostname.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    if (seg && !seg.endsWith('.html')) repo = seg;
  }
  $('gh-owner').value = saved.owner || owner;
  $('gh-repo').value = saved.repo || repo;
  $('gh-branch').value = saved.branch || 'main';
  $('gh-token').value = ss.get('ss422-token') || '';
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  btn.disabled = true; btn.textContent = 'Vérification…';
  setMsg('login-msg', '', '');
  try {
    const res = await fetch(`data/data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Impossible de charger data/data.json.');
    const data = await res.json();
    try { state = await decryptJSON(data.admin, $('admin-pw').value); } catch { throw new Error('Mot de passe admin incorrect.'); }
    adminPassword = $('admin-pw').value;
    state.rules = { forced: [], exclusions: [], noReciprocal: true, ...(state.rules || {}) };
    state.assignments = state.assignments || {};
    $('admin-pw').value = '';
    $('section-name').textContent = state.section || '';
    $('login-card').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('main').classList.add('wide');
    initGithubFields();
    renderAll();
  } catch (err) {
    setMsg('login-msg', 'error', err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Entrer';
  }
});
