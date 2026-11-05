# 🎅 Secret Santa — Section 422

Site statique (GitHub Pages) pour le Secret Santa de la section : élèves + cadres.

- **`index.html`** : chaque participant choisit son nom, entre son mot de passe et découvre la personne à qui il offre un cadeau.
- **`admin.html`** : voir tout le tirage et l'influencer (modifier qui offre à qui, paires forcées, exclusions, relancer, ajouter/retirer des participants, changer un mot de passe), puis publier.

## 🔒 Sécurité

Le dépôt et le site sont publics, donc **rien n'est stocké en clair** :
`data/data.json` contient, pour chaque personne, son résultat chiffré (AES-256-GCM, clé dérivée du mot de passe par PBKDF2) et une copie admin chiffrée avec le mot de passe admin.
Sans le bon mot de passe, personne ne peut lire le tirage, même en fouillant le code.

👉 Les identifiants sont dans **`LOGINS.md`**, qui est **volontairement exclu de git** (`.gitignore`). Si tu le committais, tout le monde pourrait lire tous les tirages. Tu peux le retélécharger à tout moment depuis l'admin (onglet *Publier → Télécharger LOGINS.md*).

## Mise en place

1. Mets les noms dans `participants.json` (`cadres` et `eleves`, + règles optionnelles) :
   ```json
   "regles": {
     "pasDeReciprocite": true,
     "exclusions": [["Prénom A", "Prénom B"]],
     "pairesForcees": [["Prénom C", "Prénom D"]]
   }
   ```
   (une exclusion est dans les deux sens ; ajoute `true` en 3e élément pour un sens unique)
2. `node scripts/generate.mjs https://<ton-user>.github.io/Secret-Santa-422/`
   → génère les mots de passe (8 caractères aléatoires), fait le tirage, écrit `data/data.json` et `LOGINS.md`.
   ⚠️ Relancer cette commande **régénère tous les mots de passe**. Ensuite, passe plutôt par l'admin.
3. Commit + push de `data/data.json`.
4. Sur GitHub : *Settings → Pages → Source : Deploy from a branch → `main` / `(root)`*.
5. Distribue à chacun **sa** ligne de `LOGINS.md`.

## Modifier le tirage depuis l'admin

Les changements faits dans `admin.html` sont locaux tant qu'ils ne sont pas publiés :

- **Publier sur GitHub** : crée un *fine-grained token* (GitHub → Settings → Developer settings → Fine-grained tokens) limité à ce dépôt avec *Contents: Read and write*, colle-le dans l'onglet *Publier*. Le site se met à jour en ~1 minute.
- **Ou** télécharge `data.json` et remplace `data/data.json` dans le dépôt à la main.

## Tester en local

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```
