#!/usr/bin/env node
/*
 * EEAM_BibleSong Pro — serveur réseau (étape 1)
 * ------------------------------------------------------------------
 * Rôle : hub de synchronisation entre le panneau de contrôle, les
 * affichages distants (OBS/écrans) et le téléphone de contrôle.
 *
 *  - HTTP  (port 5510) : sert les fichiers du projet (panneau, page
 *    d'affichage, future page téléphone) + /api/info.
 *  - WS    (port 5511) : relais RS_ENVELOPE — le protocole que le
 *    panneau parle déjà — avec APPAIRAGE STRICT : toute enveloppe
 *    dont le code ne correspond pas est rejetée et la connexion
 *    fermée (le panneau, lui, ne fait que journaliser le décalage —
 *    l'application réelle se fait ici, côté serveur).
 *  - Slot téléphone : un seul téléphone de contrôle actif à la fois ;
 *    si sa connexion tombe, un autre peut se déclarer et reprendre.
 *
 * Zéro dépendance : la poignée de main et le framing WebSocket sont
 * implémentés sur les modules natifs de Node, pour que le lancement
 * soit un double-clic — sans npm install.
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ── Configuration ───────────────────────────────────────────────────
// Persistée à côté du script ; le code d'appairage est généré au
// premier lancement et réutilisé ensuite (lien « unique réutilisable »).

// --http=NNNN --ws=NNNN --config=CHEMIN permettent de lancer une seconde
// instance (tests, autre projet) sans toucher à celle en service.
function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}

const CONFIG_PATH = argValue('config') || path.join(__dirname, 'bsp-server-config.json');
const PROJECT_ROOT = path.join(__dirname, '..');

// Version applicative lue depuis package.json — exposée par /api/info pour que le panneau
// affiche la version installée (mode navigateur/OBS, sans IPC Electron). Repli sur '?' si absent.
let APP_VERSION = '?';
try { APP_VERSION = (JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version) || '?'; } catch (_) {}

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) {}
  let dirty = false;
  const argHttp = parseInt(argValue('http'), 10);
  const argWs = parseInt(argValue('ws'), 10);
  if (Number.isInteger(argHttp)) cfg.httpPort = argHttp;
  if (Number.isInteger(argWs)) cfg.wsPort = argWs;
  if (!Number.isInteger(cfg.httpPort)) { cfg.httpPort = 5510; dirty = true; }
  if (!Number.isInteger(cfg.wsPort)) { cfg.wsPort = 5511; dirty = true; }
  if (!/^[0-9A-Z]{4,32}$/.test(String(cfg.pairCode || ''))) {
    cfg.pairCode = String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres, format du panneau
    dirty = true;
  }
  if (cfg.scope !== 'internet') { cfg.scope = 'local'; if (cfg.scope !== 'local') dirty = true; }
  if (dirty) {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (_) {}
  }
  return cfg;
}

const config = loadConfig();

// ── TLS (HTTPS + WSS) ───────────────────────────────────────────────
// Si des certificats existent dans server/certs/, on sert en HTTPS + WSS.
// C'est ce qui débloque, côté navigateur, la détection multi-écrans et le
// positionnement de la fenêtre de projection (APIs qui exigent un contexte
// sécurisé), et permet aux appareils distants (IP LAN) d'en profiter aussi.
// Sans certificats : repli HTTP + WS, exactement comme avant.
// Générer les certificats : double-clic sur server/make-cert.bat (mkcert).
const CERT_DIR = argValue('certs') || path.join(__dirname, 'certs');
function loadTls() {
  try {
    const cert = fs.readFileSync(path.join(CERT_DIR, 'cert.pem'));
    const key = fs.readFileSync(path.join(CERT_DIR, 'key.pem'));
    if (cert && key && cert.length && key.length) return { cert, key };
  } catch (_) {}
  return null;
}
const tlsOptions = loadTls();
// SERVICE DOUBLE (HTTP + HTTPS en parallèle) :
//  - HTTP + WS sont TOUJOURS actifs (ports httpPort/wsPort). Tous les afficheurs distants
//    — OBS, écrans, téléphone — s'y connectent sans certificat : un cert mkcert n'est
//    approuvé que là où sa CA racine est installée, donc HTTP est le transport fiable.
//  - Si des certificats existent, HTTPS + WSS sont servis EN PLUS (ports httpsPort/wssPort).
//    Ça donne un lien PANNEAU sécurisé (https) pour un PC de contrôle distant, où la
//    détection d'écran exige un contexte sécurisé. Ce PC-là doit avoir la CA mkcert.
// Les liens principaux restent http ; le lien panneau https est un bonus.
const httpsAvailable = !!tlsOptions;
const httpsPort = Number.isInteger(config.httpsPort) ? config.httpsPort : 5443;
const wssPort = Number.isInteger(config.wssPort) ? config.wssPort : (config.wsPort + 1);

function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((a) => {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    });
  });
  // Rank so the FIRST address is the one most likely reachable by other devices.
  // The iPhone Personal Hotspot subnet (172.20.10.x, hard-wired by Apple) isolates its
  // clients, so a phone can't reach the PC there — push it last. Normal home/office LANs
  // (192.168.x, 10.x) come first.
  const rank = (ip) => {
    if (/^172\.20\.10\./.test(ip)) return 5;   // iPhone hotspot — worst
    if (/^192\.168\./.test(ip)) return 0;       // typical router LAN — best
    if (/^10\./.test(ip)) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2; // other private
    return 3;
  };
  return out
    .map((ip, i) => ({ ip, i }))
    .sort((a, b) => (rank(a.ip) - rank(b.ip)) || (a.i - b.i))
    .map((x) => x.ip);
}

// ── Serveur HTTP : fichiers du projet + API ─────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon'
};

// ── Cache de médias ─────────────────────────────────────────────────
// Le panneau téléverse la banque d'images/vidéos ici ; les payloads réseau
// référencent ensuite /media/<id> au lieu d'un data URL de plusieurs Mo —
// chaque affichage télécharge le fichier UNE fois puis le garde en cache.

const MEDIA_DIR = path.join(__dirname, 'media-cache');
try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch (_) {}

const EXT_BY_MIME = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/svg+xml': '.svg', 'video/mp4': '.mp4', 'video/webm': '.webm'
};

function mediaSafeId(raw) {
  const id = String(raw || '');
  return /^[0-9a-zA-Z_-]{1,64}$/.test(id) ? id : '';
}

function mediaFindFile(id) {
  try {
    const hit = fs.readdirSync(MEDIA_DIR).find((f) => f.startsWith(id + '.'));
    return hit ? path.join(MEDIA_DIR, hit) : null;
  } catch (_) { return null; }
}

function mediaListIds() {
  try { return fs.readdirSync(MEDIA_DIR).map((f) => f.split('.')[0]); } catch (_) { return []; }
}

function requestHasPair(req) {
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    const token = String(q.get('pair') || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
    return token === config.pairCode;
  } catch (_) { return false; }
}

// Shared request handler for the HTTP (and, when certs exist, HTTPS) servers.
function bspRequestHandler(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // ── Médias ──
  if (urlPath.startsWith('/media/')) {
    const id = mediaSafeId(urlPath.slice('/media/'.length));
    if (!id) { res.writeHead(400); res.end('Bad id'); return; }

    if (req.method === 'GET') {
      const file = mediaFindFile(id);
      if (!file) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(file).toLowerCase();
      const mime = Object.keys(EXT_BY_MIME).find((m) => EXT_BY_MIME[m] === ext) || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        // Les ids ne sont jamais réutilisés pour un autre contenu : cache long.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    if (req.method === 'POST') {
      // Téléversement par le panneau uniquement : le code d'appairage est exigé.
      if (!requestHasPair(req)) { res.writeHead(401); res.end('Pairing required'); return; }
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 80 * 1024 * 1024) { res.writeHead(413); res.end('Too large'); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        try {
          const { dataUrl } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const m = /^data:([a-z0-9.+/-]+);base64,(.*)$/i.exec(String(dataUrl || ''));
          if (!m || !EXT_BY_MIME[m[1].toLowerCase()]) { res.writeHead(415); res.end('Unsupported type'); return; }
          const ext = EXT_BY_MIME[m[1].toLowerCase()];
          fs.writeFileSync(path.join(MEDIA_DIR, id + ext), Buffer.from(m[2], 'base64'));
          log('media_stored', `${id}${ext}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400); res.end('Bad payload');
        }
      });
      return;
    }

    res.writeHead(405); res.end('Method not allowed');
    return;
  }

  if (urlPath === '/api/media') {
    if (!requestHasPair(req)) { res.writeHead(401); res.end('Pairing required'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ids: mediaListIds() }));
    return;
  }

  if (urlPath === '/api/info') {
    // The pairing code is exposed ONLY to same-machine callers (the control panel served on
    // 127.0.0.1). This lets the panel adopt the server's real code and stamp correct links,
    // without leaking it to remote devices (phone/OBS on the LAN never receive it).
    const ra = String((req.socket && req.socket.remoteAddress) || '');
    const isLocal = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
    const payload = {
      app: 'EEAM_BibleSong Pro Server',
      version: 1,
      appVersion: APP_VERSION,
      httpPort: config.httpPort,
      wsPort: config.wsPort,
      httpsPort: httpsAvailable ? httpsPort : null,
      wssPort: httpsAvailable ? wssPort : null,
      scope: config.scope,
      requiresPairing: true,
      clients: describeClients(),
      lan: lanAddresses()
    };
    if (isLocal) payload.pairCode = config.pairCode;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(payload));
    return;
  }

  // Fichiers statiques du projet. La racine sert la page d'affichage :
  // c'est le lien qu'on colle dans une source navigateur OBS.
  let rel = urlPath === '/' ? '/BSP_display.html'
    : urlPath === '/panel' ? '/Bible Song Pro panel.html'
    : urlPath === '/phone' ? '/BSP_phone.html'
    : urlPath;
  const full = path.join(PROJECT_ROOT, rel);
  if (!full.startsWith(path.resolve(PROJECT_ROOT))) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found: ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      // Anti-cache renforcé : OBS (CEF) et Electron gardaient d'anciens JS/HTML, d'où
      // « mes corrections ne changent rien ». no-store + Pragma + Expires forcent le rechargement.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
}

const httpServer = http.createServer(bspRequestHandler);

// ── WebSocket : implémentation native ───────────────────────────────

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE_BYTES = 20 * 1024 * 1024; // les payloads portent encore des data URLs (étape 4 : URLs légères)

/** Construit une trame texte serveur→client (jamais masquée). */
function wsEncodeText(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function wsEncodeClose(code) {
  const body = Buffer.alloc(2);
  body.writeUInt16BE(code, 0);
  return Buffer.concat([Buffer.from([0x88, 2]), body]);
}

function wsEncodePong(payload) {
  const body = payload && payload.length <= 125 ? payload : Buffer.alloc(0);
  return Buffer.concat([Buffer.from([0x8A, body.length]), body]);
}

/**
 * Extrait les trames complètes d'un tampon. Retourne { frames, rest }.
 * Gère les longueurs 7/16/64 bits, le démasquage client et les
 * messages fragmentés (continuation).
 */
function wsParseFrames(buffer, state) {
  const frames = [];
  let buf = buffer;
  for (;;) {
    if (buf.length < 2) break;
    const fin = (buf[0] & 0x80) !== 0;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2); offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      const big = buf.readBigUInt64BE(2);
      if (big > BigInt(MAX_MESSAGE_BYTES)) return { frames, rest: buf, fatal: true };
      len = Number(big); offset = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < offset + maskLen + len) break;
    let payload = buf.slice(offset + maskLen, offset + maskLen + len);
    if (masked) {
      const mask = buf.slice(offset, offset + 4);
      const un = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) un[i] = payload[i] ^ mask[i & 3];
      payload = un;
    }
    buf = buf.slice(offset + maskLen + len);

    if (opcode === 0x0 || opcode === 0x1 || opcode === 0x2) {
      // Accumule les fragments jusqu'au FIN.
      state.fragments.push(payload);
      state.fragTotal += payload.length;
      if (state.fragTotal > MAX_MESSAGE_BYTES) return { frames, rest: buf, fatal: true };
      if (fin) {
        const whole = Buffer.concat(state.fragments);
        state.fragments = []; state.fragTotal = 0;
        if (opcode !== 0x2) frames.push({ type: 'text', data: whole });
        // Les trames binaires sont ignorées : le protocole est JSON.
      }
    } else if (opcode === 0x8) {
      frames.push({ type: 'close' });
    } else if (opcode === 0x9) {
      frames.push({ type: 'ping', data: payload });
    }
    // 0xA (pong) : ignoré.
  }
  return { frames, rest: buf };
}

