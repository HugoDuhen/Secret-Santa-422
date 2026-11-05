import { decryptJSON } from './crypto.js';

const $ = (id) => document.getElementById(id);
const SESSION_KEY = 'ss422-session';
let data = null;

function store(key, value) {
  try { value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function load(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

async function loadData() {
  const res = await fetch(`data/data.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Impossible de charger les données.');
  return res.json();
}

function fillSelect() {
  const sel = $('who');
  sel.innerHTML = '<option value="">— Choisis ton nom —</option>';
  for (const role of ['cadre', 'élève']) {
    const people = data.participants.filter((p) => p.role === role);
    if (!people.length) continue;
    const group = document.createElement('optgroup');
    group.label = role === 'cadre' ? 'Cadres' : 'Élèves';
    for (const p of people) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      group.appendChild(o);
    }
    sel.appendChild(group);
  }
  const others = data.participants.filter((p) => p.role !== 'cadre' && p.role !== 'élève');
  for (const p of others) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name; sel.appendChild(o);
  }
}

function showResult(info) {
  $('login-card').classList.add('hidden');
  $('result-card').classList.remove('hidden');
  $('hello').textContent = `Bonjour ${info.name} 👋`;
  $('closed').classList.toggle('hidden', !info.receiver);
  $('opened').classList.add('hidden');
  $('no-draw').classList.toggle('hidden', !!info.receiver);
  if (info.receiver) {
    $('target').textContent = info.receiver.name;
    $('target-role').innerHTML = '';
    const b = document.createElement('span');
    b.className = 'badge' + (info.receiver.role === 'cadre' ? ' cadre' : '');
    b.textContent = info.receiver.role === 'cadre' ? 'Cadre' : 'Élève';
    $('target-role').appendChild(b);
  }
}

async function login(id, password) {
  const blob = data.blobs[id];
  if (!blob) throw new Error('Participant introuvable.');
  try {
    return await decryptJSON(blob, password);
  } catch {
    throw new Error('Mot de passe incorrect.');
  }
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('who').value;
  const pw = $('password').value;
  const btn = $('login-btn');
  $('login-msg').className = 'msg';
  $('login-msg').textContent = '';
  btn.disabled = true; btn.textContent = 'Vérification…';
  try {
    if (!id) {
      if (pw && await openPanel(pw)) return;
      throw new Error('Choisis ton nom.');
    }
    const info = await login(id, pw);
    store(SESSION_KEY, { id, pw });
    $('password').value = '';
    showResult(info);
  } catch (err) {
    $('login-msg').className = 'msg error';
    $('login-msg').textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Voir mon tirage 🎁';
  }
});

async function openPanel(pw) {
  let files;
  try {
    const res = await fetch(`data/s.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    ({ files } = await decryptJSON(await res.json(), pw));
  } catch { return false; }
  const crypto = new URL('./crypto.js', import.meta.url).href;
  const url = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const fix = (code, map) => code.replace(/from '\.\/(\w+)\.js'/g, (m, n) => (map[n] ? `from '${map[n]}'` : m));
  const draw = url(files['draw.js']);
  const build = url(fix(files['build.js'], { crypto }));
  const main = url(fix(files['main.js'], { crypto, draw, build }));
  $('password').value = '';
  const root = document.querySelector('main');
  root.innerHTML = files['view.html'];
  root.classList.add('wide');
  document.querySelector('footer')?.remove();
  const mod = await import(main);
  await mod.start(pw, data);
  return true;
}

$('gift').addEventListener('click', () => {
  $('closed').classList.add('hidden');
  $('opened').classList.remove('hidden');
});

$('logout').addEventListener('click', () => {
  store(SESSION_KEY, null);
  $('result-card').classList.add('hidden');
  $('login-card').classList.remove('hidden');
  $('who').value = '';
});

(async () => {
  try {
    data = await loadData();
    $('section-name').textContent = data.section || 'Section 422';
    fillSelect();
    const s = load(SESSION_KEY);
    if (s && data.blobs[s.id]) {
      try { showResult(await login(s.id, s.pw)); } catch { store(SESSION_KEY, null); }
    }
  } catch (err) {
    $('login-msg').className = 'msg error';
    $('login-msg').textContent = err.message;
  }
})();
