    // ===== CONFIGURATION EXPORT / IMPORT =====
    // Two targeted files, separate from the heavy full Backup:
    //   • Configuration — per-output designs (live + screens), the base projection
    //     profiles they inherit from, the added-screens list, and the setlist.
    //   • Setlist — the setlist alone, so a service order can be moved or shared
    //     without carrying any design along.
    // Setlist entries are self-contained objects (title/content/meta), not index
    // references into the song or bible libraries, so they survive a transfer intact.

    const BSP_CONFIG_FILE_VERSION = 1;

    function bspTimestampForFilename(d = new Date()) {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
    }

    // Mirrors the Backup save chain, including the OBS path: inside an OBS browser source
    // downloads silently do nothing, so it falls back to the viewer overlay + clipboard.
    async function bspSaveJsonFile(json, filename, fileType) {
      // fileType : { description, ext } — extensions DÉDIÉES (.eeamconf/.eeamset/.eeamsub) pour
      // que chaque type de fichier soit bien distinct et ne se mélange pas à l'import.
      const ft = (fileType && fileType.ext) ? fileType : { description: 'JSON', ext: '.json' };
      const isObsBrowserSource = !!(window.obsstudio &&
        !(window.BSPDesktop && typeof window.BSPDesktop.saveRecordingFile === 'function'));

      if (typeof window.showSaveFilePicker === 'function' && !isObsBrowserSource) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: ft.description || 'EEAM', accept: { 'application/json': [ft.ext] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(new TextEncoder().encode(json));
          await writable.close();
          showToast(t('cfg_saved'));
          return true;
        } catch (err) {
          if (err && (err.name === 'AbortError' || err.code === 20)) return false; // user cancelled
          console.warn('[BSP] config save picker failed, falling back', err);
        }
      }

      if (isObsBrowserSource) {
        let copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try { await navigator.clipboard.writeText(json); copied = true; } catch (_) {}
        }
        if (typeof showObsBackupOverlay === 'function') showObsBackupOverlay(filename, json);
        showToast(copied ? t('cfg_obs_copied') : t('cfg_obs_overlay'));
        return true;
      }

      try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        showToast(t('cfg_saved'));
        return true;
      } catch (err) {
        console.warn('[BSP] config blob download failed', err);
      }

      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(json); copied = true; } catch (_) {}
      }
      showToast(copied ? t('cfg_save_failed_clipboard') : t('cfg_save_failed'));
      return copied;
    }

    // ── Payload builders ───────────────────────────────────────────────────────
    function bspBuildSetlistData() {
      return Array.isArray(schedule) ? JSON.parse(JSON.stringify(schedule)) : [];
    }

    // Bible versions and songs live in IndexedDB; media (background image/video uploads)
    // live as data URLs. Read from the database first, fall back to what's in memory.
    async function bspCollectLibraries() {
      let bibleRecords = [], songRecords = [];
      try {
        await openDb();
        const [s, b] = await Promise.all([dbGetAll(STORE_SONGS), dbGetAll(STORE_BIBLES)]);
        songRecords = s || [];
        bibleRecords = b || [];
      } catch (err) {
        console.warn('[BSP] config export: IndexedDB read failed, using memory', err);
      }
      if (!bibleRecords.length && bibles && Object.keys(bibles).length) {
        bibleRecords = Object.keys(bibles)
          .map(name => buildBibleRecord(name, bibles[name] || [], { isNew: false }))
          .filter(Boolean);
      }
      if (!songRecords.length && Array.isArray(songs) && songs.length) {
        songRecords = songs.map(coerceSongRecord).filter(Boolean);
      }
      let mediaBank = [];
      try {
        await openDb();
        mediaBank = (await dbGetAll(STORE_MEDIA)) || [];
      } catch (_) {}

      return {
        bibles: bibleRecords,
        songs: songRecords,
        media: {
          bgUploadDataUrl: (typeof bgUploadDataUrl !== 'undefined' && bgUploadDataUrl) ? bgUploadDataUrl : '',
          bgVideoUploadDataUrl: (typeof bgVideoUploadDataUrl !== 'undefined' && bgVideoUploadDataUrl) ? bgVideoUploadDataUrl : ''
        },
        // The image/video bank travels too, so a screen's "bank:<id>" reference still
        // resolves after an import on another machine.
        mediaBank,
        customFonts: (typeof customFonts !== 'undefined' && Array.isArray(customFonts)) ? customFonts : []
      };
    }

    function bspBuildConfigPayload() {
      // The base profiles travel with the designs: a per-output design is a DIFF against
      // them, so without the base the same file would look different on another machine.
      let profiles = null;
      try {
        profiles = (typeof ensureProjectionSettingsProfiles === 'function')
          ? JSON.parse(JSON.stringify(ensureProjectionSettingsProfiles()))
          : null;
      } catch (_) {}

      // The full general-settings snapshot travels too: the per-tab profiles above cover
      // Bible/Songs/Setlist FS-LT-Typography-Background, but ANY global setting that lives
      // outside those profiles (LT presets, animation/transition, mode defaults) would
      // otherwise be dropped. Belt-and-braces so nothing configured in Settings is lost.
      let generalSettings = null;
      try {
        if (typeof getUiSnapshot === 'function') generalSettings = JSON.parse(JSON.stringify(getUiSnapshot()));
      } catch (_) {}

      return {
        app: 'Bible Song Pro',
        kind: 'config',
        version: BSP_CONFIG_FILE_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
          outputDesigns: (typeof bspOutputDesigns === 'object' && bspOutputDesigns) ? JSON.parse(JSON.stringify(bspOutputDesigns)) : {},
          projectionProfiles: profiles,
          settings: generalSettings,
          screens: (typeof bspScreensAdded !== 'undefined' && Array.isArray(bspScreensAdded)) ? JSON.parse(JSON.stringify(bspScreensAdded)) : [],
          setlist: bspBuildSetlistData(),
          subtitles: (typeof bspSubtitlesExport === 'function') ? bspSubtitlesExport() : []
        }
      };
    }

    function bspSetlistMetaData() {
      return {
        title: (typeof setlistMeta !== 'undefined' && setlistMeta && setlistMeta.title) || '',
        comment: (typeof setlistMeta !== 'undefined' && setlistMeta && setlistMeta.comment) || ''
      };
    }

    function bspBuildSetlistPayload() {
      return {
        app: 'Bible Song Pro',
        kind: 'setlist',
        version: BSP_CONFIG_FILE_VERSION,
        exportedAt: new Date().toISOString(),
        data: { setlist: bspBuildSetlistData(), meta: bspSetlistMetaData() }
      };
    }

    // ── Export ─────────────────────────────────────────────────────────────────
    async function bspExportConfig() {
      try {
        if (typeof syncAppStateFromUi === 'function' && typeof stateReady !== 'undefined' && stateReady) {
          syncAppStateFromUi();
        }
        const payload = bspBuildConfigPayload();
        // Libraries and media travel with the configuration so a restore is complete.
        // They dominate the file size (a bible is megabytes, an uploaded video far more),
        // so the weight is reported rather than silently produced.
        payload.data.libraries = await bspCollectLibraries();
        const json = JSON.stringify(payload, null, 2);
        const mb = json.length / (1024 * 1024);
        const n = payload.data.libraries.bibles.length;
        if (mb > 8) {
          showToast(t('cfg_large_file').replace('{mb}', mb.toFixed(0)).replace('{n}', String(n)));
        }
        await bspSaveJsonFile(json, `EEAM-config_${bspTimestampForFilename()}.eeamconf`, { description: 'EEAM Configuration', ext: '.eeamconf' });
      } catch (err) {
        console.error('[BSP] config export failed', err);
        showToast(t('cfg_save_failed'));
      }
    }

    async function bspExportSetlist() {
      try {
        if (!Array.isArray(schedule) || !schedule.length) {
          showToast(t('cfg_setlist_empty'));
          return;
        }
        const json = JSON.stringify(bspBuildSetlistPayload(), null, 2);
        const slug = (bspSetlistMetaData().title || 'setlist')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'setlist';
        await bspSaveJsonFile(json, `EEAM-setlist_${slug}_${bspTimestampForFilename()}.eeamset`, { description: 'EEAM Setlist', ext: '.eeamset' });
      } catch (err) {
        console.error('[BSP] setlist export failed', err);
        showToast(t('cfg_save_failed'));
      }
    }

    // Writes imported bible/song records back into IndexedDB and rehydrates the in-memory
    // copies, so versions survive a reload instead of living only for the session.
    // Merges rather than wipes: importing a config must not destroy libraries the file
    // happens not to contain.
    async function bspRestoreLibraries(lib) {
      let restored = 0;
      try {
        await openDb();
        const bibleRecords = Array.isArray(lib.bibles) ? lib.bibles.filter(r => r && r.id) : [];
        const songRecords = Array.isArray(lib.songs) ? lib.songs.filter(r => r && r.id) : [];

        if (bibleRecords.length) {
          await dbPutMany(STORE_BIBLES, bibleRecords);
          bibleRecords.forEach(r => {
            bibles[r.id] = Array.isArray(r.parsedData) ? r.parsedData : [];
            restored++;
          });
          if (!activeBibleVersion || !bibles[activeBibleVersion]) {
            activeBibleVersion = bibleRecords[0].id;
          }
        }
        if (songRecords.length) {
          await dbPutMany(STORE_SONGS, songRecords);
          if (typeof hydrateSongFromRecord === 'function') {
            songRecords.forEach(r => {
              const hydrated = hydrateSongFromRecord(r);
              if (!hydrated) return;
              const i = songs.findIndex(s => s && s.title === hydrated.title);
              if (i >= 0) songs[i] = hydrated; else songs.push(hydrated);
              restored++;
            });
            // Import = « chargement » : appliquer le tri alphabétique (A-Z puis #).
            if (typeof bspSortSongsAlphabetically === 'function') bspSortSongsAlphabetically();
          }
        }
        if (lib.media && typeof lib.media === 'object') {
          if (lib.media.bgUploadDataUrl) bgUploadDataUrl = lib.media.bgUploadDataUrl;
          if (lib.media.bgVideoUploadDataUrl) bgVideoUploadDataUrl = lib.media.bgVideoUploadDataUrl;
        }
        if (Array.isArray(lib.mediaBank) && lib.mediaBank.length) {
          const recs = lib.mediaBank.filter(r => r && r.id && r.dataUrl);
          if (recs.length) {
            await dbPutMany(STORE_MEDIA, recs);
            recs.forEach(r => { if (typeof bspMediaBank !== 'undefined') bspMediaBank[r.id] = r; });
          }
        }
        if (Array.isArray(lib.customFonts) && lib.customFonts.length && typeof injectFontFace === 'function') {
          lib.customFonts.forEach(f => {
            if (!customFonts.some(c => c.name === f.name)) customFonts.push(f);
            injectFontFace(f);
          });
          if (typeof renderFontFamilyOptions === 'function') renderFontFamilyOptions();
        }

        if (typeof renderVersionBar === 'function') renderVersionBar();
        if (typeof renderSongs === 'function') renderSongs();
        if (typeof saveState === 'function') saveState();
        if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      } catch (err) {
        console.error('[BSP] restoreLibraries failed', err);
      }
      return restored;
    }

    // ── Import ─────────────────────────────────────────────────────────────────
    function bspTriggerConfigImport() {
      const el = document.getElementById('bsp-config-import-file');
      if (el) { el.value = ''; el.click(); }
    }

    function bspTriggerSetlistImport() {
      const el = document.getElementById('bsp-setlist-import-file');
      if (el) { el.value = ''; el.click(); }
    }

    function bspParseImportedJson(text) {
      let obj = null;
      try { obj = JSON.parse(text); } catch (_) { return null; }
      if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') return null;
      return obj;
    }

    function bspApplySetlistData(list, { replace = true } = {}) {
      if (!Array.isArray(list)) return 0;
      const clean = list.filter(e => e && typeof e === 'object');
      if (replace) schedule.length = 0;
      clean.forEach(e => schedule.push(JSON.parse(JSON.stringify(e))));
      if (typeof renderSongs === 'function' && sidebarTab === 'schedule') renderSongs();
      if (typeof saveState === 'function') saveState();
      if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      return clean.length;
    }

    async function bspHandleSetlistImport(input) {
      const file = input && input.files && input.files[0];
      if (!file) return;
      try {
        const obj = bspParseImportedJson(await file.text());
        if (!obj) { showToast(t('cfg_invalid_file')); return; }
        // ENCODAGE DÉDIÉ : un fichier de setlist doit être une SETLIST (.eeamset), pas une config.
        if (obj.kind && obj.kind !== 'setlist') { showToast(t('cfg_wrong_kind_setlist')); return; }
        const list = obj.data.setlist;
        if (!Array.isArray(list)) { showToast(t('cfg_no_setlist')); return; }
        // Replacing the running order mid-service would be destructive, so confirm first.
        const apply = () => {
         try {
          const n = bspApplySetlistData(list, { replace: true });
          const meta = obj.data.meta && typeof obj.data.meta === 'object' ? obj.data.meta : {};
          if (typeof setlistMeta !== 'undefined') {
            setlistMeta = { title: String(meta.title || ''), comment: String(meta.comment || '') };
            if (typeof bspRenderSetlistHeader === 'function') bspRenderSetlistHeader();
          }
          showToast(t('cfg_setlist_imported').replace('{n}', String(n)));
         } catch (err) {
          console.error('[BSP] setlist import apply failed', err);
          showToast(t('cfg_invalid_file'));
         }
        };
        if (schedule.length && typeof showConfirm === 'function') {
          showConfirm(t('cfg_import_setlist'), t('cfg_replace_setlist_confirm').replace('{n}', String(list.length)), apply);
        } else {
          apply();
        }
      } catch (err) {
        console.error('[BSP] setlist import failed', err);
        showToast(t('cfg_invalid_file'));
      } finally {
        if (input) input.value = '';
      }
    }

    async function bspHandleConfigImport(input) {
      const file = input && input.files && input.files[0];
      if (!file) return;
      try {
        const obj = bspParseImportedJson(await file.text());
        if (!obj) { showToast(t('cfg_invalid_file')); return; }
        // ENCODAGE DÉDIÉ : la configuration n'accepte QUE des fichiers config (.eeamconf) — on
        // refuse un fichier setlist/sous-titres pour éviter tout mélange (demande utilisateur).
        if (obj.kind && obj.kind !== 'config') { showToast(t('cfg_wrong_kind_config')); return; }
        const d = obj.data;
        const hasDesigns = d.outputDesigns && typeof d.outputDesigns === 'object';
        const hasSetlist = Array.isArray(d.setlist);
        if (!hasDesigns && !hasSetlist) { showToast(t('cfg_invalid_file')); return; }

        const apply = () => {
         try {
          const parts = [];
          if (hasDesigns) {
            bspOutputDesigns = JSON.parse(JSON.stringify(d.outputDesigns));
            if (typeof bspOutputDesignsPersist === 'function') bspOutputDesignsPersist();
            parts.push(t('cfg_part_designs'));
          }
          if (Array.isArray(d.screens) && typeof bspScreensAdded !== 'undefined') {
            bspScreensAdded = JSON.parse(JSON.stringify(d.screens));
            if (typeof bspScreensPersist === 'function') bspScreensPersist();
            if (typeof bspScreensRenderChips === 'function') bspScreensRenderChips();
            parts.push(t('cfg_part_screens'));
          }
          // Prefer the full general-settings snapshot when the file carries one: it holds
          // the per-tab profiles AND every global setting, so one call restores it all.
          // Older files without `settings` fall back to projectionProfiles alone.
          if (d.settings && typeof d.settings === 'object' && typeof loadProjectionSettingsProfilesFromUi === 'function') {
            loadProjectionSettingsProfilesFromUi(d.settings);
            if (typeof applyProjectionSettingsSnapshot === 'function') {
              // Apply the flat global values (LT presets, transforms, etc.) to the DOM/live.
              applyProjectionSettingsSnapshot(d.settings, { triggerChange: false });
            }
            if (typeof applyProjectionSettingsProfileForTab === 'function') {
              applyProjectionSettingsProfileForTab(getEffectiveSettingsTargetTab(), { triggerChange: false });
            }
            parts.push(t('cfg_part_base'));
          } else if (d.projectionProfiles && typeof d.projectionProfiles === 'object' &&
              typeof projectionSettingsProfilesByTab !== 'undefined') {
            projectionSettingsProfilesByTab = JSON.parse(JSON.stringify(d.projectionProfiles));
            if (typeof applyProjectionSettingsProfileForTab === 'function') {
              applyProjectionSettingsProfileForTab(getEffectiveSettingsTargetTab(), { triggerChange: false });
            }
            parts.push(t('cfg_part_base'));
          }
          if (hasSetlist) {
            bspApplySetlistData(d.setlist, { replace: true });
            parts.push(t('cfg_part_setlist'));
          }
          if (Array.isArray(d.subtitles) && typeof bspSubtitlesLoad === 'function') {
            bspSubtitlesLoad(d.subtitles);
            if (typeof bspSubtitlesPersist === 'function') bspSubtitlesPersist();
            parts.push(t('cfg_part_subtitles'));
          }
          if (d.libraries && typeof d.libraries === 'object') {
            // Async, but the rest of the import must not wait on it; it reports separately.
            bspRestoreLibraries(d.libraries).then((added) => {
              if (added) showToast(t('cfg_libraries_restored').replace('{n}', String(added)));
            }).catch(err => console.error('[BSP] library restore failed', err));
            parts.push(t('cfg_part_libraries'));
          }
          if (typeof bspRenderScreenDesignPanel === 'function') bspRenderScreenDesignPanel();
          if (typeof isLive !== 'undefined' && isLive && typeof livePointer !== 'undefined' && livePointer &&
              typeof scheduleLiveUpdate === 'function') {
            scheduleLiveUpdate();
          }
          showToast(t('cfg_config_imported').replace('{parts}', parts.join(', ')));
         } catch (err) {
          console.error('[BSP] config import apply failed', err);
          showToast(t('cfg_invalid_file'));
         }
        };

        if (typeof showConfirm === 'function') {
          showConfirm(t('cfg_import_config'), t('cfg_replace_config_confirm'), apply);
        } else {
          apply();
        }
      } catch (err) {
        console.error('[BSP] config import failed', err);
        showToast(t('cfg_invalid_file'));
      } finally {
        if (input) input.value = '';
      }
    }
