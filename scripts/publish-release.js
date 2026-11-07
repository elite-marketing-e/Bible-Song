#!/usr/bin/env node
/*
 * Publie le release GitHub de la version courante, à partir de dist/ (après « npm run dist »).
 * Usage : npm run release:gh
 *
 * Fait exactement ce que Claude faisait à la main, de façon sûre :
 *   1. vérifie les 3 fichiers (installeur, blockmap, latest.yml) et que latest.yml = version ;
 *   2. crée le release en BROUILLON avec les petits fichiers ;
 *   3. envoie l'installeur (~150 Mo) avec jusqu'à 3 essais (coupure réseau) ;
 *   4. publie le release et le marque « Latest » ; affiche le contrôle final.
 * Un brouillon est invisible pour les mises à jour : rien n'est proposé aux PC tant que tout
 * n'est pas en ligne. Relancer la commande reprend là où elle s'est arrêtée.
 * Nécessite GitHub CLI (gh) connecté : « gh auth login » (une seule fois).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPO = 'elite-marketing-e/Bible-Song';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = 'v' + version;
const dist = path.join(ROOT, 'dist');
const exe = path.join(dist, `EEAM-BibleSong-Pro-Setup-${version}.exe`);
const blockmap = exe + '.blockmap';
const latest = path.join(dist, 'latest.yml');

function fail(msg) { console.error('\n✖ ' + msg + '\n'); process.exit(1); }
function gh(args, opts) {
  const r = spawnSync('gh', args, Object.assign({ encoding: 'utf8', cwd: ROOT, shell: false, windowsHide: true }, opts || {}));
  if (r.error) fail('GitHub CLI (gh) introuvable. Installez-le : https://cli.github.com puis « gh auth login ».');
  return r;
}
function step(t) { console.log('\n▶ ' + t); }

// 1. Vérifications
step(`Release ${tag} — vérification de dist/`);
[exe, blockmap, latest].forEach((f) => { if (!fs.existsSync(f)) fail(`Fichier manquant : ${path.relative(ROOT, f)}. Lancez d'abord « npm run dist ».`); });
const yml = fs.readFileSync(latest, 'utf8');
const ymlVersion = (yml.match(/^version:\s*(.+)$/m) || [])[1];
if ((ymlVersion || '').trim() !== version) fail(`dist/latest.yml est pour la version ${ymlVersion}, pas ${version}. Relancez « npm run dist ».`);
const auth = gh(['auth', 'status']);
if (auth.status !== 0) fail('GitHub CLI n\'est pas connecté. Lancez « gh auth login » puis recommencez.');
console.log(`  ✓ 3 fichiers présents, latest.yml = ${version}, gh connecté`);

// 2. Brouillon (ou reprise d'un brouillon existant)
const view = gh(['release', 'view', tag, '--repo', REPO, '--json', 'isDraft,assets']);
let existing = null;
if (view.status === 0) { try { existing = JSON.parse(view.stdout); } catch (_) {} }
if (existing && !existing.isDraft) {
  const names = (existing.assets || []).map((a) => a.name);
  if ([exe, blockmap, latest].every((f) => names.includes(path.basename(f)))) { console.log(`\n✓ ${tag} est déjà publié et complet. Rien à faire.`); process.exit(0); }
}
if (!existing) {
  step('Création du release en brouillon (blockmap + latest.yml)');
  const notesArg = process.argv[2] ? ['--notes', process.argv.slice(2).join(' ')] : ['--generate-notes'];
  const c = gh(['release', 'create', tag, blockmap, latest, '--repo', REPO, '--title', version, '--target', 'main', '--draft'].concat(notesArg), { stdio: 'inherit' });
  if (c.status !== 0) fail('Création du release impossible (voir le message ci-dessus).');
} else {
  step('Brouillon existant trouvé — reprise');
  gh(['release', 'upload', tag, blockmap, latest, '--repo', REPO, '--clobber'], { stdio: 'inherit' });
}

// 3. Installeur avec réessais
let ok = false;
for (let i = 1; i <= 3 && !ok; i++) {
  step(`Envoi de l'installeur (${Math.round(fs.statSync(exe).size / 1048576)} Mo) — essai ${i}/3`);
  ok = gh(['release', 'upload', tag, exe, '--repo', REPO, '--clobber'], { stdio: 'inherit' }).status === 0;
  if (!ok && i < 3) { console.log('  … coupure, nouvel essai dans 10 s'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000); }
}
if (!ok) fail('L\'installeur n\'a pas pu être envoyé. Vérifiez la connexion puis relancez « npm run release:gh » (le brouillon sera repris).');

// 4. Publication + contrôle
step('Publication (Latest)');
if (gh(['release', 'edit', tag, '--repo', REPO, '--draft=false', '--latest'], { stdio: 'inherit' }).status !== 0) fail('Publication impossible (voir le message ci-dessus).');
const check = gh(['release', 'view', tag, '--repo', REPO, '--json', 'isDraft,assets,url']);
const info = JSON.parse(check.stdout || '{}');
const names = (info.assets || []).map((a) => a.name);
const missing = [exe, blockmap, latest].map((f) => path.basename(f)).filter((n) => !names.includes(n));
if (info.isDraft || missing.length) fail(`Contrôle final KO : ${info.isDraft ? 'encore en brouillon ; ' : ''}${missing.length ? 'manquant : ' + missing.join(', ') : ''}`);
console.log(`\n✅ ${tag} publié et complet (3 fichiers) : ${info.url}\n   Les PC peuvent faire « Check for Updates ».\n`);
