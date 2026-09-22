'use strict';

/*
 * Pont sécurisé entre le processus principal Electron et les pages
 * (panneau + affichages). Expose UNIQUEMENT une petite API de gestion de
 * fenêtres/écrans sous window.bspDesktop. contextIsolation=true : aucune
 * primitive Node ne fuit dans la page.
 *
 * Le panneau détecte window.bspDesktop pour router la projection vers de
 * VRAIES fenêtres OS (une par outputId) au lieu de la fenêtre unique du
 * mode navigateur/OBS.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bspDesktop', {
  isElectron: true,
  // Liste des moniteurs physiques : [{ id, index, label, primary, bounds, ... }].
  listDisplays: () => ipcRenderer.invoke('bsp:list-displays'),
  // Ouvre/refocalise une fenêtre plein écran pour outputId sur un moniteur.
  //   opts: { displayId?, fullscreen? }
  openOutput: (outputId, opts) => ipcRenderer.invoke('bsp:open-output', outputId, opts),
  closeOutput: (outputId) => ipcRenderer.invoke('bsp:close-output', outputId),
  listOpenOutputs: () => ipcRenderer.invoke('bsp:list-open-outputs'),
  info: () => ipcRenderer.invoke('bsp:info')
});

// API attendue par le panneau (Settings → Updates) : MISE À JOUR MANUELLE via electron-updater.
// L'UI existante (bspIsDesktopMode / bspInitUpdateUi) détecte window.BSPDesktop.
contextBridge.exposeInMainWorld('BSPDesktop', {
  isElectron: true,
  checkForUpdates: () => ipcRenderer.invoke('bsp:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('bsp:update-download'),
  installUpdateNow: () => ipcRenderer.invoke('bsp:update-install'),
  // cb reçoit { state:'checking'|'available'|'none'|'downloading'|'downloaded'|'error', version, percent, message }.
  onUpdateStatus: (cb) => {
    const h = (_e, data) => { try { cb(data); } catch (_) {} };
    ipcRenderer.on('bsp:update-event', h);
    return () => ipcRenderer.removeListener('bsp:update-event', h);
  }
});
