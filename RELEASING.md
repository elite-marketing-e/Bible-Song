# Publier une mise à jour — EEAM_BibleSong Pro

Deux choses **différentes** sur GitHub :

| | Commande | Contenu | Onglet GitHub |
|---|---|---|---|
| **Code source** | `git push origin main` | fichiers .js/.html… | **Code** |
| **Installeur (MAJ)** | `npm run dist` puis `npm run release:gh` | `.exe` + `.exe.blockmap` + `latest.yml` | **Releases** |

Le bouton « Rechercher une MAJ » de l'app lit **le dernier Release PUBLIÉ** (jamais un brouillon).
Un `git push` seul ne déclenche **aucune** mise à jour chez les users.

---

## Prérequis (une seule fois)

1. Installer **GitHub CLI** : https://cli.github.com (installeur Windows).
2. Dans un terminal, se connecter avec le compte `elite-marketing-e` :
   ```bash
   gh auth login
   ```
   Choisir : *GitHub.com* → *HTTPS* → *Login with a web browser*, puis valider dans le navigateur.

> Pas besoin de token « GH_TOKEN » pour cette méthode : `gh` utilise ta connexion.

---

## Publier une version (3 commandes)

**1. Monter la version** (si ce n'est pas déjà fait) puis pousser le code :
```bash
npm version patch --no-git-tag-version
```
```bash
git add -A
```
```bash
git commit -m "vX.Y.Z"
```
```bash
git push origin main
```
La version publiée = celle de `package.json`. Elle doit être **supérieure** à celle installée chez les users.

**2. Construire l'installeur :**
```bash
npm run dist
```

**3. Publier le release :**
```bash
npm run release:gh
```
Le script :
- vérifie que `dist/` contient les **3 fichiers** et que `latest.yml` correspond à la version ;
- crée le release en **brouillon** (invisible pour les MAJ tant qu'il n'est pas complet) ;
- envoie l'installeur (~150 Mo) avec **3 essais** en cas de coupure réseau ;
- **publie** le release en « Latest » et fait un **contrôle final**.

S'il s'arrête (coupure Internet…), **relance simplement `npm run release:gh`** : il reprend le brouillon là où il en était.
Notes de version personnalisées (optionnel) : `npm run release:gh -- "Correctifs écrans et presets"`.

---

## Méthode manuelle (site GitHub, sans terminal)
1. github.com/elite-marketing-e/Bible-Song → **Releases** → **Draft a new release**.
2. **Choose a tag** : tape `vX.Y.Z` → *Create new tag* ; **Target** : `main`.
3. **Release title** : `X.Y.Z`.
4. Glisse les **3 fichiers** depuis `dist/` : `EEAM-BibleSong-Pro-Setup-X.Y.Z.exe`, `…exe.blockmap`, `latest.yml`. **Attends la fin de l'envoi** des 3.
5. Coche **Set as the latest release**, puis **Publish release**.

---

## À ne pas faire
- ❌ `npm run publish` / `npm run release:publish` : electron-builder crée des **brouillons en double** aux fichiers éclatés (MAJ cassée).
- ❌ Publier avant que les **3 fichiers** soient en ligne.
- ❌ Ajouter un commentaire `# …` à la fin d'une commande dans le terminal Windows (ce n'est pas un commentaire : ça casse la commande).

## Notes
- En **dev** (`npm start`), le bouton MAJ affiche « échec/idle » : normal, la MAJ ne marche que dans l'app **installée**.
- Sans **certificat de signature Windows**, SmartScreen peut afficher un avertissement à l'installation.
- `saved configurations/` et `server/certs/` ne sont **pas** dans le dépôt (`.gitignore`).
