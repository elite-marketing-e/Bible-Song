#!/usr/bin/env node
/*
 * Bible Song Pro — génération du certificat HTTPS local (mkcert)
 * -------------------------------------------------------------------
 * Crée server/certs/{cert.pem,key.pem} couvrant localhost, 127.0.0.1,
 * le nom de la machine et toutes les IP LAN actuelles. Une fois les
 * certificats présents, bsp-server.js sert en HTTPS + WSS — ce qui
 * débloque, côté navigateur, la détection multi-écrans et le
 * positionnement de la fenêtre de projection (contexte sécurisé exigé).
 *
 * mkcert n'est PAS requis au préalable : si absent, ce script tente de
 * l'installer via winget (Windows 11), puis continue. Sinon il indique
 * comment l'installer à la main.
 *
 * Si vous changez de réseau (nouvelle IP LAN), relancez ce script pour
 * régénérer un certificat couvrant la nouvelle IP. Vos écrans/designs
 * sauvegardés ne stockent PAS l'IP : eux ne bougent pas.
 */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CERT_DIR = path.join(__dirname, 'certs');

function lanIps() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.values(ifaces).forEach((list) => (list || []).forEach((a) => {
    if (a && a.family === 'IPv4' && !a.internal) out.push(a.address);
  }));
  return out;
}

// Résout le chemin de mkcert : d'abord le PATH, puis les emplacements où
// winget dépose son raccourci (le PATH du processus courant n'est pas
// rafraîchi après une install winget dans la même session).
function resolveMkcert() {
  const candidates = [];
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['mkcert'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout) {
    candidates.push(onPath.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]);
  }
  if (process.platform === 'win32') {
    const la = process.env.LOCALAPPDATA || '';
    if (la) {
      candidates.push(path.join(la, 'Microsoft', 'WinGet', 'Links', 'mkcert.exe'));
    }
  }
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch (_) {}
  }
  return null;
}

function tryWingetInstall() {
  if (process.platform !== 'win32') return false;
  const hasWinget = spawnSync('winget', ['--version'], { encoding: 'utf8' });
  if (hasWinget.status !== 0) return false;
  console.log('\n  mkcert introuvable — installation via winget (peut demander une autorisation)…\n');
  const r = spawnSync('winget', [
    'install', '--id', 'FiloSottile.mkcert', '-e',
    '--silent', '--accept-package-agreements', '--accept-source-agreements'
  ], { stdio: 'inherit' });
  return r.status === 0;
}

let mkcert = resolveMkcert();
if (!mkcert) {
  tryWingetInstall();
  mkcert = resolveMkcert();
}

if (!mkcert) {
  console.error('\n  ✖ mkcert introuvable et l\'installation automatique n\'a pas abouti.\n');
  console.error('  Installez-le à la main, PUIS relancez ce script :');
  console.error('   1. Ouvrez PowerShell et tapez :  winget install FiloSottile.mkcert');
  console.error('   2. FERMEZ puis rouvrez la fenêtre (pour rafraîchir le PATH).');
  console.error('   3. Double-cliquez de nouveau make-cert.bat.');
  console.error('\n  (ou binaire manuel : https://github.com/FiloSottile/mkcert/releases)\n');
  process.exit(1);
}

fs.mkdirSync(CERT_DIR, { recursive: true });

const names = ['localhost', '127.0.0.1', '::1', os.hostname(), ...lanIps()];
const unique = [...new Set(names.filter(Boolean))];

console.log('\n  mkcert : ' + mkcert);
console.log('  Installation de l\'autorité racine locale (mkcert -install)…');
console.log('  (une fenêtre d\'autorisation peut apparaître la première fois)');
try {
  execFileSync(mkcert, ['-install'], { stdio: 'inherit' });
} catch (e) {
  console.error('  (mkcert -install a échoué : ' + (e && e.message) + ')');
}

console.log('\n  Génération du certificat pour :');
console.log('    ' + unique.join(', '));
try {
  execFileSync(mkcert, [
    '-cert-file', path.join(CERT_DIR, 'cert.pem'),
    '-key-file', path.join(CERT_DIR, 'key.pem'),
    ...unique
  ], { stdio: 'inherit' });
} catch (e) {
  console.error('\n  ✖ Échec de la génération : ' + (e && e.message) + '\n');
  process.exit(1);
}

console.log('\n  ✔ Certificats écrits dans : ' + CERT_DIR);
console.log('    Relancez start-server.bat — le serveur passera en HTTPS + WSS.');
console.log('    Sur chaque appareil DISTANT (autre PC, écran, téléphone), installez');
console.log('    aussi la CA racine mkcert pour éviter tout avertissement — voir');
console.log('    README-SERVEUR.md, section « HTTPS ».\n');