// ── Hub : clients, appairage strict, slot téléphone ────────────────

let nextClientNo = 1;
const clients = new Set(); // { socket, id, authenticated, role, senderId, alive }
let controlPhone = null;   // le client détenant le slot téléphone

function describeClients() {
  const roles = { panel: 0, display: 0, phone: 0, unknown: 0 };
  clients.forEach((c) => {
    if (!c.authenticated) return;
    roles[c.role && roles[c.role] != null ? c.role : 'unknown']++;
  });
  return roles;
}

// Couleurs ANSI (Windows 10+ et Node récents les gèrent) ; neutralisées quand la
// sortie n'est pas un terminal (redirection vers un fichier).
const TTY = !!(process.stdout && process.stdout.isTTY);
const C = {
  reset: TTY ? '\x1b[0m' : '', bold: TTY ? '\x1b[1m' : '', dim: TTY ? '\x1b[2m' : '',
  red: TTY ? '\x1b[31m' : '', green: TTY ? '\x1b[32m' : '', yellow: TTY ? '\x1b[33m' : '',
  cyan: TTY ? '\x1b[36m' : '', magenta: TTY ? '\x1b[35m' : ''
};

const LOG_COLORS = {
  pair_rejected: C.red, phone_refused: C.red, ATTENTION: C.red + C.bold,
  pair_ok: C.green, phone_slot_taken: C.green, hello: C.green,
  phone_slot_freed: C.yellow, client_in: C.dim, client_out: C.dim
};

