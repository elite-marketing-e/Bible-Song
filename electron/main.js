'use strict';

/*
 * EEAM_BibleSong Pro — processus principal Electron.
 * ------------------------------------------------------------------
 * Rôle : transformer le projet (panneau + affichages + serveur réseau)
 * en application desktop installable.
 *
 * Architecture — pourquoi chaque fenêtre passe par HTTP local :
 *   Le serveur zéro-dépendance (server/bsp-server.js) est démarré comme
 *   processus enfant et sert déjà /panel et /?outputId=<id>. On pointe
 *   TOUTES les fenêtres (panneau + chaque affichage) sur http://127.0.0.1,
 *   donc :
 *     - même origine → le BroadcastChannel de synchro marche entre de
 *       VRAIES fenêtres OS (fini la fenêtre unique) ;
 *     - chaque fenêtre d'affichage porte son propre outputId → le design
 *       par sortie fonctionne par construction (fini « tous les écrans
 *       le même design ») ;
 *     - le relais WS/le téléphone/les médias marchent sans changement.
 */

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const http = require('http');
const { fork } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const SERVER_SCRIPT = path.join(PROJECT_ROOT, 'server', 'bsp-server.js');
const APP_NAME = 'EEAM_BibleSong Pro';
const APP_ICON = path.join(PROJECT_ROOT, 'assets', 'eeam-logo.png');
const HTTP_PORT = 5510;
const WS_PORT = 5511;
const BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;

let serverProc = null;
let panelWin = null;
let serverIsExternal = false;   // un serveur tournait déjà (ex. le .bat) : on le réutilise
let serverRestartCount = 0;     // garde-fou anti-boucle de redémarrage
let serverRestartTimer = null;
// outputId -> BrowserWindow pour les fenêtres d'affichage (Live/écrans).
const outputWindows = new Map();

