    // ===== PRESETS DE SORTIE (.eeamfx) =====
    // Un preset = un DESIGN COMPLET pour UN kind (Bible OU Songs) : Typographie, Couleurs,
    // Background, géométrie SD, contour, trait, boîte de référence, alignements, padding… —
    // bref tout le profil de projection (~70 clés) pour ce kind. On l'applique à une SORTIE
    // choisie (Live/OBS ou un écran ajouté) : l'écran prend l'apparence du preset pour ce kind.
    // Cas d'usage : un autre PC avec un type de sortie différent → on sélectionne la sortie et on
    // applique le preset. Les presets s'exportent/importent en fichiers .eeamfx (le cloud viendra
    // ensuite). Stockés en local (localStorage), indépendants de la config.
    //
    // Réutilise l'infra design existante : PROJECTION_SETTINGS_PROFILE_KEYS, BSP_KIND_SPLIT_KEYS,
    // bspScreenDesignBaseForKind, bspKindEffective/bspScreenEffective, bspReplaceOutputDesign.

    let bspOutputPresets = [];
    const BSP_OUTPUT_PRESETS_STORAGE_KEY = 'bsp-output-presets-v1';
    const BSP_OUTPUT_PRESET_FILE_KIND = 'output-preset'; // marqueur validé à l'import

    function bspOutputPresetsPersist() {
      try { localStorage.setItem(BSP_OUTPUT_PRESETS_STORAGE_KEY, JSON.stringify(bspOutputPresets)); } catch (_) {}
    }
    function bspOutputPresetsRestore() {
      try {
        const raw = localStorage.getItem(BSP_OUTPUT_PRESETS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        bspOutputPresets = Array.isArray(parsed) ? parsed.filter(p => p && typeof p === 'object') : [];
      } catch (_) { bspOutputPresets = []; }
    }

    function bspOutputPresetNewId() {
      return 'fx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function bspOutputPresetNormalizeKind(k) {
      return (k === 'songs') ? 'songs' : 'bible';
    }

    // Design EFFECTIF (base + surcharge) d'une (sortie, kind), en clés « plates » (non suffixées) :
    // c'est la forme portable qu'on fige dans un preset. Pour la sortie Live ('' ou 'obs') il n'y a
    // pas de surcharge → c'est le profil de base du kind.
    function bspOutputPresetDesignFor(outputId, kind) {
      kind = bspOutputPresetNormalizeKind(kind);
      const kindBase = (typeof bspScreenDesignBaseForKind === 'function') ? bspScreenDesignBaseForKind(kind) : {};
      const isLive = !outputId || outputId === BSP_DEFAULT_OUTPUT_ID;
      const design = {};
      PROJECTION_SETTINGS_PROFILE_KEYS.forEach((key) => {
        if (isLive) { design[key] = kindBase[key]; return; }
        const split = (typeof BSP_KIND_SPLIT_KEYS !== 'undefined') && BSP_KIND_SPLIT_KEYS.indexOf(key) !== -1;
        design[key] = split
          ? bspKindEffective(outputId, key, kind, kindBase)
          : bspScreenEffective(outputId, key, kindBase);
      });
      return design;
    }

    // Capture la (sortie, kind) courante comme nouveau preset nommé.
    function bspOutputPresetCapture(outputId, kind, name) {
      kind = bspOutputPresetNormalizeKind(kind);
      const label = String(name || '').trim() || ('Preset ' + (bspOutputPresets.length + 1));
      const preset = {
        id: bspOutputPresetNewId(),
        name: label,
        kind,
        design: bspOutputPresetDesignFor(outputId, kind),
        createdAt: Date.now()
      };
      bspOutputPresets.push(preset);
      bspOutputPresetsPersist();
      return preset;
    }

    // Applique le design d'un preset à une sortie. Live → profil de base du kind (+ rafraîchit la
    // projection si ce kind est à l'antenne). Écran → écrit sa surcharge (clés ≠ base conservées,
    // clés = base retirées pour rester minimal et re-suivre la base). Le mode/lignes de la sortie
    // Live restent pilotés par la barre du bas : la garde de bspReplaceOutputDesign/base s'en charge.
    function bspOutputPresetApply(presetId, outputId) {
      const preset = bspOutputPresets.find(p => p.id === presetId);
      if (!preset) return false;
      const kind = bspOutputPresetNormalizeKind(preset.kind);
      const design = preset.design || {};
      const kindBase = (typeof bspScreenDesignBaseForKind === 'function') ? bspScreenDesignBaseForKind(kind) : {};
      const toLive = !outputId || outputId === BSP_DEFAULT_OUTPUT_ID;

      if (toLive) {
        const profiles = ensureProjectionSettingsProfiles();
        profiles[kind] = normalizeProjectionSettingsSnapshot(design, profiles[kind] || {});
        // Refléter dans les contrôles si les Réglages montrent CE kind sur Live.
        const curTab = (typeof getEffectiveSettingsTargetTab === 'function') ? getEffectiveSettingsTargetTab()
                     : (typeof sidebarTab !== 'undefined' ? sidebarTab : kind);
        const onLiveTarget = (typeof bspSettingsOutputIsScreen === 'function') ? !bspSettingsOutputIsScreen() : true;
        if (onLiveTarget && curTab === kind && typeof applyProjectionSettingsSnapshot === 'function') {
          applyProjectionSettingsSnapshot(profiles[kind], { tab: kind, triggerChange: false });
        }
        if (typeof isLive !== 'undefined' && isLive && typeof livePointer !== 'undefined' && livePointer && livePointer.kind === kind) {
          if (typeof applyProjectionRuntimeSnapshot === 'function') applyProjectionRuntimeSnapshot(profiles[kind]);
          if (typeof scheduleLiveUpdate === 'function') scheduleLiveUpdate();
        }
        if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      } else {
        const next = { ...((typeof bspGetOutputDesign === 'function' && bspGetOutputDesign(outputId)) || {}) };
        PROJECTION_SETTINGS_PROFILE_KEYS.forEach((key) => {
          const split = (typeof BSP_KIND_SPLIT_KEYS !== 'undefined') && BSP_KIND_SPLIT_KEYS.indexOf(key) !== -1;
          const sk = split ? (key + '__' + kind) : key;
          const v = design[key];
          if (v == null || JSON.stringify(v) === JSON.stringify(kindBase[key])) delete next[sk];
          else next[sk] = v;
        });
        if (typeof bspReplaceOutputDesign === 'function') bspReplaceOutputDesign(outputId, next);
      }

      // Rafraîchir les sélecteurs/zones qui lisent le design.
      if (typeof bspRenderScreenModeZone === 'function') bspRenderScreenModeZone();
      if (typeof bspRenderSettingsDesignPages === 'function') bspRenderSettingsDesignPages();
      if (typeof bspIsDesignModalOpen === 'function' && bspIsDesignModalOpen() &&
          typeof bspRenderScreenDesignPanel === 'function') bspRenderScreenDesignPanel();
      return true;
    }

    function bspOutputPresetDelete(id) {
      const i = bspOutputPresets.findIndex(p => p.id === id);
      if (i === -1) return false;
      bspOutputPresets.splice(i, 1);
      bspOutputPresetsPersist();
      return true;
    }
    function bspOutputPresetRename(id, name) {
      const p = bspOutputPresets.find(x => x.id === id);
      if (!p) return false;
      p.name = String(name || '').trim() || p.name;
      bspOutputPresetsPersist();
      return true;
    }

    // ── Fichiers .eeamfx ─────────────────────────────────────────────────────────
    function bspOutputPresetBuildFilePayload(presets) {
      return {
        app: 'Bible Song Pro',
        kind: BSP_OUTPUT_PRESET_FILE_KIND,
        bspOutputPreset: 1,
        exportedAt: new Date().toISOString(),
        presets: (presets || []).map(p => ({
          id: p.id, name: p.name, kind: bspOutputPresetNormalizeKind(p.kind),
          design: p.design || {}, createdAt: p.createdAt || Date.now()
        }))
      };
    }
    async function bspOutputPresetExport(ids) {
      const list = (Array.isArray(ids) && ids.length)
        ? bspOutputPresets.filter(p => ids.indexOf(p.id) !== -1)
        : bspOutputPresets.slice();
      if (!list.length) { if (typeof showToast === 'function') showToast('Aucun preset à exporter'); return false; }
      const payload = bspOutputPresetBuildFilePayload(list);
      const stamp = (typeof bspTimestampForFilename === 'function') ? bspTimestampForFilename() : Date.now();
      const name = (list.length === 1 ? ('EEAM-preset_' + String(list[0].name || '').replace(/[^\w\-]+/g, '-').slice(0, 40)) : 'EEAM-presets') + '_' + stamp + '.eeamfx';
      return bspSaveJsonFile(JSON.stringify(payload, null, 2), name, { description: 'EEAM Output Preset', ext: '.eeamfx' });
    }
    // Fusionne les presets d'un objet .eeamfx importé. Rejette tout autre type de fichier.
    function bspOutputPresetImportData(obj) {
      if (!obj || typeof obj !== 'object') { if (typeof showToast === 'function') showToast('Fichier illisible'); return 0; }
      if (obj.kind && obj.kind !== BSP_OUTPUT_PRESET_FILE_KIND) {
        if (typeof showToast === 'function') showToast('Ce fichier n\'est pas un preset de sortie (.eeamfx)');
        return 0;
      }
      const incoming = Array.isArray(obj.presets) ? obj.presets : [];
      let added = 0;
      incoming.forEach((p) => {
        if (!p || typeof p !== 'object' || !p.design) return;
        bspOutputPresets.push({
          id: bspOutputPresetNewId(),
          name: String(p.name || 'Preset importé').trim(),
          kind: bspOutputPresetNormalizeKind(p.kind),
          design: p.design,
          createdAt: Date.now()
        });
        added += 1;
      });
      if (added) bspOutputPresetsPersist();
      return added;
    }

    // ── Fenêtre (modale) de gestion des presets ──────────────────────────────────
    function bspOutputPresetsInjectStyles() {
      if (document.getElementById('bsp-fx-styles')) return;
      const css = `
        .bsp-fx-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px}
        .bsp-fx-modal{width:min(620px,96vw);max-height:88vh;overflow:auto;background:var(--panel,#1b2130);color:var(--text,#e8edf6);border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.5)}
        .bsp-fx-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
        .bsp-fx-title{font-size:16px;font-weight:800;margin:0}
        .bsp-fx-x{background:none;border:none;color:var(--text,#e8edf6);font-size:22px;cursor:pointer;line-height:1;padding:2px 8px;border-radius:8px}
        .bsp-fx-x:hover{background:rgba(255,255,255,.08)}
        .bsp-fx-body{padding:16px 18px;display:flex;flex-direction:column;gap:14px}
        .bsp-fx-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px}
        .bsp-fx-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .bsp-fx-lbl{font-size:12px;color:#9fb0cc;min-width:58px}
        .bsp-fx-sel,.bsp-fx-input{background:var(--panel2,#121722);color:var(--text,#e8edf6);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:7px 9px;font-size:13px}
        .bsp-fx-input{flex:1;min-width:140px}
        .bsp-fx-btn{background:var(--accent,#3b82f6);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer}
        .bsp-fx-btn.ghost{background:rgba(255,255,255,.08);color:var(--text,#e8edf6)}
        .bsp-fx-btn.danger{background:rgba(220,60,60,.16);color:#ff9d9d}
        .bsp-fx-btn:hover{filter:brightness(1.08)}
        .bsp-fx-list{display:flex;flex-direction:column;gap:8px}
        .bsp-fx-item{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 10px}
        .bsp-fx-item__name{flex:1;min-width:0;font-weight:700;font-size:13px;background:transparent;border:1px solid transparent;color:var(--text,#e8edf6);border-radius:6px;padding:4px 6px}
        .bsp-fx-item__name:focus{border-color:rgba(255,255,255,.2);background:var(--panel2,#121722);outline:none}
        .bsp-fx-badge{font-size:10px;font-weight:800;letter-spacing:.04em;padding:3px 7px;border-radius:999px;text-transform:uppercase}
        .bsp-fx-badge.bible{background:rgba(59,130,246,.2);color:#9ac3ff}
        .bsp-fx-badge.songs{background:rgba(168,85,247,.22);color:#d6b2ff}
        .bsp-fx-iconbtn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--text,#e8edf6);border-radius:8px;padding:6px 9px;font-size:12px;cursor:pointer}
        .bsp-fx-iconbtn:hover{background:rgba(255,255,255,.12)}
        .bsp-fx-empty{color:#8a9bb8;font-size:13px;text-align:center;padding:14px}
        .bsp-fx-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center;padding:14px 18px;border-top:1px solid rgba(255,255,255,.08)}
        .bsp-fx-note{font-size:11px;color:#8a9bb8}
        /* Confirmation PROPRE à la modale presets : au-dessus d'elle (son overlay est z-index 10050,
           le confirm partagé .modal-overlay n'est qu'à 1000 et passait DERRIÈRE). */
        .bsp-fx-confirm{position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:20px}
        .bsp-fx-confirm__card{width:min(400px,94vw);background:var(--panel,#1b2130);color:var(--text,#e8edf6);border:1px solid rgba(255,255,255,.14);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:18px}
        .bsp-fx-confirm__title{font-size:15px;font-weight:800;margin:0 0 8px}
        .bsp-fx-confirm__msg{font-size:13px;color:#c7d2e6;margin:0 0 16px;line-height:1.45}
        .bsp-fx-confirm__row{display:flex;gap:8px;justify-content:flex-end}
      `;
      const st = document.createElement('style');
      st.id = 'bsp-fx-styles';
      st.textContent = css;
      document.head.appendChild(st);
    }

    function bspOutputPresetOutputOptions() {
      const opts = [{ id: '', label: (typeof t === 'function' ? t('screens_live_label') : 'Live') || 'Live' }];
      if (typeof bspScreensAdded !== 'undefined' && Array.isArray(bspScreensAdded)) {
        bspScreensAdded.forEach((s) => { if (s && s.id) opts.push({ id: s.id, label: s.label || s.id }); });
      }
      return opts;
    }

    let bspFxWorkingOutput = '';
    let bspFxWorkingKind = 'bible';

    // Confirmation rendue DANS l'overlay des presets (donc toujours au-dessus de lui).
    function bspFxConfirm(title, message, onConfirm) {
      const host = document.getElementById('bsp-fx-overlay') || document.body;
      const layer = document.createElement('div');
      layer.className = 'bsp-fx-confirm';
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      layer.innerHTML = `
        <div class="bsp-fx-confirm__card" role="dialog" aria-modal="true">
          <h4 class="bsp-fx-confirm__title">${esc(title)}</h4>
          <p class="bsp-fx-confirm__msg">${esc(message)}</p>
          <div class="bsp-fx-confirm__row">
            <button class="bsp-fx-btn ghost" data-act="cancel">Annuler</button>
            <button class="bsp-fx-btn danger" data-act="ok">Supprimer</button>
          </div>
        </div>`;
      const close = () => layer.remove();
      layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(); });
      layer.querySelector('[data-act="cancel"]').onclick = close;
      layer.querySelector('[data-act="ok"]').onclick = () => { close(); if (typeof onConfirm === 'function') onConfirm(); };
      host.appendChild(layer);
    }

    function bspOpenOutputPresetsModal() {
      bspOutputPresetsInjectStyles();
      // Défauts = sortie + kind courants des Réglages.
      bspFxWorkingOutput = (typeof settingsTargetOutput !== 'undefined' && settingsTargetOutput) ? settingsTargetOutput : '';
      bspFxWorkingKind = (typeof bspSettingsDesignKind === 'function') ? bspSettingsDesignKind() : 'bible';
      let overlay = document.getElementById('bsp-fx-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'bsp-fx-overlay';
        overlay.className = 'bsp-fx-overlay';
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) bspCloseOutputPresetsModal(); });
        document.body.appendChild(overlay);
      }
      bspRenderOutputPresetsModal();
    }
    function bspCloseOutputPresetsModal() {
      const overlay = document.getElementById('bsp-fx-overlay');
      if (overlay) overlay.remove();
    }

    function bspRenderOutputPresetsModal() {
      const overlay = document.getElementById('bsp-fx-overlay');
      if (!overlay) return;
      const outOpts = bspOutputPresetOutputOptions();
      const outLabel = (outOpts.find(o => o.id === bspFxWorkingOutput) || outOpts[0]).label;

      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

      const outSelHtml = outOpts.map(o => `<option value="${esc(o.id)}"${o.id === bspFxWorkingOutput ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
      const kindSelHtml = ['bible', 'songs'].map(k => `<option value="${k}"${k === bspFxWorkingKind ? ' selected' : ''}>${k === 'bible' ? 'Bible' : 'Chants'}</option>`).join('');

      const listHtml = bspOutputPresets.length
        ? `<div class="bsp-fx-list">` + bspOutputPresets.map(p => `
            <div class="bsp-fx-item" data-id="${esc(p.id)}">
              <span class="bsp-fx-badge ${p.kind === 'songs' ? 'songs' : 'bible'}">${p.kind === 'songs' ? 'Chants' : 'Bible'}</span>
              <input class="bsp-fx-item__name" value="${esc(p.name)}" data-act="rename" />
              <button class="bsp-fx-btn" data-act="apply" title="Appliquer à la sortie choisie ci-dessus">Appliquer</button>
              <button class="bsp-fx-iconbtn" data-act="export" title="Exporter (.eeamfx)">⤓</button>
              <button class="bsp-fx-iconbtn" data-act="delete" title="Supprimer">🗑</button>
            </div>`).join('') + `</div>`
        : `<div class="bsp-fx-empty">Aucun preset pour l'instant. Capture le design d'une sortie ci-dessus, ou importe un fichier .eeamfx.</div>`;

      overlay.innerHTML = `
        <div class="bsp-fx-modal" role="dialog" aria-modal="true">
          <div class="bsp-fx-head">
            <h3 class="bsp-fx-title">Presets de sortie (.eeamfx)</h3>
            <button class="bsp-fx-x" data-act="close" aria-label="Fermer">×</button>
          </div>
          <div class="bsp-fx-body">
            <div class="bsp-fx-card">
              <div class="bsp-fx-row" style="margin-bottom:10px">
                <span class="bsp-fx-lbl">Sortie</span>
                <select class="bsp-fx-sel" data-act="output">${outSelHtml}</select>
                <span class="bsp-fx-lbl">Type</span>
                <select class="bsp-fx-sel" data-act="kind">${kindSelHtml}</select>
              </div>
              <div class="bsp-fx-row">
                <input class="bsp-fx-input" data-act="newname" placeholder="Nom du preset (ex. Écran salle — Bible)" />
                <button class="bsp-fx-btn" data-act="capture">+ Capturer le design de cette sortie</button>
              </div>
              <div class="bsp-fx-note" style="margin-top:8px">« Appliquer » applique le preset sélectionné à la sortie choisie ci-dessus (${esc(outLabel)}), pour le type ${bspFxWorkingKind === 'songs' ? 'Chants' : 'Bible'}.</div>
            </div>
            ${listHtml}
          </div>
          <div class="bsp-fx-foot">
            <span class="bsp-fx-note">${bspOutputPresets.length} preset(s) · stockés en local</span>
            <div class="bsp-fx-row">
              <button class="bsp-fx-btn ghost" data-act="import">⤒ Importer .eeamfx</button>
              <button class="bsp-fx-btn ghost" data-act="exportall">⤓ Exporter tout</button>
              <button class="bsp-fx-btn" data-act="close">Fermer</button>
            </div>
          </div>
        </div>`;

      // Wiring
      overlay.querySelectorAll('[data-act="close"]').forEach(b => b.onclick = bspCloseOutputPresetsModal);
      const outSel = overlay.querySelector('[data-act="output"]');
      if (outSel) outSel.onchange = () => { bspFxWorkingOutput = outSel.value; bspRenderOutputPresetsModal(); };
      const kindSel = overlay.querySelector('[data-act="kind"]');
      if (kindSel) kindSel.onchange = () => { bspFxWorkingKind = bspOutputPresetNormalizeKind(kindSel.value); bspRenderOutputPresetsModal(); };
      const capBtn = overlay.querySelector('[data-act="capture"]');
      if (capBtn) capBtn.onclick = () => {
        const nameInput = overlay.querySelector('[data-act="newname"]');
        const p = bspOutputPresetCapture(bspFxWorkingOutput, bspFxWorkingKind, nameInput ? nameInput.value : '');
        if (typeof showToast === 'function') showToast('Preset « ' + p.name + ' » capturé');
        bspRenderOutputPresetsModal();
      };
      const importBtn = overlay.querySelector('[data-act="import"]');
      if (importBtn) importBtn.onclick = bspOutputPresetPickImport;
      const exportAllBtn = overlay.querySelector('[data-act="exportall"]');
      if (exportAllBtn) exportAllBtn.onclick = () => bspOutputPresetExport();

      overlay.querySelectorAll('.bsp-fx-item').forEach((row) => {
        const id = row.getAttribute('data-id');
        const nameInput = row.querySelector('[data-act="rename"]');
        if (nameInput) {
          nameInput.onchange = () => bspOutputPresetRename(id, nameInput.value);
          nameInput.onkeydown = (e) => { if (e.key === 'Enter') nameInput.blur(); };
        }
        const applyBtn = row.querySelector('[data-act="apply"]');
        if (applyBtn) applyBtn.onclick = () => {
          const ok = bspOutputPresetApply(id, bspFxWorkingOutput);
          const outName = (bspOutputPresetOutputOptions().find(o => o.id === bspFxWorkingOutput) || {}).label || 'la sortie';
          if (typeof showToast === 'function') showToast(ok ? ('Preset appliqué à ' + outName) : 'Échec');
        };
        const exportBtn = row.querySelector('[data-act="export"]');
        if (exportBtn) exportBtn.onclick = () => bspOutputPresetExport([id]);
        const delBtn = row.querySelector('[data-act="delete"]');
        if (delBtn) delBtn.onclick = () => {
          const p = bspOutputPresets.find(x => x.id === id);
          const nm = p ? p.name : '';
          bspFxConfirm('Supprimer le preset', 'Supprimer définitivement le preset « ' + nm + ' » ?',
            () => { bspOutputPresetDelete(id); bspRenderOutputPresetsModal(); });
        };
      });
    }

    // Déclenche le sélecteur de fichier .eeamfx (input caché dédié).
    function bspOutputPresetPickImport() {
      let input = document.getElementById('bsp-fx-file-input');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'bsp-fx-file-input';
        input.accept = '.eeamfx,.json';
        input.style.display = 'none';
        document.body.appendChild(input);
      }
      input.onchange = () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          let obj = null;
          try { obj = JSON.parse(String(reader.result || '')); } catch (_) { obj = null; }
          const added = bspOutputPresetImportData(obj);
          if (added && typeof showToast === 'function') showToast(added + ' preset(s) importé(s)');
          bspRenderOutputPresetsModal();
        };
        reader.readAsText(file);
      };
      input.click();
    }