function log(tag, detail) {
  const ts = new Date().toISOString().slice(11, 19);
  const col = LOG_COLORS[tag] || '';
  console.log(`${C.dim}[${ts}]${C.reset} ${col}${tag}${col ? C.reset : ''}${detail ? ' — ' + detail : ''}`);
}

function closeClient(client, code, reason) {
  // end() (et non destroy()) : la trame de fermeture doit être VUE par le client —
  // détruire tout de suite ferait gagner la course au teardown TCP, le navigateur ne
  // verrait qu'une fermeture anormale (1006) et se reconnecterait en boucle, alors que
  // 4401/4409 lui disent précisément de ne pas réessayer.
  try { client.socket.write(wsEncodeClose(code)); } catch (_) {}
  try { client.socket.end(); } catch (_) {}
  const s = client.socket;
  setTimeout(() => { try { s.destroy(); } catch (_) {} }, 1500);
  dropClient(client, reason || String(code));
}

function dropClient(client, why) {
  if (!clients.has(client)) return;
  clients.delete(client);
  if (controlPhone === client) {
    controlPhone = null;
    log('phone_slot_freed', `téléphone #${client.no} parti (${why}) — un autre peut reprendre`);
  }
  log('client_out', `#${client.no} rôle=${client.role || '?'} (${why}) — restants=${clients.size}`);
}

