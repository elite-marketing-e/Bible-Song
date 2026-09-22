# Bible Song Pro — Serveur réseau

Le serveur transforme OBS en simple afficheur : les commandes (versets,
chants) peuvent venir d'un autre PC du réseau, et un téléphone peut
piloter la projection.

## Démarrage (PC principal)

1. **Node.js requis** (une seule fois) : téléchargez la version **LTS**
   sur <https://nodejs.org> et installez-la (Suivant → Suivant).
2. Double-cliquez **`start-server.bat`**.
3. La fenêtre affiche : le **code d'appairage**, les **liens
   d'affichage** et le lien du **panneau**. Laissez-la ouverte.

## Les liens

| Lien | Usage |
|---|---|
| `http://<ip>:5510/?outputId=obs` | À coller dans une **source navigateur OBS** (ou à ouvrir sur un écran/PC). Affiche ce qui est projeté, plein écran, avec le design de cette sortie. |
| `http://<ip>:5510/?outputId=screen_1` | Pareil, avec le design de l'écran 1 — illimité, un lien par sortie. |
| `http://<ip>:5510/panel` | Le panneau de contrôle depuis un autre PC du réseau. |

Les liens sont **fixes et réutilisables** : le code d'appairage ne change
pas d'un lancement à l'autre (il est gardé dans
`bsp-server-config.json` ; supprimez ce fichier pour en générer un
nouveau).

## Appairage strict

Chaque connexion doit présenter le code d'appairage affiché au
démarrage. Sans lui — ou avec un code faux — le serveur **ferme la
connexion**. Saisissez ce code dans le panneau (section RemoteShow /
Réseau) et sur les pages distantes.

## Téléphone (étape suivante)

Un seul téléphone de contrôle à la fois : le serveur tient un « slot ».
Si le téléphone actif se déconnecte, un autre peut scanner le QR et
reprendre la main. La page téléphone arrive à l'étape ③.

## Portée : réseau local ou Internet

Par défaut : **réseau local** (les liens utilisent l'IP LAN du PC).
Pour un accès **Internet**, il faut au choix :

- une **redirection de port** (5510 + 5511) sur votre routeur vers ce
  PC — puis utilisez votre IP publique dans les liens ; ou
- un **tunnel** (ex. Cloudflare Tunnel, gratuit) — recommandé, pas de
  configuration du routeur.

Passez `"scope": "internet"` dans `bsp-server-config.json` pour que les
liens générés l'indiquent. Le serveur écoute déjà sur toutes les
interfaces ; la différence est uniquement l'accessibilité depuis
l'extérieur.

## Dépannage

- **« Le port 5510 est déjà utilisé »** : un autre programme occupe le
  port — fermez-le, ou changez `httpPort` dans
  `bsp-server-config.json`.
- **Le téléphone ne se connecte pas** : PC et téléphone doivent être
  sur le **même réseau Wi-Fi** ; vérifiez aussi le pare-feu Windows
  (autorisez Node.js sur les réseaux privés à la première demande).