// Teste (rapidement) si un serveur EEAM répond déjà sur le port HTTP. Sert à
// RÉUTILISER un serveur lancé à part (le .bat) au lieu d'en forker un second qui
// échouerait sur EADDRINUSE — cause historique de fermeture de l'app.
function probeServer(timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/api/info`, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
  });
}

// ── Serveur réseau (enfant) ─────────────────────────────────────────
async function startServer() {
  if (serverProc || serverIsExternal) return;
  // Un serveur écoute déjà (souvent le .bat lancé par l'utilisateur) ? On l'utilise
  // tel quel : lancer un second processus se solderait par un port occupé.
  if (await probeServer()) {
    serverIsExternal = true;
    console.log('[BSP] serveur déjà présent sur ' + BASE_URL + ' — réutilisation.');
    return;
  }
  serverProc = fork(SERVER_SCRIPT, [`--http=${HTTP_PORT}`, `--ws=${WS_PORT}`], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
  serverProc.on('exit', (code) => {
    serverProc = null;
    if (app.isQuittingBsp) return;
    // Le serveur ne doit JAMAIS entraîner la fermeture de l'application. S'il s'arrête
    // (plantage, port pris entre-temps…), on tente de le relancer sans toucher aux
    // fenêtres ouvertes. Si un AUTRE serveur a pris le relais (ex. le .bat), on s'y
    // raccroche au lieu de forker.
    console.error(`[BSP] serveur arrêté (code ${code}) — tentative de reprise.`);
    if (serverRestartTimer) return;
    serverRestartTimer = setTimeout(async () => {
      serverRestartTimer = null;
      if (app.isQuittingBsp) return;
      if (await probeServer()) { serverIsExternal = true; return; }
      if (serverRestartCount < 5) { serverRestartCount++; startServer(); }
      else console.error('[BSP] serveur injoignable après plusieurs tentatives — l\'app reste ouverte, la synchro est suspendue.');
    }, 1000);
  });
}

function stopServer() {
  if (serverRestartTimer) { clearTimeout(serverRestartTimer); serverRestartTimer = null; }
  // On ne tue QUE le serveur qu'on a nous-mêmes forké : un serveur externe (.bat)
  // appartient à l'utilisateur et doit survivre à la fermeture de l'app.
  if (serverProc && !serverIsExternal) {
    try { serverProc.kill(); } catch (_) {}
    serverProc = null;
  }
}

// Un rendu qui plante (ex. OOM sur un très gros import) ne doit pas laisser une
// fenêtre morte ni fermer l'app : on la recharge.
function attachRendererRecovery(win) {
  win.webContents.on('render-process-gone', (_e, details) => {
    if (app.isQuittingBsp || win.isDestroyed()) return;
    console.error('[BSP] rendu interrompu (' + (details && details.reason) + ') — rechargement.');
    try { win.reload(); } catch (_) {}
  });
  win.webContents.on('unresponsive', () => {
    console.error('[BSP] fenêtre non réactive — on laisse le temps au rendu de revenir.');
  });
}

// Attend que le HTTP réponde avant d'ouvrir la moindre fenêtre.
function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(`${BASE_URL}/api/info`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('serveur injoignable'));
        else setTimeout(tryOnce, 250);
      });
      req.setTimeout(1000, () => { req.destroy(); });
    };
    tryOnce();
  });
}

// ── Fenêtres ────────────────────────────────────────────────────────
function createPanelWindow() {
  panelWin = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111111',
    title: APP_NAME,
    icon: APP_ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // la synchro/le fit ne doivent pas ralentir en arrière-plan
    }
  });
  attachRendererRecovery(panelWin);
  panelWin.loadURL(`${BASE_URL}/panel`);
  panelWin.on('closed', () => { panelWin = null; });
  // Les liens externes s'ouvrent dans le navigateur système, pas dans l'app.
  panelWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function displayById(displayId) {
  const all = screen.getAllDisplays();
  return all.find((d) => String(d.id) === String(displayId)) || null;
}

// Ouvre (ou refocalise) une fenêtre d'affichage pour un outputId donné, en
// plein écran sur le moniteur choisi.
function openOutputWindow(outputId, opts = {}) {
  if (!outputId) return { ok: false, error: 'outputId manquant' };

  let win = outputWindows.get(outputId);
  if (win && !win.isDestroyed()) {
    if (opts.displayId != null) moveToDisplay(win, opts.displayId);
    win.show();
    win.focus();
    return { ok: true, reused: true, outputId };
  }

  const disp = opts.displayId != null ? displayById(opts.displayId) : null;
  const bounds = disp ? disp.bounds : null;

  win = new BrowserWindow({
    x: bounds ? bounds.x : undefined,
    y: bounds ? bounds.y : undefined,
    width: bounds ? bounds.width : 1280,
    height: bounds ? bounds.height : 720,
    backgroundColor: '#000000',
    title: `${APP_NAME} — ${outputId}`,
    icon: APP_ICON,
    frame: false,
    fullscreen: !!bounds || opts.fullscreen !== false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // un affichage ne doit jamais être throttlé (timers du fit/anim)
    }
  });

  attachRendererRecovery(win);
  const q = new URLSearchParams({ outputId });
  win.loadURL(`${BASE_URL}/?${q.toString()}`);
  win.on('closed', () => { outputWindows.delete(outputId); });
  outputWindows.set(outputId, win);
  return { ok: true, reused: false, outputId };
}

function moveToDisplay(win, displayId) {
  const disp = displayById(displayId);
  if (!disp) return;
  win.setFullScreen(false);
  win.setBounds(disp.bounds);
  win.setFullScreen(true);
}

function closeOutputWindow(outputId) {
  const win = outputWindows.get(outputId);
  if (win && !win.isDestroyed()) win.close();
  outputWindows.delete(outputId);
  return { ok: true };
}

function serializeDisplays() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id),
    index: i,
    label: d.label || `Écran ${i + 1}`,
    primary: d.id === primary.id,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    internal: d.internal
  }));
}

// ── Mise à jour MANUELLE (electron-updater + GitHub Releases) ───────
// Pas d'auto-update : l'utilisateur clique « Rechercher une mise à jour » dans Settings.
// checkForUpdates → (si dispo) downloadUpdate → quitAndInstall. Les événements sont renvoyés
// au panneau. electron-updater est optionnel : si absent, le bouton l'indique.
let bspUpdaterAvailable = false;
function setupAutoUpdater() {
  let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch (_) { bspUpdaterAvailable = false; return; }
  bspUpdaterAvailable = true;
  autoUpdater.autoDownload = false;             // on télécharge sur action explicite
  autoUpdater.autoInstallOnAppQuit = true;
  const send = (state, payload) => {
    try { if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('bsp:update-event', Object.assign({ state }, payload || {})); } catch (_) {}
  };
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info && info.version, releaseNotes: info && info.releaseNotes }));
  autoUpdater.on('update-not-available', (info) => send('none', { version: info && info.version }));
  autoUpdater.on('error', (err) => send('error', { message: String((err && err.message) || err) }));
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round((p && p.percent) || 0) }));
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info && info.version }));

  ipcMain.handle('bsp:update-check', async () => {
    try { const r = await autoUpdater.checkForUpdates(); return { ok: true, version: r && r.updateInfo && r.updateInfo.version }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });
  ipcMain.handle('bsp:update-download', async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });
  ipcMain.handle('bsp:update-install', () => {
    try { setImmediate(() => autoUpdater.quitAndInstall()); return { ok: true }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });
}

// ── IPC (pont pour le panneau) ──────────────────────────────────────
function registerIpc() {
  ipcMain.handle('bsp:list-displays', () => serializeDisplays());
  ipcMain.handle('bsp:open-output', (_e, outputId, opts) => openOutputWindow(outputId, opts || {}));
  ipcMain.handle('bsp:close-output', (_e, outputId) => closeOutputWindow(outputId));
  ipcMain.handle('bsp:list-open-outputs', () => Array.from(outputWindows.keys()));
  ipcMain.handle('bsp:info', () => ({ baseUrl: BASE_URL, httpPort: HTTP_PORT, wsPort: WS_PORT, version: app.getVersion(), updater: bspUpdaterAvailable }));
  setupAutoUpdater();
}

// ── Cycle de vie ────────────────────────────────────────────────────
// Une seule instance : un second lancement refocalise le panneau existant.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (panelWin) { if (panelWin.isMinimized()) panelWin.restore(); panelWin.focus(); }
  });

  app.whenReady().then(async () => {
    app.setName(APP_NAME);
    // Regroupe les fenêtres sous la bonne icône/nom dans la barre des tâches Windows.
    if (process.platform === 'win32') app.setAppUserModelId('org.eeam.biblesongpro.app');
    // Vide le cache HTTP au démarrage : garantit que le panneau et les affichages chargent
    // TOUJOURS le dernier code (fini « mes corrections ne changent rien » à cause d'un JS
    // en cache Electron).
    try { const { session } = require('electron'); await session.defaultSession.clearCache(); } catch (_) {}
    registerIpc();
    await startServer();
    try {
      await waitForServer();
    } catch (err) {
      console.error('[BSP]', err.message);
    }
    createPanelWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createPanelWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    app.isQuittingBsp = true;
    stopServer();
  });
}