/** Diffuse une trame texte à tous les clients authentifiés sauf l'émetteur. */
function broadcast(fromClient, text) {
  const frame = wsEncodeText(text);
  clients.forEach((c) => {
    if (c === fromClient || !c.authenticated) return;
    try { c.socket.write(frame); } catch (_) { dropClient(c, 'write failed'); }
  });
}

function handleEnvelope(client, envelope, rawText) {
  // APPAIRAGE STRICT : chaque enveloppe porte le code ; un code absent
  // ou faux ferme la connexion. C'est le verrou que le panneau seul ne
  // pouvait pas poser.
  const token = String(envelope.token || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  if (token !== config.pairCode) {
    log('pair_rejected', `#${client.no} token=${token || '(vide)'}`);
    closeClient(client, 4401, 'bad pair code');
    return;
  }
  if (!client.authenticated) {
    client.authenticated = true;
    client.senderId = envelope.senderId || '';
    log('pair_ok', `#${client.no}`);
  }

  const payload = envelope.payload;
  const pType = payload && typeof payload.type === 'string' ? payload.type : '';

  // Déclaration de rôle : { type:'HELLO', role:'panel'|'display'|'phone' }.
  // La page d'affichage existante annonce son rôle via `sender`, pas `role` —
  // les deux champs sont acceptés.
  // Le rôle « phone » passe par le slot unique : refusé si un téléphone
  // est déjà actif, accepté si le slot est libre (reprise après coupure).
  if (pType === 'HELLO') {
    const declared = payload.role || payload.sender;
    const role = ['panel', 'display', 'phone'].includes(declared) ? declared : 'unknown';
    if (role === 'phone') {
      if (controlPhone && controlPhone !== client && clients.has(controlPhone)) {
        log('phone_refused', `#${client.no} — slot occupé par #${controlPhone.no}`);
        try { client.socket.write(wsEncodeText(JSON.stringify({
          type: 'RS_ENVELOPE', version: 1, senderId: 'server', ts: Date.now(), token: config.pairCode,
          payload: { type: 'PHONE_SLOT_BUSY' }
        }))); } catch (_) {}
        closeClient(client, 4409, 'phone slot busy');
        return;
      }
      controlPhone = client;
      log('phone_slot_taken', `#${client.no}`);
      try { client.socket.write(wsEncodeText(JSON.stringify({
        type: 'RS_ENVELOPE', version: 1, senderId: 'server', ts: Date.now(), token: config.pairCode,
        payload: { type: 'PHONE_SLOT_OK' }
      }))); } catch (_) {}
    }
    // Log the role only on FIRST declaration (or a change), not on every HELLO. Displays
    // re-send HELLO periodically (sync keep-alive), which used to spam the console with
    // "hello — #N rôle=display" in a loop.
    const roleChanged = client.role !== role;
    client.role = role;
    if (roleChanged) log('hello', `#${client.no} rôle=${role}`);
    if (role === 'panel') {
      const otherPanels = [...clients].filter((c) => c !== client && c.authenticated && c.role === 'panel');
      if (otherPanels.length) {
        log('ATTENTION', `${otherPanels.length + 1} panneaux connectés en même temps — ils vont se répondre `
          + `l'un l'autre et entrer en conflit (setlist vide sur le téléphone, projections qui se chevauchent). `
          + `N'en gardez qu'UN : le dock OBS OU la page /panel, pas les deux.`);
      }
    }
    // Le HELLO est AUSSI relayé : le panneau y répond par l'état courant
    // (SYNC_STATE), sans quoi un affichage fraîchement ouvert reste vide.
    broadcast(client, rawText);
    return;
  }

  // Garde-fou : les commandes de contrôle venant d'un téléphone qui ne
  // détient pas le slot sont ignorées (un HELLO est requis d'abord).
  if (client.role === 'phone' && controlPhone !== client) {
    log('phone_ignored', `#${client.no} sans slot`);
    return;
  }

  broadcast(client, rawText);
}

httpServer.on('error', (err) => {
  console.error('\n[ERREUR HTTP] ' + err.message);
  if (err.code === 'EADDRINUSE') console.error(`Le port ${config.httpPort} est déjà utilisé. Fermez l'autre programme ou changez httpPort dans bsp-server-config.json.`);
  process.exit(1);
});

// Le serveur WS est un serveur HTTP(S) qui n'accepte que l'upgrade. En TLS il
// devient WSS automatiquement (https.Server émet aussi 'upgrade').
function bspWsRequestHandler(req, res) {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('WebSocket only');
}

// Shared WS upgrade handler, attached to both the WS server and (when certs exist) the
// WSS server — the native framing works identically over a TLS socket.
function bspWsUpgradeHandler(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const client = {
    socket,
    no: nextClientNo++,
    authenticated: false,
    role: '',
    senderId: '',
    parseState: { fragments: [], fragTotal: 0 }
  };
  clients.add(client);
  log('client_in', `#${client.no} depuis ${socket.remoteAddress}`);

  let pending = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (pending.length > MAX_MESSAGE_BYTES + 1024) { closeClient(client, 1009, 'message too big'); return; }
    const { frames, rest, fatal } = wsParseFrames(pending, client.parseState);
    if (fatal) { closeClient(client, 1009, 'frame too big'); return; }
    pending = rest;
    frames.forEach((f) => {
      if (f.type === 'close') { closeClient(client, 1000, 'client close'); return; }
      if (f.type === 'ping') { try { socket.write(wsEncodePong(f.data)); } catch (_) {} return; }
      if (f.type !== 'text') return;
      let msg = null;
      try { msg = JSON.parse(f.data.toString('utf8')); } catch (_) { return; }
      if (!msg || msg.type !== 'RS_ENVELOPE' || !msg.payload) return;
      handleEnvelope(client, msg, f.data.toString('utf8'));
    });
  });
  socket.on('error', () => dropClient(client, 'socket error'));
  socket.on('close', () => dropClient(client, 'socket closed'));
}

