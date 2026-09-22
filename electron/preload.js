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
