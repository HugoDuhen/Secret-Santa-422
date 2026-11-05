import { open } from './crypto.js';

const $ = (id) => document.getElementById(id);
const SESSION_KEY = 'ss-session';
let data = null;

function store(value) {
  try { value === null ? sessionStorage.removeItem(SESSION_KEY) : sessionStorage.setItem(SESSION_KEY, value); } catch {}
}
function load() {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}

async function loadData() {
  const res = await fetch(`data/data.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Impossible de charger les données.');
  return res.json();
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
    if (info.receiver.role) {
      const b = document.createElement('span');
      b.className = 'badge' + (info.receiver.role === 'cadre' ? ' cadre' : '');
      b.textContent = info.receiver.role === 'cadre' ? 'Cadre' : 'Élève';
      $('target-role').appendChild(b);
    }
  }
}

async function mount(pw, payload) {
  const { files } = payload;
  const crypto = new URL('./crypto.js', import.meta.url).href;
  const url = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const fix = (code, map) => code.replace(/from '\.\/(\w+)\.js'/g, (m, n) => (map[n] ? `from '${map[n]}'` : m));
  const mods = {};
  for (const name of payload.order) mods[name] = url(fix(files[`${name}.js`], { crypto, ...mods }));
  const root = document.querySelector('main');
  root.innerHTML = files[payload.view];
  root.classList.add('wide');
  document.querySelector('footer')?.remove();
  const mod = await import(mods[payload.order[payload.order.length - 1]]);
  await mod.start(pw, payload, data);
}

async function enter(pw) {
  const payload = await open(data, pw);
  if (!payload) return false;
  if (payload.files) await mount(pw, payload);
  else showResult(payload);
  return true;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('password').value;
  const btn = $('login-btn');
  $('login-msg').className = 'msg';
  $('login-msg').textContent = '';
  if (!pw.trim()) return;
  btn.disabled = true; btn.textContent = 'Vérification…';
  try {
    if (!(await enter(pw))) throw new Error('Mot de passe incorrect.');
    store(pw);
    if ($('password')) $('password').value = '';
  } catch (err) {
    if ($('login-msg')) { $('login-msg').className = 'msg error'; $('login-msg').textContent = err.message; }
  } finally {
    btn.disabled = false; btn.textContent = 'Voir mon tirage 🎁';
  }
});

$('gift').addEventListener('click', () => {
  $('closed').classList.add('hidden');
  $('opened').classList.remove('hidden');
});

$('logout').addEventListener('click', () => {
  store(null);
  $('result-card').classList.add('hidden');
  $('login-card').classList.remove('hidden');
});

(async () => {
  try {
    data = await loadData();
    const pw = load();
    if (pw && !(await enter(pw))) store(null);
  } catch (err) {
    $('login-msg').className = 'msg error';
    $('login-msg').textContent = err.message;
  }
})();