const wsServer = http.createServer(bspWsRequestHandler);
wsServer.on('upgrade', bspWsUpgradeHandler);
wsServer.on('error', (err) => {
  console.error('\n[ERREUR WS] ' + err.message);
  if (err.code === 'EADDRINUSE') console.error(`Le port ${config.wsPort} est déjà utilisé. Fermez l'autre programme ou changez wsPort dans bsp-server-config.json.`);
  process.exit(1);
});

// Serveurs sécurisés OPTIONNELS (si certificats présents) : HTTPS + WSS, servis EN PLUS
// du HTTP/WS, sur leurs propres ports. Donnent un lien Panneau https à contexte sécurisé.
let httpsServer = null, wssServer = null;
if (httpsAvailable) {
  httpsServer = https.createServer(tlsOptions, bspRequestHandler);
  httpsServer.on('error', (err) => {
    console.error('\n[ERREUR HTTPS] ' + err.message + (err.code === 'EADDRINUSE' ? ` — port ${httpsPort} occupé.` : ''));
  });
  wssServer = https.createServer(tlsOptions, bspWsRequestHandler);
  wssServer.on('upgrade', bspWsUpgradeHandler);
  wssServer.on('error', (err) => {
    console.error('\n[ERREUR WSS] ' + err.message + (err.code === 'EADDRINUSE' ? ` — port ${wssPort} occupé.` : ''));
  });
}

