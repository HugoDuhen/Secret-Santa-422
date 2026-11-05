// Algorithme de tirage au sort avec règles (paires forcées, exclusions, pas de réciprocité)

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function prepare(ids, rules = {}) {
  const set = new Set(ids);
  const forced = new Map();
  for (const [g, r] of rules.forced || []) if (set.has(g) && set.has(r)) forced.set(g, r);
  const excl = new Set();
  for (const [a, b] of rules.exclusions || []) excl.add(a + '>' + b);
  const noRecip = !!rules.noReciprocal && ids.length > 2;
  const single = !!rules.singleCycle;
  return { forced, excl, noRecip, single };
}

/**
 * Renvoie un objet { giverId: receiverId } ou lève une erreur si impossible.
 */
export function draw(ids, rules = {}, rng = Math.random) {
  if (ids.length < 2) throw new Error('Il faut au moins 2 participants.');
  const { forced, excl, noRecip, single } = prepare(ids, rules);

  const forcedTargets = [...forced.values()];
  if (new Set(forcedTargets).size !== forcedTargets.length)
    throw new Error('Deux paires forcées visent la même personne.');
  for (const [g, r] of forced) if (g === r) throw new Error('Une paire forcée relie une personne à elle-même.');

  if (single) return drawSingleCycle(ids, forced, excl, rng);

  for (let attempt = 0; attempt < 300; attempt++) {
    // Les personnes avec paire forcée d'abord, puis le reste dans un ordre aléatoire
    const givers = [...ids.filter((id) => forced.has(id)), ...shuffle(ids.filter((id) => !forced.has(id)), rng)];
    const assign = new Map();
    const taken = new Set(forcedTargets);
    let steps = 0;

    const ok = (g, r) => {
      if (g === r || taken.has(r)) return false;
      if (excl.has(g + '>' + r)) return false;
      if (noRecip && assign.get(r) === g) return false;
      return true;
    };

    const dfs = (i) => {
      if (++steps > 20000) return false;
      if (i === givers.length) return true;
      const g = givers[i];
      if (forced.has(g)) {
        assign.set(g, forced.get(g));
        if (dfs(i + 1)) return true;
        assign.delete(g);
        return false;
      }
      for (const r of shuffle(ids, rng)) {
        if (!ok(g, r)) continue;
        assign.set(g, r);
        taken.add(r);
        if (dfs(i + 1)) return true;
        assign.delete(g);
        taken.delete(r);
      }
      return false;
    };

    if (dfs(0)) return Object.fromEntries(assign);
  }
  throw new Error('Aucun tirage possible avec ces règles. Retire une exclusion ou une paire forcée.');
}

// Une seule grande boucle : on construit une chaîne A → B → C → … → A
function drawSingleCycle(ids, forced, excl, rng) {
  const ok = (g, r) => g !== r && !excl.has(g + '>' + r) && (!forced.has(g) || forced.get(g) === r);
  const forcedTargets = new Set(forced.values());

  for (let attempt = 0; attempt < 300; attempt++) {
    const start = ids[Math.floor(rng() * ids.length)];
    const path = [start];
    const used = new Set(path);
    let steps = 0;

    const dfs = () => {
      if (++steps > 50000) return false;
      const g = path[path.length - 1];
      if (path.length === ids.length) return ok(g, start);
      const candidates = forced.has(g) ? [forced.get(g)] : shuffle(ids, rng);
      for (const r of candidates) {
        if (used.has(r) || !ok(g, r)) continue;
        // une cible forcée ne peut être atteinte que par son offreur imposé
        if (forcedTargets.has(r) && !(forced.has(g) && forced.get(g) === r)) continue;
        path.push(r); used.add(r);
        if (dfs()) return true;
        path.pop(); used.delete(r);
      }
      return false;
    };

    if (forcedTargets.has(start) || !dfs()) continue;
    const out = {};
    path.forEach((g, i) => { out[g] = path[(i + 1) % path.length]; });
    return out;
  }
  throw new Error('Impossible de faire une seule boucle avec ces règles. Retire une exclusion ou une paire forcée.');
}

/**
 * Vérifie un tirage. Renvoie { errors: [], warnings: [] } (messages en texte).
 */
export function validate(ids, assignments, rules = {}, nameOf = (id) => id) {
  const errors = [];
  const warnings = [];
  const { forced, excl, noRecip, single } = prepare(ids, rules);
  const received = new Map();

  for (const g of ids) {
    const r = assignments[g];
    if (!r) { errors.push(`${nameOf(g)} n'a personne à qui offrir.`); continue; }
    if (!ids.includes(r)) { errors.push(`${nameOf(g)} offre à une personne inconnue.`); continue; }
    if (r === g) errors.push(`${nameOf(g)} s'offre un cadeau à lui-même.`);
    received.set(r, (received.get(r) || 0) + 1);
    if (excl.has(g + '>' + r)) warnings.push(`Exclusion non respectée : ${nameOf(g)} → ${nameOf(r)}.`);
    if (forced.has(g) && forced.get(g) !== r) warnings.push(`Paire forcée non respectée : ${nameOf(g)} devrait offrir à ${nameOf(forced.get(g))}.`);
    if (noRecip && assignments[r] === g && g < r) warnings.push(`Réciprocité : ${nameOf(g)} ⇄ ${nameOf(r)}.`);
  }
  for (const id of ids) {
    const n = received.get(id) || 0;
    if (n === 0) errors.push(`${nameOf(id)} ne reçoit aucun cadeau.`);
    if (n > 1) errors.push(`${nameOf(id)} reçoit ${n} cadeaux.`);
  }
  if (single && !errors.length) {
    const n = cycles(ids, assignments).length;
    if (n > 1) warnings.push(`Le tirage forme ${n} boucles au lieu d'une seule.`);
  }
  return { errors, warnings };
}

/** Découpe le tirage en boucles : [[a, b, c], [d, e]] */
export function cycles(ids, assignments) {
  const seen = new Set();
  const out = [];
  for (const start of ids) {
    if (seen.has(start)) continue;
    const loop = [];
    let cur = start;
    while (cur && !seen.has(cur) && ids.includes(cur)) {
      seen.add(cur);
      loop.push(cur);
      cur = assignments[cur];
    }
    out.push(loop);
  }
  return out;
}
