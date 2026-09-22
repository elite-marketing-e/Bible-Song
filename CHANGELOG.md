# Journal des versions — EEAM_BibleSong Pro

Chaque nouvelle version porte un numéro plus élevé : réinstaller l'installeur correspondant
**met à jour l'application en place** (même identifiant d'app) et **conserve tes réglages**
(design, profils, paramètres — stockés côté utilisateur, non supprimés à la désinstallation).

La version installée est affichée dans **Settings → Updates/Feedback → « Version installée »**.

---

## 2.1.1 — 2026-09-20

**Stabilité du mode FS / LT / SD**
- Le Live (et les écrans qui en héritent) ne retombe plus en Fullscreen à la réouverture de
  Settings, au changement d'onglet, à la modification d'un paramètre ou à la projection d'un
  nouveau verset/chant. Le mode projeté suit désormais le mode **réellement choisi** par sortie.
- Le mode SD (SD-G / SD-D) est préservé en mode workspace « focused » (il était écrasé en FS).

**Design par sortie (Option B)**
- Chaque sortie (Live, écran connecté, écran distant) a son design complet : alignement, police,
  taille, format (gras/italique/souligné), casse, boîte de référence, fond, typographie —
  routés par sortie, sans que modifier une sortie ne déteigne sur les autres.
- Boîte de référence : couleur, arrondi, bordure, souligné regroupés dans **Background** ;
  casse de la référence (—/AA/aa/Aa) rétablie dans **Typography & colors**.

**Divers**
- Marqueur de build vert « Build … » retiré des écrans de sortie.
- L'export de configuration inclut bien tout le design par sortie + les profils de base.
- Version de l'app visible dans Settings → Updates.

## 2.1.0 — base

- Application desktop Electron (**EEAM_BibleSong Pro**), une vraie fenêtre par sortie.
- Serveur réseau local (panneau, affichages, téléphone) avec appairage.
- Modes d'affichage FS / LT / SD, contour progressif, ajustement de texte déterministe.