// ── Démarrage ───────────────────────────────────────────────────────

function printBanner() {
  const ips = lanAddresses();
  const shown = ips.length ? ips : ['127.0.0.1'];
  console.log('');
  console.log(`  ${C.cyan}${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`  ${C.cyan}${C.bold}║        EEAM_BibleSong Pro — Serveur réseau           ║${C.reset}`);
  console.log(`  ${C.cyan}${C.bold}╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');
  console.log(`  Code d'appairage : ${C.yellow}${C.bold}${config.pairCode}${C.reset}`);
  console.log(`  Portée           : ${C.magenta}${config.scope === 'internet' ? 'Internet (voir README)' : 'Réseau local'}${C.reset}`);
  console.log(`  Sécurité         : ${C.green}HTTP + WS (tous appareils)${httpsAvailable ? C.dim + ` + HTTPS + WSS dispo (ports ${httpsPort}/${wssPort})` : ''}${C.reset}`);
  console.log('');
  console.log(`  ${C.green}${C.bold}■ OBS${C.reset} (source navigateur) — copiez le lien TEL QUEL :`);
  shown.forEach((ip) => console.log(`    ${C.cyan}http://${ip}:${config.httpPort}/?outputId=obs&pair=${config.pairCode}${C.reset}`));
  console.log(`    ${C.dim}Autres écrans : même lien avec outputId=screen_1, screen_2…${C.reset}`);
  console.log('');
  console.log(`  ${C.green}${C.bold}■ Téléphone${C.reset} (1 seul actif à la fois) :`);
  shown.forEach((ip) => console.log(`    ${C.cyan}http://${ip}:${config.httpPort}/phone?pair=${config.pairCode}${C.reset}`));
  console.log('');
  console.log(`  ${C.green}${C.bold}■ Panneau${C.reset} (autre PC — ne PAS l'ouvrir en même temps que le dock OBS) :`);
  shown.forEach((ip) => console.log(`    ${C.cyan}http://${ip}:${config.httpPort}/panel?pair=${config.pairCode}${C.reset}`));
  if (httpsAvailable) {
    console.log('');
    console.log(`  ${C.green}${C.bold}■ Panneau HTTPS${C.reset} (contexte sécurisé — détection d'écran sur ce PC ; la CA mkcert doit y être installée) :`);
    shown.forEach((ip) => console.log(`    ${C.cyan}https://${ip}:${httpsPort}/panel?pair=${config.pairCode}&relayPort=${wssPort}${C.reset}`));
  }
  console.log('');
  console.log(`  ${C.dim}PC principal (détection d'écran, sans certificat) : http://localhost:${config.httpPort}/panel${C.reset}`);
  console.log(`  Dans le dock OBS : section RemoteShow, code ${C.yellow}${C.bold}${config.pairCode}${C.reset}, relais ws port ${config.wsPort}.`);
  console.log('');
  console.log(`  ${C.dim}Laissez cette fenêtre ouverte. Ctrl+C pour arrêter.${C.reset}`);
  console.log('');
}

// ── Démarrage ───────────────────────────────────────────────────────

httpServer.listen(config.httpPort, '0.0.0.0', () => {
  wsServer.listen(config.wsPort, '0.0.0.0', () => {
    if (httpsAvailable && httpsServer && wssServer) {
      httpsServer.listen(httpsPort, '0.0.0.0', () => {
        wssServer.listen(wssPort, '0.0.0.0', printBanner);
      });
    } else {
      printBanner();
    }
  });
});
