# Publier une mise à jour — EEAM_BibleSong Pro

Deux choses **différentes** sur GitHub :

| | Commande | Contenu | Onglet GitHub | Qui |
|---|---|---|---|---|
| **Code source** | `git push origin main` | fichiers .js/.html… | **Code** | Claude / mainteneur |
| **Installeur (MAJ)** | `npm run publish` | `.exe` + `latest.yml` (+ `.blockmap`) | **Releases** | Toi, sur Windows |

Le bouton « Rechercher une MAJ » dans l'app lit **une Release PUBLIÉE** (pas un brouillon).
Le `git push` ne déclenche **aucune** MAJ pour les users — seul un Release publié le fait.

---

## Prérequis (une seule fois) — le token GitHub

1. github.com → **Settings** (profil) → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → *Generate new token*.
2. **Resource owner** : `elite-marketing-e`.
3. **Repository access** : *Only select repositories* → **Bible-Song**.
4. **Permissions** → **Contents : Read and write** (c'est la seule nécessaire).
5. *Generate* → **copie le token** (`github_pat_...`), on ne le revoit plus.

(Alternative « Classic » : scope `public_repo`.)

Optionnel : mettre `GH_TOKEN` en variable d'environnement Windows permanente pour ne pas le retaper.

---

## Publier une version

**Étape 1 — le code (fait par Claude, ou toi) :** bump de la version dans `package.json` + `git push origin main`.
La version publiée = celle de `package.json`. Elle doit être **> celle installée** chez les users.

**Étape 2 — l'installeur (toi, sur Windows) :**
```bash
set GH_TOKEN=github_pat_ton_token
npm run publish
```
- `npm run publish` build l'installeur de la **version courante** (sans re-bump) et crée un **brouillon de Release** sur GitHub avec `.exe`, `.exe.blockmap`, `latest.yml`.
- ⚠️ Lance-le **UNE seule fois** par version. Le relancer crée un **doublon** de brouillon (fichiers éclatés → MAJ cassée).
- N'utilise `npm run release:publish` **que** si tu veux que la commande **bump aussi** la version elle-même (workflow solo, sans Claude).

**Étape 3 — publier le brouillon (toi, sur GitHub) :**
1. github.com → repo → **Releases** → ouvre le brouillon `vX.Y.Z`.
2. Vérifie qu'il contient bien **les 3 fichiers**.
3. Clique **« Publish release »**.
   → À partir de là, le bouton MAJ des apps installées la détecte, télécharge et installe.

> Pour tout automatiser (publier directement sans brouillon) : dans `package.json` → `build.publish`, ajoute `"releaseType": "release"`. Moins sûr (pas de vérif avant diffusion).

---

## En cas de doublon / brouillon cassé
Supprime les brouillons foireux puis republie **une seule fois** :
```bash
gh release list --repo elite-marketing-e/Bible-Song
gh release delete vX.Y.Z --repo elite-marketing-e/Bible-Song --yes   # supprime le brouillon
npm run publish                                                       # recrée proprement
```

---

## Notes
- En **dev** (`npm start`), le bouton MAJ affiche « échec/idle » : normal, la MAJ ne marche que dans l'app **installée**.
- Sans **certificat de signature Windows**, la MAJ fonctionne mais SmartScreen peut afficher un avertissement à l'installation.
- Le dossier `saved configurations/` et `server/certs/` ne sont **pas** dans le dépôt (voir `.gitignore`) ; ils restent sur ta machine pour le build/usage local.
