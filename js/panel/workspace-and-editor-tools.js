    function selectAbTheme(value) {
      const normalizedTheme = normalizeThemeId(value);
      closeAbSettingsPopup();
      const sel = document.getElementById('theme-select');
      if (sel) { sel.value = normalizedTheme; handleThemeChange(); }
      syncActiveThemeIndicator(normalizedTheme);
    }
    function syncActiveThemeIndicator(activeTheme) {
      document.querySelectorAll('.ab-popup-sub [data-theme]').forEach(el => {
        el.classList.toggle('theme-active', el.dataset.theme === activeTheme);
      });
    }
    function selectAbLanguage(code) {
      closeAbSettingsPopup();
      const sel = document.getElementById('language-select');
      if (sel) { sel.value = code; handleLanguageChange(); }
    }
    function buildAbLangSubmenu() {
      const host = document.getElementById('ab-lang-submenu');
      const src = document.getElementById('language-select');
      if (!host || !src) return;
      host.innerHTML = '';
      // Search bar
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ab-sub-search';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = t('settings_search_language');
      searchInput.onclick = e => e.stopPropagation();
      searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();
        host.querySelectorAll('.ab-popup-item').forEach(item => {
          item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      };
      searchWrap.appendChild(searchInput);
      host.appendChild(searchWrap);
      // Language items
      Array.from(src.options).forEach(opt => {
        const item = document.createElement('div');
        item.className = 'ab-popup-item';
        item.textContent = opt.textContent;
        item.onclick = () => selectAbLanguage(opt.value);
        host.appendChild(item);
      });
    }

    function activityBarClick(tabId) {
      if (tabId === 'schedule') {
        setSidebarTab('schedule');
        updateActivityBarUi('schedule');
        return;
      }
      setDockSceneTab(tabId);
    }

    function saveWorkspaceTabPreference(tabId) {
      try { localStorage.setItem('activeWorkspaceTab', String(tabId || 'bible')); } catch (e) {}
    }

    function restoreWorkspaceTabPreference() {
      let saved = '';
      try { saved = String(localStorage.getItem('activeWorkspaceTab') || '').toLowerCase(); } catch (e) {}
      if (!saved) return;
      if (saved === 'song' || saved === 'songs') { setDockSceneTab('song'); return; }
      if (saved === 'bible') { setDockSceneTab('bible'); return; }
      if (saved === 'schedule') { setSidebarTab('schedule'); updateActivityBarUi('schedule'); return; }
      setDockSceneTab('bible');
    }

    function getDisplayFileForTab(tabId, mode = 'embedded') {
      if (isVmixMode() && localServerInfo && localServerInfo.displayUrl) {
        return localServerInfo.displayUrl;
      }
      const params = new URLSearchParams();
      params.set(mode === 'standalone' ? 'standalone' : 'embedded', '1');
      params.set('hostMode', getHostMode());
      if (isVmixMode()) {
        const relayHost = resolveRelayHost() || '127.0.0.1';
        const relayPort = getRelayPort();
        params.set('relayPort', relayPort);
        params.set('relay', `ws://${relayHost}:${relayPort}`);
      }
      return `BSP_display.html?${params.toString()}`;
    }

    function shouldSkipPunctuationLine(line) {
      const t = (line || "").trim();
      if (!t) return true;
      return /^[\.,;:!?\-—_'""()\[\]{}…]+$/.test(t);
    }

    function shouldShowSongSolfaNotes() {
      return !!document.getElementById('show-song-solfa-notes')?.checked;
    }

    function getWorkspaceLabelText(tab = sidebarTab) {
      if (tab === 'songs') return 'Song';
      if (tab === 'schedule') return 'Setlist';
      return 'Bible';
    }

    function updateWorkspaceStateLabels(tab = sidebarTab) {
      const text = getWorkspaceLabelText(tab);
      const animationLabel = document.getElementById('animation-workspace-label');
      const annotateLabel = document.getElementById('annotate-workspace-label');
      if (animationLabel) animationLabel.textContent = text;
      if (annotateLabel) annotateLabel.textContent = text;
    }

    function shouldShowSongCategoryName() {
      return !!document.getElementById('show-song-category-name')?.checked;
    }

    function shouldDisplaySongsBySection() {
      return !!document.getElementById('display-song-sections')?.checked;
    }

    const SIDEBAR_QUICK_ACTION_GROUPS = [
      {
        titleKey: 'settings_song_options',
        items: [
          { id: 'show-song-category-name', labelKey: 'settings_show_category_name' },
          { id: 'display-song-sections', labelKey: 'settings_display_songs_by_sections' },
          {
            label: 'Show bilingual',
            getValue: () => getSongBilingualSettings().bilingualEnabled,
            onChange: (nextValue) => setGlobalSongBilingualEnabled(nextValue)
          },
          {
            label: 'Lyrics display',
            type: 'select',
            getValue: () => getSongBilingualSettings().displayMode,
            onChange: (nextValue) => setGlobalSongDisplayMode(nextValue),
            options: [
              { value: 'primary', label: 'Primary only' },
              { value: 'stacked', label: 'Primary + translated' },
              { value: 'translated-only', label: 'Translated only' }
            ]
          },
          {
            id: 'full-text-transform',
            labelKey: 'settings_song_text_transform',
            type: 'select',
            badgeKey: 'mode_full',
            options: [
              { value: 'none', labelKey: 'common_none' },
              { value: 'uppercase', labelKey: 'common_uppercase' },
              { value: 'lowercase', labelKey: 'common_lowercase' },
              { value: 'capitalize', labelKey: 'common_capitalize' }
            ]
          },
          {
            id: 'lt-text-transform',
            labelKey: 'settings_song_text_transform',
            type: 'select',
            badgeKey: 'mode_lt',
            options: [
              { value: 'uppercase', labelKey: 'common_uppercase' },
              { value: 'none', labelKey: 'common_none' },
              { value: 'lowercase', labelKey: 'common_lowercase' },
              { value: 'capitalize', labelKey: 'common_capitalize' }
            ]
          },
          {
            labelKey: 'settings_lower_third_mode',
            type: 'select',
            badgeKey: 'mode_lt',
            getValue: () => ltAnchorMode,
            onChange: (nextValue) => setLtAnchorMode(nextValue),
            options: [
              { value: 'bottom', labelKey: 'common_bottom' },
              { value: 'top', labelKey: 'common_top' }
            ]
          }
        ]
      },
      {
        titleKey: 'settings_bible_options',
        items: [
          { id: 'shorten-bible-versions', labelKey: 'settings_shorten_bible_versions' },
          { id: 'shorten-bible-books', labelKey: 'settings_shorten_bible_books' },
          { id: 'version-switch-updates-live', labelKey: 'settings_version_switch_updates_output' }
        ]
      }
    ];

    function parseSongCategoryName(line) {
      const match = String(line || '').trim().match(/^category\s*:\s*(.+)$/i);
      return match ? match[1].trim() : '';
    }

    function isLikelySolfaLine(line) {
      const t = String(line || '').trim();
      if (!t) return false;
      const semicolons = (t.match(/;/g) || []).length;
      if (semicolons < 3) return false;
      if (/^(category|verse|chorus|refrain)\b/i.test(t)) return false;
      if (t.length > 180) return false;
      return /^[a-z0-9;\s\-\]\[\(\)\.']+$/i.test(t);
    }

    // Runs on every keystroke of the lyric editor. Only the cheap, must-be-fresh work
    // happens inline; the heavy bookkeeping (search-index rebuild, full app-state
    // snapshot, IndexedDB persist, relay push of ALL songs, button re-render, translation
    // panel) is coalesced to ~250 ms after typing stops. This keeps typing fluid even
    // with a large song library — the earlier version did all of that on every character.
    let songEditCommitTimer = 0;
    let songEditPendingItem = null;

    function saveCurrentItem() {
      if (sidebarTab === 'bible' || !currentItem) return;
      const nextText = document.getElementById('lyric-editor').value;
      const prevText = currentItem.content || currentItem.text || '';
      if (nextText === prevText) return; // caret moves, etc. — nothing to persist
      // Immediate & cheap: keep the in-memory item text current so live projection and
      // any reader see the latest keystroke without waiting for the debounce.
      currentItem.content = nextText;
      currentItem.text = nextText;
      currentItem.updatedAt = Date.now();
      // Live output should track typing closely; scheduleLiveUpdate is itself throttled.
      if (isLive && livePointer && livePointer.kind === 'songs' && livePointer.index === currentIndex) {
        scheduleLiveUpdate();
      }
      // Defer the heavy work, bound to THIS item so switching songs mid-debounce still
      // commits the right one.
      songEditPendingItem = currentItem;
      clearTimeout(songEditCommitTimer);
      songEditCommitTimer = setTimeout(commitSongEdit, 250);
    }

    // Heavy bookkeeping for a song edit, run once the operator pauses typing.
    function commitSongEdit() {
      clearTimeout(songEditCommitTimer);
      songEditCommitTimer = 0;
      const item = songEditPendingItem;
      songEditPendingItem = null;
      if (!item) return;
      const text = item.content || item.text || '';
      normalizeSongTranslationState(item);
      const settings = getSongBilingualSettings();
      item.translationLanguage = settings.targetLanguage;
      markSongTranslationStale(item);
      if (settings.bilingualEnabled && settings.autoTranslateOnOpen && !item.translationLocked) {
        scheduleSongTranslation(item.id);
      }
      item.searchableText = normalizeSearchText(`${item.title || ''}\n${text}`);
      scheduleSongPersist(item);
      // Propager l'édition au chant maître et aux entrées de setlist de même id (sync 2 sens).
      bspSyncSongEditAcross(item);
      saveState();
      saveToStorageDebounced();
      // UI refreshes only matter for the song still on screen.
      if (item === currentItem) {
        updateButtonView();
        refreshSongTranslationPanel(item);
      }
    }
    // Flush any pending edit synchronously (called before switching songs / on teardown)
    // so nothing typed in the last 250 ms is lost.
    window.bspFlushSongEdit = function () { if (songEditPendingItem) commitSongEdit(); };

    // ═══ Sync bidirectionnelle chant ⇄ setlist ═══
    // Un chant et ses entrées de setlist partagent le même `id` (ajouter à la setlist copie le
    // chant). Ils vivaient découplés : éditer l'un ne touchait pas l'autre. On propage désormais
    // titre + paroles à TOUS les objets de même id — le chant maître dans `songs` ET les entrées
    // de `schedule` — à partir de l'objet qu'on vient d'éditer (donc dans les deux sens).
    function bspSyncSongEditAcross(sourceItem) {
      if (!sourceItem || !sourceItem.id) return;
      const id = sourceItem.id;
      const title = sourceItem.title;
      const content = (sourceItem.content != null) ? sourceItem.content : (sourceItem.text || '');
      const search = (typeof normalizeSearchText === 'function') ? normalizeSearchText(`${title || ''}\n${content || ''}`) : undefined;
      const apply = (obj) => {
        if (!obj || obj === sourceItem || obj.id !== id) return false;
        obj.title = title; obj.content = content; obj.text = content; obj.updatedAt = Date.now();
        if (search !== undefined) obj.searchableText = search;
        return true;
      };
      let touched = false;
      if (typeof songs !== 'undefined' && Array.isArray(songs)) {
        songs.forEach((sg) => {
          if (apply(sg)) {
            touched = true;
            try { idbPut(STORE_SONGS, buildSongRecord(sg, { isNew: false })).catch(() => {}); } catch (_) {}
          }
        });
      }
      if (typeof schedule !== 'undefined' && Array.isArray(schedule)) {
        schedule.forEach((en) => { if (apply(en)) touched = true; });
      }
      if (!touched) return;
      // Rafraîchir la liste visible + le direct si l'élément projeté partage cet id.
      if (typeof renderSongs === 'function') renderSongs();
      if (typeof isLive !== 'undefined' && isLive && typeof livePointer !== 'undefined' && livePointer && typeof scheduleLiveUpdate === 'function') {
        const liveObj = (livePointer.source === 'schedule') ? (Array.isArray(schedule) ? schedule[livePointer.index] : null)
                      : (livePointer.kind === 'songs' && Array.isArray(songs) ? songs[livePointer.index] : null);
        if (liveObj && liveObj.id === id) scheduleLiveUpdate();
      }
    }
    window.bspSyncSongEditAcross = bspSyncSongEditAcross;
    
    function captureSingleLineFontBaseline() {
      if (singleLineFontSizeSnapshot != null) return;
      if (linesPerPage !== 1) return;
      const fontInput = document.getElementById('font-size-val');
      if (!fontInput) return;
      singleLineFontSizeSnapshot = Number(fontInput.value || DEFAULT_BIBLE_FULL_FONT);
    }

    function createDefaultFocusedWorkspaceControlState(tab) {
      const defaultBackgroundByRatio = {
        full: { bgToggle: true, bgMode: 'solid' },
        lt: { bgToggle: tab === 'songs' ? !!songBgUserOn : true, bgMode: 'solid' }
      };
      return {
        linesPerPage: (tab === 'bible') ? 1 : Math.min(2, getMaxLinesForCurrentTab(tab)),
        activeRatio: 'full',
        bgToggle: defaultBackgroundByRatio.full.bgToggle,
        bgMode: defaultBackgroundByRatio.full.bgMode,
        backgroundLinked: true,
        backgroundByRatio: defaultBackgroundByRatio,
        bgType: 'color',
        songTransitionType: 'fade',
        songTransitionDuration: '0.8',
        animateBgTransitions: false,
        presetPopoverOpen: false,
        annotateOpen: false,
        annotateColor: null,
        annotatePickerColor: ''
      };
    }

    function createDefaultFocusedWorkspaceControls() {
      const next = {};
      FOCUSED_WORKSPACE_TABS.forEach((tab) => {
        next[tab] = createDefaultFocusedWorkspaceControlState(tab);
      });
      return next;
    }

    function getFocusedWorkspaceRatioKey(ratio = activeRatio) {
      return ratio === '16-9' ? 'lt' : 'full';
    }

    function normalizeFocusedWorkspaceBackgroundState(raw) {
      return {
        bgToggle: raw && raw.bgToggle != null ? !!raw.bgToggle : true,
        bgMode: raw && raw.bgMode === 'gradient' ? 'gradient' : 'solid'
      };
    }

    function normalizeFocusedWorkspaceBackgroundByRatio(raw, legacy, tab) {
      const defaults = createDefaultFocusedWorkspaceControlState(tab).backgroundByRatio;
      const source = (raw && typeof raw === 'object') ? raw : {};
      const result = {
        full: normalizeFocusedWorkspaceBackgroundState(source.full || defaults.full),
        lt: normalizeFocusedWorkspaceBackgroundState(source.lt || defaults.lt)
      };
      if (!raw && legacy && typeof legacy === 'object') {
        const legacyKey = getFocusedWorkspaceRatioKey(legacy.activeRatio);
        result[legacyKey] = normalizeFocusedWorkspaceBackgroundState({
          bgToggle: legacy.bgToggle,
          bgMode: legacy.bgMode
        });
      }
      return result;
    }

    function normalizeFocusedWorkspaceControlState(raw, tab) {
      const base = createDefaultFocusedWorkspaceControlState(tab);
      const next = (raw && typeof raw === 'object') ? raw : {};
      const maxLines = getMaxLinesForCurrentTab(tab);
      const rawLines = Number.parseInt(next.linesPerPage, 10);
      // Préserver les modes SD (sd-left/sd-right) EN PLUS de LT : ce normaliseur écrasait tout
      // ce qui n'était pas '16-9' en 'full', si bien qu'en mode workspace « focused » (le
      // défaut) la sauvegarde/restauration des contrôles par onglet faisait retomber le Live
      // (et les écrans qui en héritent) en Fullscreen dès qu'on rouvrait Settings ou changeait
      // un paramètre. 'custom' → 'full' reste voulu (comme setRatio).
      const rawRatio = (next.activeRatio === '16-9' || next.activeRatio === 'sd-left' || next.activeRatio === 'sd-right')
        ? next.activeRatio : 'full';
      const backgroundByRatio = normalizeFocusedWorkspaceBackgroundByRatio(next.backgroundByRatio, next, tab);
      const backgroundLinked = next.backgroundLinked == null ? base.backgroundLinked : next.backgroundLinked === true;
      let activeBackground = backgroundByRatio[getFocusedWorkspaceRatioKey(rawRatio)] || backgroundByRatio.full;
      if (backgroundLinked) {
        activeBackground = normalizeFocusedWorkspaceBackgroundState(activeBackground);
        backgroundByRatio.full = { ...activeBackground };
        backgroundByRatio.lt = { ...activeBackground };
      }
      return {
        linesPerPage: Math.max(1, Math.min(maxLines, Number.isFinite(rawLines) ? rawLines : base.linesPerPage)),
        activeRatio: rawRatio,
        bgToggle: activeBackground.bgToggle,
        bgMode: activeBackground.bgMode,
        backgroundLinked,
        backgroundByRatio,
        bgType: next.bgType === 'image' || next.bgType === 'video' ? next.bgType : 'color',
        songTransitionType: String(next.songTransitionType || base.songTransitionType || 'fade'),
        songTransitionDuration: String(next.songTransitionDuration || base.songTransitionDuration || '0.8'),
        animateBgTransitions: next.animateBgTransitions == null ? base.animateBgTransitions : !!next.animateBgTransitions,
        presetPopoverOpen: !!next.presetPopoverOpen,
        annotateOpen: !!next.annotateOpen,
        annotateColor: next.annotateColor || null,
        annotatePickerColor: next.annotatePickerColor || ''
      };
    }

    function ensureFocusedWorkspaceControlsState() {
      if (!focusedWorkspaceControlsByTab || typeof focusedWorkspaceControlsByTab !== 'object') {
        focusedWorkspaceControlsByTab = createDefaultFocusedWorkspaceControls();
        return focusedWorkspaceControlsByTab;
      }
      FOCUSED_WORKSPACE_TABS.forEach((tab) => {
        focusedWorkspaceControlsByTab[tab] = normalizeFocusedWorkspaceControlState(focusedWorkspaceControlsByTab[tab], tab);
      });
      return focusedWorkspaceControlsByTab;
    }

    function captureFocusedWorkspaceControlState(tab = sidebarTab) {
      const bgToggle = document.getElementById('bg-toggle');
      const bgType = document.getElementById('bg-type');
      const existing = focusedWorkspaceControlsByTab && focusedWorkspaceControlsByTab[tab]
        ? focusedWorkspaceControlsByTab[tab]
        : null;
      const backgroundByRatio = normalizeFocusedWorkspaceBackgroundByRatio(existing && existing.backgroundByRatio, existing, tab);
      const backgroundLinked = !!(existing && existing.backgroundLinked);
      const currentBackground = normalizeFocusedWorkspaceBackgroundState({
        bgToggle: bgToggle ? !!bgToggle.checked : true,
        bgMode
      });
      backgroundByRatio[getFocusedWorkspaceRatioKey(activeRatio)] = currentBackground;
      if (backgroundLinked) {
        backgroundByRatio.full = { ...currentBackground };
        backgroundByRatio.lt = { ...currentBackground };
      }
      return normalizeFocusedWorkspaceControlState({
        linesPerPage,
        activeRatio,
        bgToggle: bgToggle ? !!bgToggle.checked : true,
        bgMode,
        backgroundLinked,
        backgroundByRatio,
        bgType: bgType ? bgType.value : 'color',
        songTransitionType: document.getElementById('song-transition-type')?.value || 'fade',
        songTransitionDuration: document.getElementById('song-transition-duration')?.value || '0.8',
        animateBgTransitions: document.getElementById('animate-bg-transitions')?.checked !== false,
        presetPopoverOpen: typeof presetPopoverOpen !== 'undefined' ? !!presetPopoverOpen : false,
        ...(typeof getAnnotateWorkspaceState === 'function' ? getAnnotateWorkspaceState() : {})
      }, tab);
    }

    function saveFocusedWorkspaceControlsForTab(tab = sidebarTab) {
      if (!FOCUSED_WORKSPACE_TABS.includes(tab)) return;
      const controls = ensureFocusedWorkspaceControlsState();
      controls[tab] = captureFocusedWorkspaceControlState(tab);
    }

    // Garde le mode (activeRatio) de l'état workspace « focused » d'un onglet EN PHASE avec le
    // profil de projection de ce kind. Indispensable car régler un mode via Settings pour un
    // kind qui n'est PAS celui affiché dans le workspace ne déclenche pas setRatio (donc ne
    // sauvegarde pas l'état focused de ce kind) : sans ça, revenir sur cet onglet — ou projeter
    // ce kind — restaurait l'ancien mode et faisait retomber la sortie en Fullscreen. Ne touche
    // QUE activeRatio (le reste de l'état focused est préservé).
    function bspSyncFocusedWorkspaceRatioForTab(tab, ratio) {
      if (!FOCUSED_WORKSPACE_TABS.includes(tab)) return;
      if (['full', '16-9', 'sd-left', 'sd-right'].indexOf(ratio) === -1) return;
      const controls = ensureFocusedWorkspaceControlsState();
      const cur = (controls[tab] && typeof controls[tab] === 'object') ? controls[tab] : {};
      controls[tab] = normalizeFocusedWorkspaceControlState({ ...cur, activeRatio: ratio }, tab);
    }

    function loadFocusedWorkspaceControlsFromUi(ui) {
      const defaults = createDefaultFocusedWorkspaceControls();
      const source = (ui && ui.focusedWorkspaceControls && typeof ui.focusedWorkspaceControls === 'object')
        ? ui.focusedWorkspaceControls
        : {};
      focusedWorkspaceControlsByTab = {};
      FOCUSED_WORKSPACE_TABS.forEach((tab) => {
        focusedWorkspaceControlsByTab[tab] = normalizeFocusedWorkspaceControlState(source[tab] || defaults[tab], tab);
      });
      return focusedWorkspaceControlsByTab;
    }

    function applyFocusedWorkspaceControlsForTab(tab, opts = {}) {
      if (!FOCUSED_WORKSPACE_TABS.includes(tab)) return false;
      const controls = ensureFocusedWorkspaceControlsState();
      const next = normalizeFocusedWorkspaceControlState(controls[tab], tab);
      controls[tab] = next;

      linesPerPage = next.linesPerPage;
      activeRatio = next.activeRatio;
      bgMode = next.bgMode;

      const bgToggle = document.getElementById('bg-toggle');
      if (bgToggle) {
        bgToggle.checked = !!next.bgToggle;
      }

      const bgType = document.getElementById('bg-type');
      if (bgType) {
        bgType.value = next.bgType;
      }
      const transitionType = document.getElementById('song-transition-type');
      if (transitionType) transitionType.value = next.songTransitionType || 'fade';
      const transitionDuration = document.getElementById('song-transition-duration');
      if (transitionDuration) {
        transitionDuration.value = next.songTransitionDuration || '0.8';
        if (typeof updateSliderValue === 'function') updateSliderValue(transitionDuration, 's');
        if (typeof updateSliderFill === 'function') updateSliderFill(transitionDuration);
      }
      const animateBgToggle = document.getElementById('animate-bg-transitions');
      if (animateBgToggle) animateBgToggle.checked = !!next.animateBgTransitions;

      document.querySelectorAll('#line-picker .seg-btn').forEach((b) => b.classList.toggle('active', b.id === 'line-' + linesPerPage));
      const ratioFullBtn = document.getElementById('ratio-full');
      const ratioLtBtn = document.getElementById('ratio-lt');
      const ratioCustomBtn = document.getElementById('ratio-custom');
      if (ratioFullBtn) ratioFullBtn.classList.toggle('active', activeRatio === 'full');
      if (ratioLtBtn) ratioLtBtn.classList.toggle('active', activeRatio === '16-9');
      if (ratioCustomBtn) ratioCustomBtn.classList.toggle('active', false);

      updateBgModeUi();
      updateModeBackgroundLinkUi();
      updateBgTypePicker();
      handleBgTypeChange();
      syncBgOpacitySlider();
      if (typeof setPresetPopoverOpen === 'function') setPresetPopoverOpen(!!next.presetPopoverOpen, { persist: false });
      if (typeof applyAnnotateWorkspaceState === 'function') {
        applyAnnotateWorkspaceState({
          annotateOpen: !!next.annotateOpen,
          annotateColor: next.annotateColor || null,
          annotatePickerColor: next.annotatePickerColor || ''
        }, { persist: false });
      }
      updateLinePickerAvailability();
      updateCustomModeAvailability();
      updateTextEditorModeAvailability();
      updateSongTextTransformControl();
      handleSongFullFontState({ suppressLiveUpdate: true });

      if (opts.render !== false) {
        updateButtonView({ preserveScroll: true, skipAutoScroll: true });
      }
      return true;
    }

    function applyFocusedWorkspaceBackgroundForRatio(tab = sidebarTab, ratio = activeRatio) {
      if (!FOCUSED_WORKSPACE_TABS.includes(tab)) return false;
      const controls = ensureFocusedWorkspaceControlsState();
      const state = normalizeFocusedWorkspaceControlState(controls[tab], tab);
      controls[tab] = state;
      const next = state.backgroundByRatio[getFocusedWorkspaceRatioKey(ratio)] || state.backgroundByRatio.full;
      bgMode = next.bgMode;
      const bgToggle = document.getElementById('bg-toggle');
      if (bgToggle) bgToggle.checked = !!next.bgToggle;
      updateBgModeUi();
      updateModeBackgroundLinkUi();
      return true;
    }

    function isModeBackgroundLinked(tab = sidebarTab) {
      if (!FOCUSED_WORKSPACE_TABS.includes(tab)) return false;
      const controls = ensureFocusedWorkspaceControlsState();
      const state = normalizeFocusedWorkspaceControlState(controls[tab], tab);
      controls[tab] = state;
      return !!state.backgroundLinked;
    }

    function updateModeBackgroundLinkUi() {
      const icon = document.getElementById('mode-bg-link-icon');
      if (!icon) return;
      const linked = isModeBackgroundLinked(sidebarTab);
      icon.classList.toggle('linked', linked);
      icon.setAttribute('aria-pressed', linked ? 'true' : 'false');
      icon.title = linked ? 'Unlink FS and LT backgrounds' : 'Link FS and LT backgrounds';
      icon.setAttribute('aria-label', icon.title);
    }

    function setModeBackgroundLinked(linked) {
      if (!FOCUSED_WORKSPACE_TABS.includes(sidebarTab)) return;
      saveFocusedWorkspaceControlsForTab(sidebarTab);
      const controls = ensureFocusedWorkspaceControlsState();
      const state = normalizeFocusedWorkspaceControlState(controls[sidebarTab], sidebarTab);
      const bgToggle = document.getElementById('bg-toggle');
      const currentBackground = normalizeFocusedWorkspaceBackgroundState({
        bgToggle: bgToggle ? !!bgToggle.checked : true,
        bgMode
      });
      state.backgroundLinked = !!linked;
      state.backgroundByRatio[getFocusedWorkspaceRatioKey(activeRatio)] = { ...currentBackground };
      if (state.backgroundLinked) {
        state.backgroundByRatio.full = { ...currentBackground };
        state.backgroundByRatio.lt = { ...currentBackground };
      }
      controls[sidebarTab] = normalizeFocusedWorkspaceControlState(state, sidebarTab);
      updateModeBackgroundLinkUi();
      if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
    }

    function toggleModeBackgroundLinked() {
      setModeBackgroundLinked(!isModeBackgroundLinked(sidebarTab));
    }

    function setupModeBackgroundLinkControl() {
      updateModeBackgroundLinkUi();
    }

    function getWorkspaceFontSizeInputId(ratio = activeRatio) {
      return ratio === '16-9' ? 'font-size-lt-val' : 'font-size-val';
    }

    function getWorkspaceFontSizeValue() {
      const inputId = getWorkspaceFontSizeInputId();
      const input = document.getElementById(inputId);
      const fallback = activeRatio === '16-9'
        ? (typeof getEffectiveLtFont === 'function' ? getEffectiveLtFont() : 36)
        : DEFAULT_BIBLE_FULL_FONT;
      const value = Number(input && input.value !== '' ? input.value : fallback);
      return Number.isFinite(value) ? value : fallback;
    }

    function updateWorkspaceFontSizeControl() {
      const valueBtn = document.getElementById('workspace-font-size-value');
      const wrap = document.getElementById('workspace-font-size-control');
      if (!valueBtn || !wrap) return;
      const value = Math.round(getWorkspaceFontSizeValue());
      const modeLabel = activeRatio === '16-9' ? 'LT' : 'FS';
      const label = `${modeLabel} verse font size: ${value}pt`;
      valueBtn.textContent = `${value}pt`;
      valueBtn.title = `${label}. Click to increase.`;
      wrap.title = label;
      wrap.setAttribute('aria-label', label);
    }

    function setWorkspaceFontSizeValue(value) {
      const input = document.getElementById(getWorkspaceFontSizeInputId());
      if (!input) return;
      const min = Number(input.min);
      const max = Number(input.max);
      let next = Number(value);
      if (!Number.isFinite(next)) next = getWorkspaceFontSizeValue();
      if (Number.isFinite(min)) next = Math.max(min, next);
      if (Number.isFinite(max)) next = Math.min(max, next);
      input.value = String(Math.round(next));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      updateWorkspaceFontSizeControl();
    }

    function stepWorkspaceFontSize(direction) {
      const input = document.getElementById(getWorkspaceFontSizeInputId());
      const step = Number(input && input.step);
      const delta = (Number.isFinite(step) && step > 0 ? step : 1) * (Number(direction) || 0);
      setWorkspaceFontSizeValue(getWorkspaceFontSizeValue() + delta);
    }

    function setupWorkspaceFontSizeControl() {
      ['font-size-val', 'font-size-lt-val'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input || input.dataset.workspaceFontSizeBound === '1') return;
        input.dataset.workspaceFontSizeBound = '1';
        input.addEventListener('input', updateWorkspaceFontSizeControl);
        input.addEventListener('change', updateWorkspaceFontSizeControl);
      });
      updateWorkspaceFontSizeControl();
    }

    function getMaxLinesForCurrentTab(tab = sidebarTab) {
      return (tab === 'songs') ? 6 : 3;
    }

    function updateLinePickerAvailability() {
      const isSongs = (sidebarTab === 'songs');
      const btn4 = document.getElementById('line-4');
      const btn5 = document.getElementById('line-5');
      const btn6 = document.getElementById('line-6');
      if (btn4) btn4.disabled = !isSongs;
      if (btn5) btn5.disabled = !isSongs;
      if (btn6) btn6.disabled = !isSongs;
    }

    function isCustomModeAllowed() {
      if (sidebarTab === 'bible') return true;
      if (sidebarTab === 'schedule') {
        return currentItem ? getIsBibleItem(currentItem) : false;
      }
      return false;
    }

    function updateCustomModeAvailability() {
      const customBtn = document.getElementById('ratio-custom');
      if (!customBtn) return;
      const allowed = isCustomModeAllowed();
      customBtn.disabled = !allowed;
      if (!allowed && activeRatio === 'custom') {
        setRatio('full');
      }
    }

    function updateTextEditorModeAvailability() {
      const textBtn = document.getElementById('mode-text');
      if (!textBtn) return;
      const isBible = isBibleContentActive() || sidebarTab === 'bible';
      textBtn.disabled = isBible;
      if (isBible && editorMode === 'text') {
        setEditorMode('btn');
      }
    }

    function setLines(n, opts = {}) {
      const maxLines = getMaxLinesForCurrentTab(sidebarTab);
      const targetLines = Math.max(1, Math.min(n, maxLines));
      if (targetLines !== n) n = targetLines;
      if (n > 1 && linesPerPage === 1) {
        captureSingleLineFontBaseline();
      }
      const isBible = sidebarTab === 'bible' && currentItem && getIsBibleItem(currentItem);
      let anchorVerse = opts.anchorVerse ? String(opts.anchorVerse).trim() : null;
      if (isBible && !anchorVerse) {
        const prevPages = getPagesFromItem(currentItem, true);
        const prevPage = prevPages[lineCursor];
        anchorVerse = (prevPage && prevPage.startVerse) ? String(prevPage.startVerse).trim() : getFirstVerseNumber(prevPage && prevPage.raw);
      }
      const fullFontInput = document.getElementById('font-size-val');
      if (n === 1) {
        restoreLongVerseFullFontOverride(true);
        if (singleLineFontSizeSnapshot != null && fullFontInput) {
          fullFontInput.value = String(singleLineFontSizeSnapshot);
          singleLineFontSizeSnapshot = null;
        }
      }
      linesPerPage = n;
      const panelKind = getCurrentPanelContentKind();
      if (isLive && livePointer && panelKind && livePointer.kind === panelKind) {
        liveLinesPerPage = n;
      }
      if (isBible && anchorVerse) {
        setBibleGroupAnchor(anchorVerse, currentItem);
        const pages = getPagesFromItem(currentItem, true);
        const targetIdx = pages.findIndex(p => matchesVerseStart(p.raw, anchorVerse));
        if (targetIdx !== -1) lineCursor = targetIdx;
      }
      document.querySelectorAll('#line-picker .seg-btn').forEach(b => b.classList.toggle('active', b.id === 'line-' + n));
      updateButtonView();
      if (isLive && livePointer && livePointer.kind === 'bible' && currentItem && currentItem.version === livePointer.version && currentIndex === livePointer.index) {
        liveLineCursor = lineCursor;
      }
      if (!opts.silent) onAnyControlChange();
      // Keep the Edit Design modal's Lines control (which mirrors this one on the live
      // output) in lockstep — the two are one instance.
      if (typeof bspIsDesignModalOpen === 'function' && bspIsDesignModalOpen() &&
          typeof bspRenderScreenDesignPanel === 'function') {
        bspRenderScreenDesignPanel();
      }
    }
    
    function setRatio(r) {
      if (r === 'custom') r = 'full';
      const prevRatio = activeRatio;
      const useFocusedWorkspaceControls = isFocusedWorkspaceMode();
      if (useFocusedWorkspaceControls) {
        saveFocusedWorkspaceControlsForTab(sidebarTab);
      }
      activeRatio = r;
      document.getElementById('ratio-full')?.classList.toggle('active', r === 'full');
      document.getElementById('ratio-lt')?.classList.toggle('active', r === '16-9');
      document.getElementById('ratio-custom')?.classList.toggle('active', r === 'custom');
      
      if (r === 'custom' && ltStyle === 'default') setLtStyle('custom');
      if (useFocusedWorkspaceControls) {
        applyFocusedWorkspaceBackgroundForRatio(sidebarTab, r);
      } else {
        // SD (side-screen) is full-like: enable the background when switching into it,
        // just like FS.
        const fullLike = (r === 'full' || r === 'sd-left' || r === 'sd-right');
        if (fullLike && prevRatio !== r) document.getElementById('bg-toggle').checked = true;
        if (r === '16-9') applyLtBgDefaultForTab(getEffectiveContentTab());
      }
      const panelKind = getCurrentPanelContentKind();
      if (isLive && livePointer && panelKind && livePointer.kind === panelKind) {
        liveRatio = r;
      }
      // Persister le mode dans le profil du kind AFFICHÉ, en DIRECT — pour ne pas dépendre de la
      // capture générale (onAnyControlChange → getEffectiveSettingsTargetTab()), qui pouvait
      // router vers le mauvais kind quand Settings verrouille l'onglet, laissant profiles[kind]
      // périmé. profiles[kind].activeRatio reste ainsi la source de vérité fiable lue par
      // projectLive et la zone Mode. Idem pour l'état focused du kind.
      const setRatioKind = (panelKind === 'songs') ? 'songs' : (panelKind === 'bible' ? 'bible' : null);
      if (setRatioKind && typeof ensureProjectionSettingsProfiles === 'function') {
        const setRatioProfiles = ensureProjectionSettingsProfiles();
        if (setRatioProfiles[setRatioKind]) setRatioProfiles[setRatioKind].activeRatio = r;
        if (typeof bspSyncFocusedWorkspaceRatioForTab === 'function') bspSyncFocusedWorkspaceRatioForTab(setRatioKind, r);
      }

      handleDualFontOverrideState();
      syncBgOpacitySlider();
      updateSongTextTransformControl();
      handleSongFullFontState({ suppressLiveUpdate: true });
      updateModeBackgroundLinkUi();
      updateWorkspaceFontSizeControl();
      onAnyControlChange();
    }

    function setFullHAlign(val) {
      fullHAlign = val || 'center';
      updateFullAlignButtons();
      onAnyControlChange();
    }

    function setFullRefHAlign(val) {
      fullRefHAlign = val || 'center';
      updateFullAlignButtons();
      onAnyControlChange();
    }

    function setFullVAlign(val) {
      fullVAlign = val || 'middle';
      updateFullAlignButtons();
      onAnyControlChange();
    }

    function setBarHAlign(val) {
      const hidden = document.getElementById('se-bar-h-align');
      if (hidden) hidden.value = val || 'left';
      updateBarAlignButtons();
      updateStylePreview();
    }

    function setBarVAlign(val) {
      const hidden = document.getElementById('se-bar-v-align');
      if (hidden) hidden.value = val || 'middle';
      updateBarAlignButtons();
      updateStylePreview();
    }

    function setRefHAlign(val) {
      const hidden = document.getElementById('se-ref-h-align');
      if (hidden) hidden.value = val || 'center';
      updateRefAlignButtons();
      updateStylePreview();
    }

    function setRefVAlign(val) {
      const hidden = document.getElementById('se-ref-v-align');
      if (hidden) hidden.value = val || 'middle';
      updateRefAlignButtons();
      updateStylePreview();
    }

    // Lower Third alignment handlers
    function setLtHAlign(val) {
      const v = val || 'center';
      if (sidebarTab === 'bible') {
        ltHAlignBible = v;
      } else {
        ltHAlignSongs = v;
      }
      updateLtAlignButtons();
      onAnyControlChange();
    }

    function setLtVAlign(val) {
      const v = val || 'middle';
      if (sidebarTab === 'bible') {
        ltVAlignBible = v;
      } else {
        ltVAlignSongs = v;
      }
      updateLtAlignButtons();
      onAnyControlChange();
    }

    function setLtAnchorMode(val) {
      ltAnchorMode = (val === 'top') ? 'top' : 'bottom';
      updateLtAnchorButtons();
      onAnyControlChange();
    }

    function setLtBibleVerseHAlign(val) {
      ltHAlignBibleVerse = val || 'left';
      updateLtBibleVerseAlignButtons();
      onAnyControlChange();
    }

    function updateLtAlignButtons() {
      // Horizontal
      const hMap = { left: 'lt-h-left', center: 'lt-h-center', right: 'lt-h-right', justify: 'lt-h-justify' };
      const currentH = (sidebarTab === 'bible') ? ltHAlignBible : ltHAlignSongs;
      Object.entries(hMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', currentH === key);
      });

      // Vertical
      const vMap = { top: 'lt-v-top', middle: 'lt-v-middle', bottom: 'lt-v-bottom' };
      const currentV = (sidebarTab === 'bible') ? ltVAlignBible : ltVAlignSongs;
      Object.entries(vMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', currentV === key);
      });

      updateLtBibleVerseAlignButtons();
      updateLtAnchorButtons();
      updateLtAlignTooltip();
    }

    function updateLtAnchorButtons() {
      const topBtn = document.getElementById('lt-anchor-top');
      const bottomBtn = document.getElementById('lt-anchor-bottom');
      if (topBtn) topBtn.classList.toggle('active', ltAnchorMode === 'top');
      if (bottomBtn) bottomBtn.classList.toggle('active', ltAnchorMode !== 'top');
    }

    function updateLtBibleVerseAlignButtons() {
      const hMap = { left: 'lt-bv-h-left', center: 'lt-bv-h-center', right: 'lt-bv-h-right', justify: 'lt-bv-h-justify' };
      Object.entries(hMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', ltHAlignBibleVerse === key);
      });
    }

    function updateLtBibleVerseAlignVisibility() {
      const row = document.getElementById('lt-bible-verse-align-row');
      if (!row) return;
      row.style.display = (sidebarTab === 'bible') ? '' : 'none';
    }

    function updateLtAlignTooltip() {
      const hPick = document.getElementById('lt-h-align-picker');
      const vPick = document.getElementById('lt-v-align-picker');
      if (hPick) hPick.title = t('settings_horizontal_align');
      if (vPick) vPick.title = t('settings_vertical_align');
    }

    function capitalize(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }

    function updateFullAlignButtons() {
      const refMap = { left: 'full-ref-h-left', center: 'full-ref-h-center', right: 'full-ref-h-right', justify: 'full-ref-h-justify' };
      Object.entries(refMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', fullRefHAlign === key);
      });
      const hMap = { left: 'full-h-left', center: 'full-h-center', right: 'full-h-right', justify: 'full-h-justify' };
      Object.entries(hMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', fullHAlign === key);
      });
      const vMap = { top: 'full-v-top', middle: 'full-v-middle', bottom: 'full-v-bottom' };
      Object.entries(vMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', fullVAlign === key);
      });
    }

    function updateBarAlignButtons() {
      const hVal = document.getElementById('se-bar-h-align')?.value || 'left';
      const vVal = document.getElementById('se-bar-v-align')?.value || 'middle';
      const hMap = { left: 'se-bar-h-left', center: 'se-bar-h-center', right: 'se-bar-h-right', justify: 'se-bar-h-justify' };
      Object.entries(hMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', hVal === key);
      });
      const vMap = { top: 'se-bar-v-top', middle: 'se-bar-v-middle', bottom: 'se-bar-v-bottom' };
      Object.entries(vMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', vVal === key);
      });
    }

    function updateRefAlignButtons() {
      const hVal = document.getElementById('se-ref-h-align')?.value || 'center';
      const vVal = document.getElementById('se-ref-v-align')?.value || 'middle';
      const hMap = { left: 'se-ref-h-left', center: 'se-ref-h-center', right: 'se-ref-h-right', justify: 'se-ref-h-justify' };
      Object.entries(hMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', hVal === key);
      });
      const vMap = { top: 'se-ref-v-top', middle: 'se-ref-v-middle', bottom: 'se-ref-v-bottom' };
      Object.entries(vMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', vVal === key);
      });
    }
    
    function setRefBgEnabled(enabled, opts = {}) {
      refBgEnabled = !!enabled;
      const onBtn = document.getElementById('ref-bg-toggle-on');
      const offBtn = document.getElementById('ref-bg-toggle-off');
      if (onBtn) onBtn.classList.toggle('active', refBgEnabled);
      if (offBtn) offBtn.classList.toggle('active', !refBgEnabled);
      const row = document.getElementById('ref-bg-color-row');
      const effectiveTarget = (typeof getEffectiveSettingsTargetTab === 'function')
        ? getEffectiveSettingsTargetTab()
        : 'bible';
      if (row) row.style.display = (effectiveTarget === 'songs') ? 'none' : (refBgEnabled ? '' : 'none');
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setReferenceShadowEnabled(enabled, opts = {}) {
      referenceShadowEnabled = !!enabled;
      const onBtn = document.getElementById('ref-shadow-on');
      const offBtn = document.getElementById('ref-shadow-off');
      if (onBtn) onBtn.classList.toggle('active', referenceShadowEnabled);
      if (offBtn) offBtn.classList.toggle('active', !referenceShadowEnabled);
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setVerseShadowEnabled(enabled, opts = {}) {
      verseShadowEnabled = !!enabled;
      const onBtn = document.getElementById('verse-shadow-on');
      const offBtn = document.getElementById('verse-shadow-off');
      if (onBtn) onBtn.classList.toggle('active', verseShadowEnabled);
      if (offBtn) offBtn.classList.toggle('active', !verseShadowEnabled);
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setReferenceCapitalized(enabled, opts = {}) {
      referenceTextCapitalized = !!enabled;
      const normalizedTransform = referenceTextCapitalized ? 'uppercase' : 'none';
      if (typeof updateReferenceTextTransformValue === 'function') {
        updateReferenceTextTransformValue('full', normalizedTransform);
        updateReferenceTextTransformValue('lt', normalizedTransform);
      }
      const toggle = document.getElementById('capitalize-ref-text');
      if (toggle) toggle.checked = referenceTextCapitalized;
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setDualVersionSecondaryId(id, opts = {}) {
      // Key-existence, not value: a lazily-unloaded version is a valid secondary choice.
      const normalized = (id && bibles && (id in bibles)) ? id : null;
      dualVersionSecondaryId = normalized;
      // Lazy load: bring the secondary version's verses into memory so the dual render
      // has data, then refresh once it resolves.
      if (normalized && typeof ensureBibleLoaded === 'function' &&
          typeof isBibleLoaded === 'function' && !isBibleLoaded(normalized)) {
        ensureBibleLoaded(normalized).then(() => {
          renderDualVersionPickers();
          if (typeof isLive !== 'undefined' && isLive && typeof scheduleLiveUpdate === 'function') scheduleLiveUpdate();
        });
      }
      const select = document.getElementById('dual-version-secondary-select');
      if (select) {
        select.value = normalized || '';
      }
      renderDualVersionPickers();
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function closeDualVersionMenus() {
      const primaryMenu = document.getElementById('dual-version-primary-menu');
      const secondaryMenu = document.getElementById('dual-version-secondary-menu');
      if (primaryMenu) primaryMenu.classList.remove('open');
      if (secondaryMenu) secondaryMenu.classList.remove('open');
    }

    function toggleDualVersionMenu(kind, event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const menu = document.getElementById(kind === 'secondary' ? 'dual-version-secondary-menu' : 'dual-version-primary-menu');
      if (!menu) return;
      const isOpen = menu.classList.contains('open');
      closeDualVersionMenus();
      if (!isOpen) {
        menu.classList.add('open');
        requestAnimationFrame(() => {
          const input = menu.querySelector('.dual-version-picker-search input');
          if (input) {
            try { input.focus(); } catch (_) {}
          }
        });
      }
    }

    function selectDualVersionOption(kind, value) {
      if (kind === 'secondary') {
        const select = document.getElementById('dual-version-secondary-select');
        if (select) select.value = value || '';
        handleDualSecondarySelectChange();
      } else {
        const select = document.getElementById('dual-version-primary-select');
        if (select) select.value = value || '';
        handleDualPrimarySelectChange();
      }
      closeDualVersionMenus();
    }

    function renderDualVersionPickers() {
      const versions = Object.keys(bibles || {});
      const primaryBtn = document.getElementById('dual-version-primary-btn');
      const secondaryBtn = document.getElementById('dual-version-secondary-btn');
      const primaryMenu = document.getElementById('dual-version-primary-menu');
      const secondaryMenu = document.getElementById('dual-version-secondary-menu');
      const primarySelect = document.getElementById('dual-version-primary-select');
      const secondarySelect = document.getElementById('dual-version-secondary-select');
      if (!primaryBtn || !secondaryBtn || !primaryMenu || !secondaryMenu || !primarySelect || !secondarySelect) return;

      const primaryValue = primarySelect.value || '';
      const secondaryValue = secondarySelect.value || '';
      primaryBtn.textContent = primaryValue || 'Select version';
      secondaryBtn.textContent = secondaryValue || t('ui_select_secondary_version');
      primaryBtn.disabled = versions.length === 0;
      secondaryBtn.disabled = versions.length < 2;

      primaryMenu.innerHTML = '';
      const primarySearchWrap = document.createElement('div');
      primarySearchWrap.className = 'dual-version-picker-search';
      const primarySearchInput = document.createElement('input');
      primarySearchInput.type = 'text';
      primarySearchInput.placeholder = t('ui_search_generic');
      primarySearchInput.autocomplete = 'off';
      primarySearchInput.setAttribute('aria-label', t('ui_search_generic'));
      primarySearchWrap.appendChild(primarySearchInput);
      primaryMenu.appendChild(primarySearchWrap);
      const primaryRows = [];
      versions.forEach((ver) => {
        const wrapper = document.createElement('div');
        wrapper.className = `footer-bv-item ${primaryValue === ver ? 'active' : ''}`;
        wrapper.dataset.searchLabel = normalizeSearchText(ver);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-bv-btn';
        btn.innerHTML = `
          <svg class="footer-bv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span>${esc(ver)}</span>
        `;
        btn.onclick = () => selectDualVersionOption('primary', ver);
        wrapper.appendChild(btn);
        primaryRows.push(wrapper);
        primaryMenu.appendChild(wrapper);
      });
      primarySearchInput.addEventListener('input', () => {
        const q = normalizeSearchText(primarySearchInput.value || '').trim();
        primaryRows.forEach(row => {
          const label = row.dataset.searchLabel || '';
          row.style.display = !q || label.includes(q) ? '' : 'none';
        });
      });

      secondaryMenu.innerHTML = '';
      const secondarySearchWrap = document.createElement('div');
      secondarySearchWrap.className = 'dual-version-picker-search';
      const secondarySearchInput = document.createElement('input');
      secondarySearchInput.type = 'text';
      secondarySearchInput.placeholder = t('ui_search_generic');
      secondarySearchInput.autocomplete = 'off';
      secondarySearchInput.setAttribute('aria-label', t('ui_search_generic'));
      secondarySearchWrap.appendChild(secondarySearchInput);
      secondaryMenu.appendChild(secondarySearchWrap);
      const secondaryRows = [];
      versions.forEach((ver) => {
        const disabled = (ver === activeBibleVersion);
        const wrapper = document.createElement('div');
        wrapper.className = `footer-bv-item ${secondaryValue === ver ? 'active' : ''}${disabled ? ' disabled' : ''}`;
        wrapper.dataset.searchLabel = normalizeSearchText(ver);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-bv-btn';
        btn.innerHTML = `
          <svg class="footer-bv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span>${esc(ver)}</span>
        `;
        btn.disabled = disabled;
        btn.onclick = () => selectDualVersionOption('secondary', ver);
        wrapper.appendChild(btn);
        secondaryRows.push(wrapper);
        secondaryMenu.appendChild(wrapper);
      });
      secondarySearchInput.addEventListener('input', () => {
        const q = normalizeSearchText(secondarySearchInput.value || '').trim();
        secondaryRows.forEach(row => {
          const label = row.dataset.searchLabel || '';
          row.style.display = !q || label.includes(q) ? '' : 'none';
        });
      });
    }

    function shouldApplyDualFontOverride() {
      const autoResizeFull = document.getElementById('auto-resize-full')?.value || 'none';
      return dualVersionModeEnabled &&
        !!dualVersionSecondaryId &&
        activeRatio === 'full' &&
        sidebarTab === 'bible' &&
        autoResizeFull !== 'none';
    }

    function captureDualFontSizes() {
      const verseInput = document.getElementById('font-size-val');
      const refInput = document.getElementById('ref-font-size-val');
      if (!verseInput || !refInput) return null;
      return {
        verse: Number(verseInput.value || DEFAULT_BIBLE_FULL_FONT),
        ref: Number(refInput.value || 45)
      };
    }

    function applyDualFontOverride(opts = {}) {
      if (dualModeFontOverrideActive) return;
      const verseInput = document.getElementById('font-size-val');
      const refInput = document.getElementById('ref-font-size-val');
      if (!verseInput || !refInput) return;
      if (!dualModeFontOverrideSnapshot) {
        const snapshot = captureDualFontSizes();
        if (!snapshot) return;
        dualModeFontOverrideSnapshot = snapshot;
      }
      dualModeFontOverrideActive = true;
    }

    function restoreDualFontOverride(force = false, opts = {}) {
      if (!dualModeFontOverrideActive && !force) return;
      const snapshot = dualModeFontOverrideSnapshot;
      if (!snapshot) {
        dualModeFontOverrideActive = false;
        return;
      }
      const verseInput = document.getElementById('font-size-val');
      const refInput = document.getElementById('ref-font-size-val');
      if (verseInput) {
        verseInput.value = String(snapshot.verse);
      }
      if (refInput) {
        refInput.value = String(snapshot.ref);
      }
      dualModeFontOverrideActive = false;
      dualModeFontOverrideSnapshot = null;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function shouldApplyDualLtOverride() {
      return dualVersionModeEnabled &&
        !!dualVersionSecondaryId &&
        activeRatio === '16-9' &&
        sidebarTab === 'bible';
    }

    function captureDualLtSettings() {
      const verseInput = document.getElementById('font-size-lt-val');
      const refInput = document.getElementById('ref-font-size-lt-val');
      const autoResize = document.getElementById('auto-resize-lt');
      if (!verseInput || !refInput) return null;
      return {
        verse: Number(verseInput.value || 36),
        ref: Number(refInput.value || 26),
        autoResize: autoResize ? autoResize.value : null
      };
    }

    function applyDualLtOverride(opts = {}) {
      if (dualModeLtActive) return;
      const verseInput = document.getElementById('font-size-lt-val');
      const refInput = document.getElementById('ref-font-size-lt-val');
      const autoResize = document.getElementById('auto-resize-lt');
      if (!verseInput || !refInput || !autoResize) return;
      if (!dualModeLtSnapshot) {
        const snapshot = captureDualLtSettings();
        if (!snapshot) return;
        dualModeLtSnapshot = snapshot;
      }
      const dualBibleLtMaxFont = (typeof DUAL_BIBLE_LT_MAX_FONT === 'number') ? DUAL_BIBLE_LT_MAX_FONT : 23;
      const nextVerseSize = Math.min(Number(verseInput.value || dualBibleLtMaxFont), dualBibleLtMaxFont);
      ltFontBible = nextVerseSize;
      verseInput.value = String(nextVerseSize);
      refInput.value = String(Math.min(Number(refInput.value || 22), 22));
      ltRefFontSize = Number(refInput.value || 22);
      autoResize.value = 'shrink';
      dualModeLtActive = true;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function restoreDualLtOverride(force = false, opts = {}) {
      if (!dualModeLtActive && !force) return;
      const snapshot = dualModeLtSnapshot;
      if (!snapshot) {
        dualModeLtActive = false;
        return;
      }
      const verseInput = document.getElementById('font-size-lt-val');
      const refInput = document.getElementById('ref-font-size-lt-val');
      const autoResize = document.getElementById('auto-resize-lt');
      if (verseInput) {
        verseInput.value = String(snapshot.verse);
        ltFontBible = snapshot.verse;
      }
      if (refInput) {
        refInput.value = String(snapshot.ref);
        ltRefFontSize = snapshot.ref;
      }
      if (autoResize && snapshot.autoResize != null) {
        autoResize.value = snapshot.autoResize;
      }
      dualModeLtActive = false;
      dualModeLtSnapshot = null;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function handleDualFontOverrideState(opts = {}) {
      if (sidebarTab !== 'bible') {
        if (!dualVersionModeEnabled) {
          restoreDualLtOverride(false, opts);
          restoreDualFontOverride(false, opts);
        }
        return;
      }
      if (shouldApplyDualFontOverride()) {
        restoreDualLtOverride(false, opts);
        applyDualFontOverride(opts);
      } else if (shouldApplyDualLtOverride()) {
        restoreDualFontOverride(true, opts);
        applyDualLtOverride(opts);
      } else {
        restoreDualLtOverride(false, opts);
        if (!dualVersionModeEnabled || !dualVersionSecondaryId) {
          restoreDualFontOverride(false, opts);
        }
      }
    }

    function captureFullFontSize() {
      const fontInput = document.getElementById('font-size-val');
      if (!fontInput) return null;
      return Number(fontInput.value || DEFAULT_BIBLE_FULL_FONT);
    }

    function getLongVerseFullFontBaseSize(preferredValue = null) {
      if (longVerseFullFontActive && Number.isFinite(longVerseFullFontSnapshot)) {
        return Number(longVerseFullFontSnapshot);
      }
      const explicitValue = Number(preferredValue);
      if (Number.isFinite(explicitValue)) return explicitValue;
      const capturedValue = captureFullFontSize();
      return Number.isFinite(capturedValue) ? capturedValue : DEFAULT_BIBLE_FULL_FONT;
    }

    function applyLongVerseFullFontOverride(key, factor = 0.8, sourceFontSize = null) {
      if (!key) return;
      const fontInput = document.getElementById('font-size-val');
      if (!fontInput) return;
      if (longVerseFullFontActive) {
        if (longVerseFullVerseKey === key && longVerseFullFontFactor === factor) return;
        restoreLongVerseFullFontOverride(true);
      }
      if (longVerseFullFontSnapshot == null) {
        const snapshot = Number.isFinite(sourceFontSize) ? sourceFontSize : captureFullFontSize();
        if (snapshot == null) return;
        longVerseFullFontSnapshot = snapshot;
      }
      longVerseFullFontFactor = factor;
      const reduced = Math.max(12, Math.round(longVerseFullFontSnapshot * factor));
      fontInput.value = String(reduced);
      longVerseFullFontActive = true;
      longVerseFullVerseKey = key;
    }

    function restoreLongVerseFullFontOverride(force = false) {
      if (!longVerseFullFontActive && !force) return;
      const fontInput = document.getElementById('font-size-val');
      if (fontInput && longVerseFullFontSnapshot != null) {
        fontInput.value = String(longVerseFullFontSnapshot);
      }
      longVerseFullFontActive = false;
      longVerseFullFontSnapshot = null;
      longVerseFullVerseKey = null;
      longVerseFullFontFactor = null;
    }

    function handleLongVerseFullFontState(shouldApply, key, reductionFactor = 0.8, sourceFontSize = null) {
      if (shouldApply && key) {
        applyLongVerseFullFontOverride(key, reductionFactor, sourceFontSize);
      } else {
        restoreLongVerseFullFontOverride();
      }
    }

    function shouldApplySongFullFontDefaults() {
      return activeRatio === 'full' && isLive && liveKind === 'songs';
    }

    function applySongFullFontDefaults(opts = {}) {
      if (!shouldApplySongFullFontDefaults()) return false;
      if (songFullFontOverrideActive) return false;
      const verseInput = document.getElementById('font-size-val');
      const lineHeightInput = document.getElementById('line-height-full');
      if (!verseInput || !lineHeightInput) return false;
      songFullFontSnapshot = {
        verse: Number(verseInput.value || DEFAULT_BIBLE_FULL_FONT),
        lineHeight: Number(lineHeightInput.value || DEFAULT_BIBLE_FULL_LINE_HEIGHT)
      };
      verseInput.value = String(DEFAULT_SONG_FULL_FONT);
      lineHeightInput.value = String(DEFAULT_SONG_FULL_LINE_HEIGHT);
      updateSliderValue(lineHeightInput);
      updateSliderFill(lineHeightInput);
      songFullFontOverrideActive = true;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
      return true;
    }

    function restoreSongFullFontDefaults(opts = {}) {
      if (!songFullFontOverrideActive && !opts.force) return false;
      const verseInput = document.getElementById('font-size-val');
      const lineHeightInput = document.getElementById('line-height-full');
      if (!verseInput || !lineHeightInput) {
        songFullFontOverrideActive = false;
        songFullFontSnapshot = null;
        return false;
      }
      const snapshot = songFullFontSnapshot || {
        verse: DEFAULT_BIBLE_FULL_FONT,
        lineHeight: DEFAULT_BIBLE_FULL_LINE_HEIGHT
      };
      verseInput.value = String(snapshot.verse);
      lineHeightInput.value = String(snapshot.lineHeight);
      updateSliderValue(lineHeightInput);
      updateSliderFill(lineHeightInput);
      songFullFontOverrideActive = false;
      songFullFontSnapshot = null;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
      return true;
    }

    function handleSongFullFontState(opts = {}) {
      if (shouldApplySongFullFontDefaults()) {
        return applySongFullFontDefaults(opts);
      }
      return restoreSongFullFontDefaults(opts);
    }

    function updateDualVersionSelects() {
      const primarySelect = document.getElementById('dual-version-primary-select');
      const secondarySelect = document.getElementById('dual-version-secondary-select');
      const versions = Object.keys(bibles || []);
      if (primarySelect) {
        primarySelect.innerHTML = '';
        versions.forEach(ver => {
          const opt = document.createElement('option');
          opt.value = ver;
          opt.textContent = ver;
          primarySelect.appendChild(opt);
        });
        if (versions.length) {
          primarySelect.value = activeBibleVersion && versions.includes(activeBibleVersion)
            ? activeBibleVersion
            : versions[0];
        } else {
          primarySelect.value = '';
        }
      }
      if (secondarySelect) {
        secondarySelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = t('ui_select_secondary_version');
        placeholder.disabled = true;
        placeholder.selected = !dualVersionSecondaryId;
        secondarySelect.appendChild(placeholder);
        versions.forEach(ver => {
          const opt = document.createElement('option');
          opt.value = ver;
          opt.textContent = ver;
          if (ver === activeBibleVersion) opt.disabled = true;
          if (ver === dualVersionSecondaryId) {
            opt.selected = true;
          }
          secondarySelect.appendChild(opt);
        });
        if (dualVersionSecondaryId && !versions.includes(dualVersionSecondaryId)) {
          setDualVersionSecondaryId(null, { silent: true });
        } else {
          secondarySelect.value = dualVersionSecondaryId || '';
        }
        secondarySelect.disabled = versions.length < 2;
      }
      renderDualVersionPickers();
    }

    function setDualVersionModeEnabled(enabled, opts = {}) {
      const toggle = document.getElementById('dual-version-mode-toggle');
      const row = document.getElementById('dual-version-select-row');
      const hasMultipleVersions = Object.keys(bibles || []).length > 1;
      const prevState = dualVersionModeEnabled;
      dualVersionModeEnabled = !!enabled && hasMultipleVersions;
      if (toggle) {
        toggle.checked = dualVersionModeEnabled;
        toggle.disabled = !hasMultipleVersions;
      }
      if (row) {
        row.style.display = dualVersionModeEnabled ? 'flex' : 'none';
      }
      if (dualVersionModeEnabled && !prevState) {
        const fontInput = document.getElementById('font-size-val');
        preDualFontSize = Number(fontInput?.value || DEFAULT_BIBLE_FULL_FONT);
      }
      if (!dualVersionModeEnabled && prevState) {
        if (preDualFontSize != null) {
          const fontInput = document.getElementById('font-size-val');
          if (fontInput) fontInput.value = String(preDualFontSize);
          preDualFontSize = null;
        }
        restoreLongVerseFullFontOverride(true);
        restoreDualFontOverride(true);
        setDualVersionSecondaryId(null, { silent: true });
      }
      if (!dualVersionModeEnabled) {
        setDualVersionSecondaryId(null, { silent: true });
      }
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
      handleDualFontOverrideState();
    }

    function updateDualVersionAvailability() {
      const hasMultipleVersions = Object.keys(bibles || []).length > 1;
      const toggle = document.getElementById('dual-version-mode-toggle');
      if (toggle) {
        toggle.disabled = !hasMultipleVersions;
      }
      if (!hasMultipleVersions && dualVersionModeEnabled) {
        setDualVersionModeEnabled(false, { silent: true });
      }
      const panel = document.getElementById('dual-version-panel');
      if (!hasMultipleVersions && panel) {
        panel.classList.remove('open');
        closeDualVersionMenus();
      }
    }

    function handleDualVersionModeToggle() {
      const toggle = document.getElementById('dual-version-mode-toggle');
      if (!toggle) return;
      setDualVersionModeEnabled(toggle.checked);
    }

    function handleDualPrimarySelectChange() {
      const select = document.getElementById('dual-version-primary-select');
      if (!select) return;
      const version = select.value;
      if (!version) return;
      changeActiveBibleVersion(version);
      handleDualFontOverrideState();
    }

    function handleDualSecondarySelectChange() {
      const select = document.getElementById('dual-version-secondary-select');
      if (!select) return;
      setDualVersionSecondaryId(select.value);
      handleDualFontOverrideState();
    }

    function handleReferenceCapitalizedToggle() {
      const toggle = document.getElementById('capitalize-ref-text');
      if (!toggle) return;
      setReferenceCapitalized(toggle.checked);
    }

    function buildReferenceBadgeSpan(text, fontSizePt, foregroundColor, backgroundColor, opts = {}) {
      // Per-output radius: use the profile-driven refBorderRadius global unless the caller
      // pins one (kept for callers that pass an explicit borderRadius).
      const radius = (opts.borderRadius != null)
        ? opts.borderRadius
        : `${Math.max(0, Math.min(240, Number(refBorderRadius) || 0))}px`;
      const styles = [
        `color:${foregroundColor}`,
        // refBold defaults true (bold 800); off gives regular 400. refItalic adds italic.
        `font-weight:${(typeof refBold !== 'undefined' && refBold === false) ? '400' : '800'}`,
        `font-style:${(typeof refItalic !== 'undefined' && refItalic) ? 'italic' : 'normal'}`,
        `font-size:${fontSizePt}pt`,
        'display:inline-block',
        `border-radius:${radius}`,
        'white-space:nowrap',
        'line-height:1.2',
        `text-transform:${opts.textTransform || 'uppercase'}`
      ];
      // Border stroke (per-output, profile-driven). 0 = no border. Colour may carry alpha
      // (#RRGGBBAA) — CSS renders it directly, so opacity needs no separate key.
      const refBW = Math.max(0, Math.min(40, Number(typeof refBorderWidth !== 'undefined' ? refBorderWidth : 0) || 0));
      if (refBW > 0) {
        styles.push(`border:${refBW}px solid ${(typeof refBorderColor !== 'undefined' && refBorderColor) ? refBorderColor : '#FFFFFF'}`);
      }
      // Underline the reference text — an alternative (or complement) to the box.
      if (refUnderlineEnabled) {
        const th = Math.max(0, Math.min(40, Number(refUnderlineThickness) || 0));
        styles.push('text-decoration:underline');
        styles.push(`text-decoration-color:${refUnderlineColor || foregroundColor}`);
        styles.push(`text-decoration-thickness:${th}px`);
        styles.push('text-underline-offset:0.18em');
      }
      const allowBackground = (opts.allowBackground !== undefined) ? opts.allowBackground : true;
      const paddingValue = opts.padding || '16px 80px';
      // Progressive contour on the reference (soft outline), merged into text-shadow like the
      // content. Built with the shared buildContourLayers so it matches the verse/song outline.
      const refContourLayers = (typeof refContourEnabled !== 'undefined' && refContourEnabled &&
                                typeof buildContourLayers === 'function')
        ? buildContourLayers(refContourColor, refContourSize) : [];
      const composeTextShadow = (dropLayer) => {
        const ts = [];
        if (dropLayer) ts.push(dropLayer);
        refContourLayers.forEach(l => ts.push(l));
        return 'text-shadow:' + (ts.length ? ts.join(',') : 'none') + ';';
      };
      // Simple stroke on the reference (crisp outline behind the fill), like the content.
      if (typeof refStrokeEnabled !== 'undefined' && refStrokeEnabled) {
        const sw = Math.max(0, Math.min(20, Number(refStrokeSize) || 0));
        if (sw > 0) {
          styles.push(`-webkit-text-stroke:${sw}px ${refStrokeColor || '#000000FF'}`);
          styles.push('paint-order:stroke fill');
        }
      }
      if (refBgEnabled && allowBackground) {
        styles.push(`background:${backgroundColor || '#000000'}`);
        styles.push(`padding:${paddingValue}`);
        styles.push(referenceShadowEnabled ? 'box-shadow:0 10px 24px rgba(0,0,0,0.42);' : 'box-shadow:none;');
        styles.push(composeTextShadow(null));
      } else {
        styles.push('background:transparent');
        styles.push('padding:0');
        styles.push('box-shadow:none;');
        styles.push(composeTextShadow(referenceShadowEnabled ? '0 10px 24px rgba(0,0,0,0.65)' : null));
      }
      return `<span style="${styles.join(';')}">${text}</span>`;
    }

    function buildFullBibleSegment({ referenceLabel, verseHtml, refSize, refColor, refBgColor, verseAlign, refAlign, verseShadowStyle, refPosition, refTextTransform }) {
      const normalizedAlign = (['left', 'right', 'center'].includes(refAlign) ? refAlign : 'center');
      const containerAlign = (refAlign === 'justify') ? 'left' : normalizedAlign;
      const refBadge = buildReferenceBadgeSpan(referenceLabel, refSize, refColor, refBgColor, { textTransform: refTextTransform || fullRefTextTransform });
      const refHtml = `<div style="text-align:${containerAlign};margin:0 20px 20px;width:100%">${refBadge}</div>`;
      const extraSpacingStyle = verseAlign === 'justify'
        ? 'word-spacing:0;letter-spacing:0;text-justify:inter-word;'
        : '';
      const bodyHtml = `<div class="jo-body" style="text-align:${verseAlign};margin:0 20px;width:100%;${verseShadowStyle}${extraSpacingStyle}">${verseHtml}</div>`;
      const spacerHtml = '<div style="height:0.6em;width:100%"></div>';
      return (refPosition === 'bottom') ? (bodyHtml + spacerHtml + refHtml) : (refHtml + bodyHtml);
    }

    function buildLtBibleSegment({ referenceLabel, verseHtml, refSize, refColor, refBgColor, alignValue, verseShadowStyle, allowBackground, padding = '1px 6px', borderRadius = '5px', refTextTransform }) {
      const refBadge = buildReferenceBadgeSpan(
        referenceLabel,
        refSize,
        refColor,
        refBgColor,
        { allowBackground, padding, borderRadius, textTransform: refTextTransform || ltRefTextTransform }
      );
      return `<div class="jo-ref-line" style="margin-bottom:3px;width:100%;text-align:${alignValue}">${refBadge}</div>` +
             `<div class="jo-body" style="${verseShadowStyle}">${verseHtml}</div>`;
    }

    function isBibleContentActive() {
      return !!(currentItem && getIsBibleItem(currentItem));
    }
    
    function setEditorMode(m) {
      if (isBibleContentActive() && m === 'text') return;
      document.getElementById('lyric-editor').style.display = m === 'text' ? 'block' : 'none';
      document.getElementById('lyric-buttons').style.display = m === 'btn' ? 'block' : 'none';
      const translationPanel = document.getElementById('song-translation-panel');
      if (translationPanel) {
        const showTranslationPanel = m === 'text' && !!(currentItem && !getIsBibleItem(currentItem));
        translationPanel.style.display = showTranslationPanel ? 'flex' : 'none';
      }
      document.getElementById('mode-text').classList.toggle('active', m === 'text');
      document.getElementById('mode-btn').classList.toggle('active', m === 'btn');
      editorMode = m;
      refreshWorkspaceLayoutUi();
      saveToStorageDebounced();
    }
    
    function getScheduleEntryKey(entry) {
      if (!entry) return null;
      if (entry._metaKind === 'section') return null; // séparateur : ni projetable ni dé-dupliqué
      if (entry._metaKind === 'bible_verse') {
        return `bible:${entry.version || ''}:${entry.title || ''}:${entry.content || ''}`;
      }
      if (entry.id) {
        return `song:${entry.id}`;
      }
      if (entry.title && entry.content) {
        return `song:${entry.title}:${entry.content}`;
      }
      return null;
    }

    function insertIntoSchedule(entry, { successMessage = null, duplicateMessage = null } = {}) {
      if (!entry) return { inserted: false, movedToTop: false };
      if (entry._metaKind === 'bible_verse') {
        const hintLines = getScheduleLineHint(entry);
        if (hintLines != null) {
          entry.linesPerPage = hintLines;
        } else if (!Number.isFinite(entry.linesPerPage)) {
          entry.linesPerPage = linesPerPage;
        }
      }
      // Doublons AUTORISÉS (demandé) : on n'écarte plus une entrée identique — un même
      // chant/verset peut figurer plusieurs fois dans la setlist (ex. rappel du refrain plus
      // loin dans le programme). Les doublons sont simplement signalés par un insigne
      // « dupliqué » dans la liste (voir renderSongs). `duplicateMessage` n'est plus utilisé.
      void duplicateMessage;
      schedule.push(entry);
      if (sidebarTab === 'schedule') renderSongs();
      saveState();
      saveToStorageDebounced();
      if (successMessage) showToast(successMessage);
      return { inserted: true, movedToTop: false };
    }

    function addToSet(i, e) {
      e.stopPropagation();
      let list = (sidebarTab === 'songs') ? songs : (activeBibleVersion ? bibles[activeBibleVersion] : []);
      if (!list[i]) return;
      insertIntoSchedule({ ...list[i] }, {
        successMessage: 'Added to setlist',
        duplicateMessage: 'This entry already exists on the setlist; moved to the top'
      });
    }
    
    function removeFromSet(i, e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      const name = (schedule[i] && schedule[i].title) || t('delete_this_item');
      const doRemove = () => {
        schedule.splice(i, 1);
        saveState();
        saveToStorageDebounced();
        renderSongs();
        showToast(t('setlist_removed'));
      };
      if (typeof showConfirm === 'function') {
        showConfirm(t('setlist_remove_confirm_title'), t('setlist_remove_confirm_msg').replace('{name}', name), doRemove);
      } else {
        doRemove();
      }
    }
    
    function deleteItem(i, e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      // Name it in the confirm so the operator knows exactly what they're about to lose.
      let name = '';
      if (sidebarTab === 'songs') name = (songs[i] && songs[i].title) || '';
      else if (sidebarTab === 'bible' && activeBibleVersion) name = (bibles[activeBibleVersion][i] && bibles[activeBibleVersion][i].title) || '';

      const doDelete = () => {
        if (sidebarTab === 'songs') {
          const removed = songs.splice(i, 1)[0];
          if (removed && removed.id) idbDelete(STORE_SONGS, removed.id).catch(() => {});
        } else if (sidebarTab === 'bible' && activeBibleVersion) {
          bibles[activeBibleVersion].splice(i, 1);
          persistBibleVersion(activeBibleVersion).catch(() => {});
        }
        saveState();
        saveToStorageDebounced();
        renderSongs();
        updateButtonView();
        if (isLive) scheduleLiveUpdate();
        showToast(t('item_deleted'));
      };

      if (typeof showConfirm === 'function') {
        showConfirm(t('delete_confirm_title'), t('delete_confirm_msg').replace('{name}', name || t('delete_this_item')), doDelete);
      } else {
        doDelete();
      }
    }

    function normalizeSongTitleKey(title) {
      return String(title || '').trim().toLowerCase();
    }

    // In-place title editing for a saved song row: swap the title label for an input.
    // Enter (or blur) commits via renameSongTitle (which validates, dedupes, persists and
    // re-renders); Escape cancels. Guards against double-opening on the same row.
    function bspStartSongTitleEdit(rowEl, labelEl, songIndex) {
      const idx = Number(songIndex);
      if (!labelEl || !Number.isFinite(idx) || !songs[idx]) return;
      if (labelEl.querySelector('.song-item__rename-input')) return; // already editing

      const original = songs[idx].title || '';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'song-item__rename-input';
      input.value = original;
      input.spellcheck = false;
      input.style.cssText = 'width:100%;min-width:0;box-sizing:border-box;background:var(--bg-panel,#1c2330);' +
        'border:1px solid var(--accent,#0a84ff);border-radius:5px;color:var(--text,#e6edf3);' +
        'font:inherit;font-size:13px;padding:3px 6px;outline:none;';
      labelEl.textContent = '';
      labelEl.appendChild(input);
      input.focus();
      input.select();

      let done = false;
      const finish = (commit) => {
        if (done) return;
        done = true;
        const next = input.value;
        // renameSongTitle re-renders the whole list, replacing this row; when we cancel or
        // nothing changed, restore the label text without a full re-render.
        if (commit && next.trim() && next.trim() !== original) {
          renameSongTitle(idx, next);
        } else {
          if (labelEl.isConnected) labelEl.textContent = original;
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        e.stopPropagation(); // don't trigger row/panel shortcuts while typing
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    }

    function renameSongTitle(songIndex, nextTitleRaw) {
      const idx = Number(songIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= songs.length) return false;
      const song = songs[idx];
      if (!song) return false;
      const nextTitle = String(nextTitleRaw || '').trim();
      if (!nextTitle) {
        showToast(t('song_title_empty'));
        return false;
      }
      const currentKey = normalizeSongTitleKey(song.title);
      const nextKey = normalizeSongTitleKey(nextTitle);
      if (nextKey !== currentKey) {
        const exists = songs.some((s, i) => i !== idx && normalizeSongTitleKey(s?.title) === nextKey);
        if (exists) {
          showToast(t('song_title_exists'));
          return false;
        }
      }
      song.title = nextTitle;
      song.updatedAt = Date.now();
      song.searchableText = normalizeSearchText(`${song.title}\n${song.content || song.text || ''}`);
      idbPut(STORE_SONGS, buildSongRecord(song, { isNew: false })).catch(() => {});
      // Propager le renommage aux entrées de setlist de même id (sync 2 sens).
      bspSyncSongEditAcross(song);
      renderSongs();
      saveState();
      saveToStorageDebounced();
      showToast(t('song_title_renamed'));
      return true;
    }
    
    function prevSlide() {
      if (!currentItem) return;
      if (lineCursor > 0) {
        lineCursor--;
        updateButtonView();
        if (isLive && livePointer) {
          liveLineCursor = lineCursor;
          if (!pushLiveUpdate()) {
            projectLive(true);
          }
        }
        saveToStorageDebounced();
      }
    }
    
    function nextSlide() {
      if (!currentItem) return;
      const pages = getPagesFromItem(currentItem, getIsBibleItem(currentItem));
      if (lineCursor < pages.length - 1) {
        lineCursor++;
        updateButtonView();
        if (isLive && livePointer) {
          liveLineCursor = lineCursor;
          if (!pushLiveUpdate()) {
            projectLive(true);
          }
        }
        saveToStorageDebounced();
      }
    }
    
    function openModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      if (id === 'settingsModal') {
        populateLanguageSelect();
        setLanguage(currentLanguage, { silent: true });
        // Always open on Live (the base design) so the shared controls start from the base,
        // then populate the output selector with the current screens.
        if (typeof settingsTargetOutput !== 'undefined') settingsTargetOutput = '';
        if (typeof setSettingsTargetTab === 'function') {
            setSettingsTargetTab('bible', { silent: true });
        }
        if (typeof updateSettingsOutputSelect === 'function') updateSettingsOutputSelect();
        if (typeof bspRefreshAppVersion === 'function') bspRefreshAppVersion();
      } else if (id === 'newSongModal') {
        resetNewSongLookupState({ keepInputs: false });
        const titleInput = document.getElementById('new-song-title');
        if (titleInput) {
          setTimeout(() => {
            try { titleInput.focus(); } catch (_) {}
          }, 20);
        }
      } else if (id === 'autoLyricsModal') {
        bindAutoLyricsGlobalHandlers();
        renderAutoLyricsResults();
        updateAutoLyricsInputClearButtons();
        const hasSavedAutoLyricsSearch = !!((document.getElementById('auto-lyrics-title')?.value || '').trim() || autoLyricsResults.length);
        updateAutoLyricsStatus(
          hasSavedAutoLyricsSearch
            ? (autoLyricsResults.length
                ? t('auto_lyrics_found_results_click_add').replace('{count}', String(autoLyricsResults.length))
                : t('auto_lyrics_continue_last_search_or_new'))
            : t('auto_lyrics_prompt'),
          hasSavedAutoLyricsSearch && autoLyricsResults.length ? 'success' : 'muted'
        );
        const titleInput = document.getElementById('auto-lyrics-title');
        if (titleInput) {
          setTimeout(() => {
            try { titleInput.focus(); } catch (_) {}
          }, 20);
        }
      }
      modal.style.display = 'flex';
      if (id === 'autoLyricsModal') {
        requestAnimationFrame(() => {
          positionAutoLyricsModal();
        });
      }
      /* Close when clicking on the overlay backdrop (outside modal content) */
      modal._backdropHandler = modal._backdropHandler || function(e) {
        if (e.target === modal) closeModal(id);
      };
      modal.addEventListener('click', modal._backdropHandler);
      if (id === 'settingsModal') {
        modal._escHandler = modal._escHandler || function(e) {
          if (e.key === 'Escape') closeModal('settingsModal');
        };
        modal._outsideClickHandler = modal._outsideClickHandler || function(e) {
          if (modal.style.display !== 'flex') return;
          const content = modal.querySelector('.modal-content');
          if (!content) return;
          if (!(e.target instanceof Node)) return;
          if (!content.contains(e.target)) closeModal('settingsModal');
        };
        document.addEventListener('keydown', modal._escHandler);
        document.addEventListener('mousedown', modal._outsideClickHandler);
      }
    }
    
    function closeModal(id) {
      if (id === 'styleEditorModal') {
        try {
          flushStyleAutosave();
        } catch (e) {
          console.error('Style autosave failed on close', e);
        }
      }
      const modal = document.getElementById(id);
      if (modal) {
        modal.style.display = 'none';
        if (id === 'newSongModal') {
          resetNewSongLookupState({ keepInputs: false });
        }
        if (id === 'autoLyricsModal') {
          closeAutoLyricsContextMenu();
          hideAutoLyricsPreview();
        }
        if (id === 'settingsModal') {
          if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
          if (modal._outsideClickHandler) document.removeEventListener('mousedown', modal._outsideClickHandler);
        }
      }
    }

    function getNewSongLookupKey(title, artist) {
      return `${String(title || '').trim().toLowerCase()}::${String(artist || '').trim().toLowerCase()}`;
    }

    function updateNewSongFetchStatus(message, tone = 'muted') {
      const status = document.getElementById('new-song-fetch-status');
      if (!status) return;
      status.textContent = message || '';
      if (tone === 'success') status.style.color = 'var(--success)';
      else if (tone === 'error') status.style.color = 'var(--danger)';
      else status.style.color = 'var(--text-secondary)';
    }

    function setNewSongLookupBusy(busy) {
      newSongLookupBusy = !!busy;
      const btn = document.getElementById('new-song-fetch-btn');
      if (!btn) return;
      btn.disabled = newSongLookupBusy;
      btn.textContent = newSongLookupBusy ? t('common_searching') : t('new_song_search_lyrics');
    }

    function clearNewSongLookupResults() {
      newSongLookupResults = [];
      const host = document.getElementById('new-song-search-results');
      if (!host) return;
      host.innerHTML = '';
      host.style.display = 'none';
    }

    function renderNewSongLookupResults() {
      const host = document.getElementById('new-song-search-results');
      if (!host) return;
      host.innerHTML = '';
      if (!Array.isArray(newSongLookupResults) || !newSongLookupResults.length) {
        host.style.display = 'none';
        return;
      }
      host.style.display = 'block';
      newSongLookupResults.forEach((entry, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'width:100%;text-align:left;border:1px solid var(--border);background:rgba(255,255,255,0.02);color:var(--text);padding:8px 10px;border-radius:7px;margin:0 0 6px;cursor:pointer;';
        const track = entry.title || 'Untitled';
        const artist = entry.artist || 'Unknown artist';
        const album = entry.album || '';
        const source = entry.source || '';
        btn.innerHTML = `<div style="font-weight:600;font-size:12px">${esc(track)}</div><div style="font-size:11px;color:var(--text-secondary)">${esc(artist)}${album ? ' • ' + esc(album) : ''}${source ? ' • ' + esc(source) : ''}</div>`;
        btn.onclick = () => selectNewSongLookupResult(idx);
        host.appendChild(btn);
      });
    }

    function resetNewSongLookupState(opts = {}) {
      const keepInputs = !!opts.keepInputs;
      newSongFetchedLyrics = '';
      newSongFetchedLookupKey = '';
      clearNewSongLookupResults();
      setNewSongLookupBusy(false);
      updateNewSongFetchStatus(t('new_song_no_lyrics_fetched'), 'muted');
      if (!keepInputs) {
        const titleInput = document.getElementById('new-song-title');
        const artistInput = document.getElementById('new-song-artist');
        if (titleInput) titleInput.value = '';
        if (artistInput) artistInput.value = '';
      }
    }

    function handleNewSongLookupInputChange() {
      const titleInput = document.getElementById('new-song-title');
      const artistInput = document.getElementById('new-song-artist');
      const key = getNewSongLookupKey(titleInput?.value || '', artistInput?.value || '');
      if (key && key === newSongFetchedLookupKey && newSongFetchedLyrics) {
        updateNewSongFetchStatus(t('new_song_lyrics_ready'), 'success');
        return;
      }
      clearNewSongLookupResults();
      if (newSongFetchedLookupKey) {
        updateNewSongFetchStatus(t('new_song_lyrics_not_fetched_current'), 'muted');
      } else {
        updateNewSongFetchStatus(t('new_song_no_lyrics_fetched'), 'muted');
      }
    }

    function extractLyricsFromLookupPayload(payload) {
      if (!payload) return '';
      if (typeof payload === 'string') return inferSectionedLyricsFromText(payload);
      const candidates = [
        payload.plainLyrics, payload.plain_lyrics, payload.lyrics, payload.text,
        payload.syncedLyrics, payload.synced_lyrics
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return inferSectionedLyricsFromText(c);
      }
      if (Array.isArray(payload)) {
        for (const item of payload) {
          const v = extractLyricsFromLookupPayload(item);
          if (v) return v;
        }
      }
      return '';
    }

    function normalizeLyricsSearchResultEntry(entry) {
      if (!entry || typeof entry !== 'object') return null;
      const title = String(entry.trackName || entry.track_name || entry.title || entry.name || '').trim();
      const artist = String(entry.artistName || entry.artist_name || entry.artist || '').trim();
      const album = String(entry.albumName || entry.album_name || entry.album || '').trim();
      const source = String(entry.sourceName || entry.source || 'LRCLIB').trim();
      const lyrics = extractLyricsFromLookupPayload(entry);
      if (!lyrics || !title) return null;
      return { title, artist, album, source, lyrics };
    }

    function dedupeLyricsSearchResults(results) {
      const seen = new Set();
      const out = [];
      (Array.isArray(results) ? results : []).forEach((entry) => {
        const n = normalizeLyricsSearchResultEntry(entry);
        if (!n) return;
        const key = `${n.title.toLowerCase()}::${n.artist.toLowerCase()}::${n.lyrics.slice(0, 160)}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(n);
      });
      return out;
    }

    async function searchLyricsCatalog(title, artist) {
      const cleanTitle = String(title || '').trim();
      const cleanArtist = String(artist || '').trim();
      if (!cleanTitle && !cleanArtist) throw new Error('Title or artist required');

      const timeoutMs = 12000;
      const doFetchJson = async (url) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          const res = await fetch(url, { signal: ctl.signal });
          if (!res.ok) return null;
          return await res.json();
        } finally {
          clearTimeout(t);
        }
      };

      const lookupTerms = [];
      if (cleanTitle && cleanArtist) lookupTerms.push(`${cleanTitle} ${cleanArtist}`);
      if (cleanTitle) lookupTerms.push(cleanTitle);
      if (cleanArtist) lookupTerms.push(cleanArtist);
      const lookupUrls = Array.from(new Set(lookupTerms.map(term => `https://lrclib.net/api/search?q=${encodeURIComponent(term)}`)));

      const collected = [];
      for (const url of lookupUrls) {
        const payload = await doFetchJson(url).catch(() => null);
        if (!payload) continue;
        if (Array.isArray(payload)) collected.push(...payload);
        else if (payload && typeof payload === 'object') collected.push(payload);
      }
      return dedupeLyricsSearchResults(collected);
    }

    function selectNewSongLookupResult(index) {
      const i = Number(index);
      if (!Number.isFinite(i) || i < 0 || i >= newSongLookupResults.length) return;
      const picked = newSongLookupResults[i];
      const lyrics = picked && picked.lyrics ? picked.lyrics : extractLyricsFromLookupPayload(picked);
      if (!lyrics) {
        updateNewSongFetchStatus(t('new_song_selected_result_no_lyrics'), 'error');
        showToast(t('new_song_selected_result_no_lyrics'));
        return;
      }
      const titleInput = document.getElementById('new-song-title');
      const artistInput = document.getElementById('new-song-artist');
      const pickedTitle = (picked.title || '').trim();
      const pickedArtist = (picked.artist || '').trim();
      if (titleInput && pickedTitle) titleInput.value = pickedTitle;
      if (artistInput && pickedArtist) artistInput.value = pickedArtist;
      newSongFetchedLyrics = lyrics;
      newSongFetchedLookupKey = getNewSongLookupKey(titleInput?.value || '', artistInput?.value || '');
      updateNewSongFetchStatus(t('new_song_lyrics_ready_selected'), 'success');
      showToast(t('new_song_lyrics_selected'));
      clearNewSongLookupResults();
    }

    async function autoFetchNewSongLyrics() {
      if (newSongLookupBusy) return;
      const titleInput = document.getElementById('new-song-title');
      const artistInput = document.getElementById('new-song-artist');
      const title = (titleInput?.value || '').trim();
      const artist = (artistInput?.value || '').trim();
      if (!title && !artist) {
        showToast(t('auto_lyrics_enter_title_or_artist_first'));
        updateNewSongFetchStatus(t('auto_lyrics_enter_title_or_artist_first'), 'error');
        return;
      }
      setNewSongLookupBusy(true);
      updateNewSongFetchStatus(t('new_song_searching_matches'), 'muted');
      clearNewSongLookupResults();
      try {
        const results = await searchLyricsCatalog(title, artist);
        if (!Array.isArray(results) || !results.length) {
          newSongFetchedLyrics = '';
          newSongFetchedLookupKey = '';
          updateNewSongFetchStatus(t('new_song_no_matching_lyrics_found'), 'error');
          showToast(t('auto_lyrics_no_results_found'));
          return;
        }
        newSongLookupResults = results.slice(0, 40);
        if (!newSongLookupResults.length) {
          updateNewSongFetchStatus(t('new_song_matches_found_no_lyrics'), 'error');
          showToast(t('new_song_no_lyrics_in_results'));
          return;
        }
        renderNewSongLookupResults();
        updateNewSongFetchStatus(t('new_song_found_results_choose_one').replace('{count}', String(newSongLookupResults.length)), 'muted');
        showToast(t('new_song_choose_result'));
      } catch (e) {
        console.error('Lyrics fetch failed', e);
        updateNewSongFetchStatus(t('common_search_failed'), 'error');
        showToast(t('new_song_lyrics_search_failed'));
      } finally {
        setNewSongLookupBusy(false);
      }
    }

    function updateAutoLyricsStatus(message, tone = 'muted') {
      const el = document.getElementById('auto-lyrics-status');
      if (!el) return;
      el.textContent = message || '';
      if (tone === 'success') el.style.color = 'var(--success)';
      else if (tone === 'error') el.style.color = 'var(--danger)';
      else el.style.color = 'var(--text-secondary)';
    }

    function setAutoLyricsLookupBusy(busy) {
      autoLyricsLookupBusy = !!busy;
      const btn = document.getElementById('auto-lyrics-search-btn');
      if (!btn) return;
      btn.disabled = autoLyricsLookupBusy;
      btn.textContent = autoLyricsLookupBusy ? t('common_searching') : t('common_search');
    }

    function updateAutoLyricsInputClearButtons() {
      const titleInput = document.getElementById('auto-lyrics-title');
      const artistInput = document.getElementById('auto-lyrics-artist');
      const titleClear = document.getElementById('auto-lyrics-title-clear');
      const artistClear = document.getElementById('auto-lyrics-artist-clear');
      if (titleClear) titleClear.style.display = (titleInput && titleInput.value) ? 'flex' : 'none';
      if (artistClear) artistClear.style.display = (artistInput && artistInput.value) ? 'flex' : 'none';
    }

    function clearAutoLyricsField(kind) {
      const input = document.getElementById(kind === 'artist' ? 'auto-lyrics-artist' : 'auto-lyrics-title');
      if (!input) return;
      input.value = '';
      updateAutoLyricsInputClearButtons();
      try { input.focus(); } catch (_) {}
    }

    function closeAutoLyricsContextMenu() {
      const menu = document.getElementById('auto-lyrics-context-menu');
      if (!menu) return;
      menu.style.display = 'none';
      menu.innerHTML = '';
      autoLyricsContextEntry = null;
    }

    function hideAutoLyricsPreview() {
      const preview = document.getElementById('auto-lyrics-preview');
      if (!preview) return;
      preview.style.display = 'none';
      preview.textContent = '';
    }

    function bindAutoLyricsGlobalHandlers() {
      if (autoLyricsUiBound) return;
      autoLyricsUiBound = true;
      document.addEventListener('mousedown', (e) => {
        const menu = document.getElementById('auto-lyrics-context-menu');
        if (!menu || menu.style.display !== 'block') return;
        const t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
        if (t && typeof t.closest === 'function' && t.closest('#auto-lyrics-context-menu')) return;
        closeAutoLyricsContextMenu();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeAutoLyricsContextMenu();
          hideAutoLyricsPreview();
        }
      });
      window.addEventListener('scroll', () => {
        closeAutoLyricsContextMenu();
        hideAutoLyricsPreview();
        positionAutoLyricsModal();
      }, true);
      window.addEventListener('resize', () => {
        closeAutoLyricsContextMenu();
        hideAutoLyricsPreview();
        positionAutoLyricsModal();
      });
    }

    function showAutoLyricsPreview(entry, clientX, clientY) {
      const preview = document.getElementById('auto-lyrics-preview');
      if (!preview || !entry) return;
      const title = entry.title || 'Untitled';
      const artist = entry.artist || t('common_unknown_artist');
      const body = String(entry.lyrics || '').trim().split('\n').slice(0, 24).join('\n');
      preview.textContent = `${title}${artist ? ' — ' + artist : ''}\n\n${body}`;
      preview.style.display = 'block';
      const pad = 12;
      const w = preview.offsetWidth || 360;
      const h = preview.offsetHeight || 260;
      let left = (clientX || 0) + 14;
      let top = (clientY || 0) + 14;
      if (left + w > window.innerWidth - pad) left = Math.max(pad, (clientX || 0) - w - 12);
      if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad);
      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
    }

    function normalizeSongTitleKeyForInsert(title) {
      return String(title || '').trim().toLowerCase();
    }

    function buildUniqueSongTitle(baseTitle) {
      const base = String(baseTitle || '').trim() || 'Untitled';
      const used = new Set(songs.map(s => normalizeSongTitleKeyForInsert(s && s.title)));
      if (!used.has(normalizeSongTitleKeyForInsert(base))) return base;
      let n = 2;
      while (n < 1000) {
        const candidate = `${base} (${n})`;
        if (!used.has(normalizeSongTitleKeyForInsert(candidate))) return candidate;
        n += 1;
      }
      return `${base} (${Date.now()})`;
    }

    function addAutoLyricsResultToSongs(entry, opts = {}) {
      if (!entry || !entry.lyrics) return null;
      const openEditor = opts.openEditor !== false;
      const closeModalAfter = !!opts.closeModal;
      const title = buildUniqueSongTitle(entry.title || 'Untitled');
      const content = String(entry.lyrics || '').trim();
      const newSong = {
        id: createId('song', title),
        title,
        content,
        text: content,
        translatedLyrics: '',
        translationLanguage: getSongBilingualSettings().targetLanguage,
        translationStatus: 'idle',
        translationLocked: false,
        translatedAt: 0,
        translationHash: computeTranslationHash(content, getSongBilingualSettings().targetLanguage),
        searchableText: normalizeSearchText(`${title}\n${content}`),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      songs.push(newSong);
      idbPut(STORE_SONGS, buildSongRecord(newSong, { isNew: true })).catch(() => {});
      maybeTranslateImportedSong(newSong);
      saveState();
      saveToStorageDebounced();
      if (openEditor) {
        setSidebarTab('songs');
        const searchInput = document.getElementById('song-search');
        if (searchInput) searchInput.value = '';
        setSearchValueForTab('songs', '');
        selectItem(songs.length - 1);
        setEditorMode('text');
        document.getElementById('lyric-editor')?.focus();
        requestAnimationFrame(() => {
          focusActiveSongInSidebar();
        });
      } else {
        renderSongs();
      }
      if (closeModalAfter) closeModal('autoLyricsModal');
      showToast(openEditor ? t('auto_lyrics_added_and_opened') : t('auto_lyrics_added_to_songs'));
      return newSong;
    }

    function openAutoLyricsResultContextMenu(entry, x, y) {
      const menu = document.getElementById('auto-lyrics-context-menu');
      if (!menu || !entry) return;
      autoLyricsContextEntry = entry;
      menu.innerHTML = '';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'sl-ctx-item';
      addBtn.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;border:none;color:var(--text);padding:8px 10px;border-radius:6px;cursor:pointer;';
      addBtn.textContent = t('auto_lyrics_add_to_songs');
      addBtn.onclick = () => {
        if (autoLyricsContextEntry) addAutoLyricsResultToSongs(autoLyricsContextEntry, { openEditor: false, closeModal: false });
        closeAutoLyricsContextMenu();
      };
      menu.appendChild(addBtn);
      menu.style.display = 'block';
      const rect = menu.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 8;
      const maxY = window.innerHeight - rect.height - 8;
      menu.style.left = `${Math.max(4, Math.min(x, maxX))}px`;
      menu.style.top = `${Math.max(4, Math.min(y, maxY))}px`;
    }

    function renderAutoLyricsResults() {
      const host = document.getElementById('auto-lyrics-results');
      if (!host) return;
      host.innerHTML = '';
      if (!autoLyricsResults.length) {
        host.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:10px">${esc(t('auto_lyrics_no_results_yet'))}</div>`;
        requestAnimationFrame(() => {
          positionAutoLyricsModal();
        });
        return;
      }
      const frag = document.createDocumentFragment();
      autoLyricsResults.forEach((entry) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.style.cssText = 'display:block;width:100%;text-align:left;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin:0 0 8px;color:var(--text);cursor:pointer;';
        const meta = `${entry.artist || 'Unknown artist'}${entry.album ? ' • ' + entry.album : ''}${entry.source ? ' • ' + entry.source : ''}`;
        row.innerHTML = `<div style="font-size:12px;font-weight:700">${esc(entry.title)}</div><div style="font-size:11px;color:var(--text-secondary)">${esc(meta)}</div>`;
        row.onclick = () => {
          addAutoLyricsResultToSongs(entry, { openEditor: true, closeModal: false });
        };
        row.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openAutoLyricsResultContextMenu(entry, e.clientX, e.clientY);
        };
        row.onmouseenter = (e) => showAutoLyricsPreview(entry, e.clientX, e.clientY);
        row.onmousemove = (e) => showAutoLyricsPreview(entry, e.clientX, e.clientY);
        row.onmouseleave = () => hideAutoLyricsPreview();
        frag.appendChild(row);
      });
      host.appendChild(frag);
      requestAnimationFrame(() => {
        positionAutoLyricsModal();
      });
    }

    function resetAutoLyricsState(opts = {}) {
      bindAutoLyricsGlobalHandlers();
      const keepInputs = !!opts.keepInputs;
      autoLyricsResults = [];
      setAutoLyricsLookupBusy(false);
      updateAutoLyricsStatus(t('auto_lyrics_prompt'), 'muted');
      closeAutoLyricsContextMenu();
      hideAutoLyricsPreview();
      renderAutoLyricsResults();
      if (!keepInputs) {
        const title = document.getElementById('auto-lyrics-title');
        const artist = document.getElementById('auto-lyrics-artist');
        if (title) title.value = '';
        if (artist) artist.value = '';
      }
      updateAutoLyricsInputClearButtons();
    }

    async function searchAutoLyrics() {
      if (autoLyricsLookupBusy) return;
      const title = (document.getElementById('auto-lyrics-title')?.value || '').trim();
      const artist = (document.getElementById('auto-lyrics-artist')?.value || '').trim();
      if (!title && !artist) {
        updateAutoLyricsStatus(t('auto_lyrics_enter_title_or_artist_first'), 'error');
        showToast(t('auto_lyrics_enter_title_or_artist_first'));
        return;
      }
      setAutoLyricsLookupBusy(true);
      updateAutoLyricsStatus(t('common_searching'), 'muted');
      closeAutoLyricsContextMenu();
      hideAutoLyricsPreview();
      try {
        const results = await searchLyricsCatalog(title, artist);
        autoLyricsResults = Array.isArray(results) ? results.slice(0, 40) : [];
        renderAutoLyricsResults();
        if (!autoLyricsResults.length) {
          updateAutoLyricsStatus(t('auto_lyrics_no_results_found'), 'error');
          showToast(t('auto_lyrics_no_results_found'));
          return;
        }
        updateAutoLyricsStatus(t('auto_lyrics_found_results_click_add').replace('{count}', String(autoLyricsResults.length)), 'success');
      } catch (e) {
        console.error('Auto lyrics search failed', e);
        autoLyricsResults = [];
        renderAutoLyricsResults();
        updateAutoLyricsStatus(t('common_search_failed'), 'error');
        showToast(t('auto_lyrics_search_failed'));
      } finally {
        setAutoLyricsLookupBusy(false);
      }
    }
    
    function updateSidebarToggleTooltip() {
      const s = document.getElementById('sidebar');
      if (!s) return;
      if (isSidebarDockedLayoutActive()) {
        const title = s.classList.contains('sidebar-open') ? 'close sidebar' : 'open sidebar';
        const topBtn = document.getElementById('sidebar-toggle-btn');
        const leftBtn = document.getElementById('ab-sidebar-toggle');
        const footerBtn = document.getElementById('footer-sidebar-btn');
        if (topBtn) topBtn.title = title;
        if (leftBtn) leftBtn.title = title;
        if (footerBtn) footerBtn.title = title;
        return;
      }
      const isOpen = s.classList.contains('sidebar-open');
      const title = isOpen ? 'close sidebar' : 'open sidebar';
      const topBtn = document.getElementById('sidebar-toggle-btn');
      const leftBtn = document.getElementById('ab-sidebar-toggle');
      const footerBtn = document.getElementById('footer-sidebar-btn');
      if (topBtn) topBtn.title = title;
      if (leftBtn) leftBtn.title = title;
      if (footerBtn) footerBtn.title = title;
    }

    function normalizeSidebarLayout(layout) {
      return layout === 'layout2' ? 'layout2' : 'layout1';
    }

    function normalizeWorkspaceLayoutMode(mode) {
      return mode === 'focused' ? 'focused' : 'classic';
    }

    function isFocusedWorkspaceMode() {
      return normalizeWorkspaceLayoutMode(workspaceLayoutMode) === 'focused';
    }

    function renderFocusedMainPanel() {
      const panel = document.getElementById('focused-main-panel');
      if (!panel) return;
      if (!isFocusedWorkspaceMode() || sidebarTab !== 'schedule') {
        panel.innerHTML = '';
        panel.setAttribute('aria-hidden', 'true');
        return;
      }
      panel.setAttribute('aria-hidden', 'false');
      const activeScheduleIndex = (sidebarTab === 'schedule' && buttonContextTab === 'schedule') ? currentIndex : -1;
      const entries = Array.isArray(schedule) ? schedule : [];
      const itemsHtml = entries.length ? entries.map((entry, idx) => {
        const isActive = idx === activeScheduleIndex;
        const previewSource = String(entry?.content || entry?.text || '').replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
        const preview = esc(previewSource || (entry?.title || 'Untitled'));
        const title = esc(entry?.title || `Item ${idx + 1}`);
        return `
          <div class="focused-main-item${isActive ? ' active' : ''}" data-focused-schedule-index="${idx}">
            <div class="focused-main-item-copy">
              <div class="focused-main-item-title">${title}</div>
              <div class="focused-main-item-preview">${preview}</div>
            </div>
            <div class="focused-main-item-actions">
              <button type="button" class="btn focused-main-mini-btn" data-focused-action="live" data-focused-schedule-index="${idx}">Live</button>
            </div>
          </div>
        `;
      }).join('') : `<div class="focused-main-empty">Setlist is empty. Add songs or Bible verses from the sidebar and they will appear here.</div>`;

      panel.innerHTML = `
        <div class="focused-main-shell">
          <div class="focused-main-header">
            <div class="focused-main-title">Setlist Workspace</div>
            <div class="focused-main-subtitle">${entries.length} item${entries.length === 1 ? '' : 's'}</div>
          </div>
          <div class="focused-main-list">${itemsHtml}</div>
        </div>
      `;
    }

    function handleFocusedSchedulePanelAction(action, idx) {
      const index = Number(idx);
      if (!Number.isFinite(index) || index < 0 || index >= schedule.length) return;
      const entry = schedule[index];
      if (!entry) return;
      if (action === 'select') {
        scheduleReturnTarget = buildScheduleRestoreTarget(entry);
        buttonContextTab = 'schedule';
        selectItem(index);
        const setlistBehavior = (typeof getSetlistSettingsSnapshot === 'function')
          ? getSetlistSettingsSnapshot()
          : DEFAULT_SETLIST_SETTINGS;
        if (setlistBehavior.autoGoLiveOnSelect) {
          projectLive(true);
        }
        return;
      }
      if (action === 'live') {
        scheduleReturnTarget = buildScheduleRestoreTarget(entry);
        buttonContextTab = 'schedule';
        selectItem(index);
        projectLive(true);
        return;
      }
      if (action === 'remove') {
        schedule.splice(index, 1);
        saveState();
        saveToStorageDebounced();
        renderSongs();
        showToast('Removed from setlist');
        return;
      }
      if (action === 'up' && index > 0) {
        const moved = schedule.splice(index, 1)[0];
        schedule.splice(index - 1, 0, moved);
        saveState();
        saveToStorageDebounced();
        renderSongs();
        return;
      }
      if (action === 'down' && index < schedule.length - 1) {
        const moved = schedule.splice(index, 1)[0];
        schedule.splice(index + 1, 0, moved);
        saveState();
        saveToStorageDebounced();
        renderSongs();
      }
    }

    function refreshWorkspaceLayoutUi() {
      const mode = normalizeWorkspaceLayoutMode(workspaceLayoutMode);
      const body = document.body;
      if (body) {
        body.classList.toggle('workspace-layout-focused', mode === 'focused');
        body.dataset.workspaceLayoutMode = mode;
        body.dataset.sidebarTab = sidebarTab || 'bible';
      }
      const editorContainer = document.getElementById('editor-container');
      const focusedPanel = document.getElementById('focused-main-panel');
      // The Setlist workspace now shows the selected item's line-by-line breakdown (the
      // same editor the Songs tab uses) instead of repeating the sidebar's titles, so the
      // editor stays visible on every tab and the titles-only panel is retired.
      if (editorContainer) editorContainer.style.display = 'flex';
      if (focusedPanel) focusedPanel.style.display = 'none';
      if (mode === 'focused' && sidebarTab !== 'songs' && editorMode !== 'btn') {
        setEditorMode('btn');
      }
      updateFocusedWorkspaceToolbar();
      updateFocusedEditorBanner();
      renderFocusedMainPanel();
    }

    function applyWorkspaceLayoutMode(mode, opts = {}) {
      workspaceLayoutMode = normalizeWorkspaceLayoutMode(mode);
      if (workspaceLayoutMode === 'focused') {
        saveFocusedWorkspaceControlsForTab(sidebarTab);
      }
      const select = document.getElementById('workspace-layout-mode-select');
      if (select && select.value !== workspaceLayoutMode) select.value = workspaceLayoutMode;
      refreshWorkspaceLayoutUi();
      if (opts.persist === false) return;
      saveToStorageDebounced();
    }

    function handleWorkspaceLayoutModeChange() {
      const select = document.getElementById('workspace-layout-mode-select');
      applyWorkspaceLayoutMode(select ? select.value : 'classic', { persist: true });
    }

    function updateFocusedWorkspaceToolbar() {
      const addBtn = document.querySelector('.header-toolbar > .add-btn');
      const modeSwitch = document.querySelector('.toolbar-mode-switch');
      const importBtn = document.getElementById('btn-import');
      const bibleToolWrap = document.querySelector('.bible-tool-wrap');
      const annotateWrap = document.querySelector('.annotate-wrap');
      const presetBtn = document.getElementById('btn-preset');
      const focused = isFocusedWorkspaceMode();
      const isSongsTab = sidebarTab === 'songs';
      const isBibleTab = sidebarTab === 'bible';
      const isScheduleTab = sidebarTab === 'schedule';

      if (addBtn) addBtn.style.display = (!focused || isSongsTab) ? '' : 'none';
      if (modeSwitch) modeSwitch.style.display = (!focused || !isScheduleTab) ? '' : 'none';
      if (importBtn) importBtn.style.display = (!focused || isSongsTab) ? '' : 'none';
      if (bibleToolWrap) bibleToolWrap.style.display = (!focused || isBibleTab) ? '' : 'none';
      if (annotateWrap) annotateWrap.style.display = (!focused || isSongsTab || isBibleTab) ? '' : 'none';
      if (presetBtn) presetBtn.style.display = (!focused || !isScheduleTab) ? '' : 'none';
    }

    function updateFocusedEditorBanner() {
      const titleEl = document.getElementById('focused-editor-banner-title');
      const subtitleEl = document.getElementById('focused-editor-banner-subtitle');
      const sectionNavEl = document.getElementById('focused-editor-section-nav');
      if (!titleEl || !subtitleEl || !sectionNavEl) return;
      const renderSectionNav = (items = []) => {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
          sectionNavEl.innerHTML = '';
          sectionNavEl.classList.remove('has-items');
          return;
        }
        sectionNavEl.innerHTML = list.map((item) => {
          const safeLabel = esc(String(item.label || 'Section'));
          const safeTag = esc(String(item.tag || ''));
          return `<button type="button" class="focused-section-chip" data-section-tag="${safeTag}" onclick="jumpToFocusedSongSection(this.dataset.sectionTag)">${safeLabel}</button>`;
        }).join('');
        sectionNavEl.classList.add('has-items');
      };
      if (!isFocusedWorkspaceMode()) {
        titleEl.textContent = 'Workspace';
        subtitleEl.textContent = '';
        renderSectionNav([]);
        return;
      }
      if (sidebarTab === 'songs') {
        titleEl.textContent = 'Songs Workspace';
        subtitleEl.textContent = currentItem && !getIsBibleItem(currentItem)
          ? (currentItem.title || 'Untitled song')
          : 'Select a song from the sidebar';
        if (currentItem && !getIsBibleItem(currentItem)) {
          const pages = getPagesFromItem(currentItem, false);
          const seen = new Set();
          const sectionItems = [];
          const getSectionLabel = (tag) => {
            const trimmed = String(tag || '').trim();
            if (!trimmed) return '';
            const match = trimmed.match(/^(verse|chorus|bridge|refrain|pre[-\s]?chorus|intro|outro|tag|hook)\b/i);
            if (!match) return trimmed;
            const base = match[1].replace(/^pre[-\s]?chorus$/i, 'Pre-Chorus');
            return base
              .split(/[\s-]+/)
              .map(part => part ? (part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()) : '')
              .join(base.includes('-') ? '-' : ' ');
          };
          pages.forEach((page) => {
            const tag = String(page?.tag || '').trim();
            const label = getSectionLabel(tag);
            const key = label.toLowerCase();
            if (!label || seen.has(key)) return;
            seen.add(key);
            sectionItems.push({ label, tag });
          });
          renderSectionNav(sectionItems.filter(item => item.label && item.label.toLowerCase() !== 'lyrics'));
        } else {
          renderSectionNav([]);
        }
        return;
      }
      if (sidebarTab === 'bible') {
        titleEl.textContent = 'Bible Workspace';
        subtitleEl.textContent = currentItem && getIsBibleItem(currentItem)
          ? `${currentItem.title || 'Bible'}${currentItem.version ? ` • ${currentItem.version}` : ''}`
          : 'Select a Bible chapter or search a reference';
        renderSectionNav([]);
        return;
      }
      if (sidebarTab === 'schedule') {
        titleEl.textContent = 'Setlist Workspace';
        subtitleEl.textContent = `${Array.isArray(schedule) ? schedule.length : 0} item${Array.isArray(schedule) && schedule.length === 1 ? '' : 's'}`;
        renderSectionNav([]);
        return;
      }
      titleEl.textContent = 'Workspace';
      subtitleEl.textContent = '';
      renderSectionNav([]);
    }

    function jumpToFocusedSongSection(tag) {
      if (sidebarTab !== 'songs' || !currentItem || getIsBibleItem(currentItem)) return;
      const targetTag = String(tag || '').trim();
      if (!targetTag) return;
      const container = document.getElementById('lyric-buttons');
      if (!container) return;
      const blocks = Array.from(container.querySelectorAll('.section-block'));
      const block = blocks.find((el) => {
        const label = el.querySelector('.section-label');
        return String(label?.textContent || '').trim() === targetTag;
      });
      if (!block) return;
      block.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function setupFocusedMainPanelEvents() {
      const panel = document.getElementById('focused-main-panel');
      if (!panel || panel.dataset.bound === '1') return;
      panel.dataset.bound = '1';
      panel.addEventListener('click', (event) => {
        const actionBtn = event.target.closest('[data-focused-action]');
        if (actionBtn) {
          event.stopPropagation();
          handleFocusedSchedulePanelAction(actionBtn.dataset.focusedAction, actionBtn.dataset.focusedScheduleIndex);
          return;
        }
        const row = event.target.closest('[data-focused-schedule-index]');
        if (row) {
          handleFocusedSchedulePanelAction('select', row.dataset.focusedScheduleIndex);
        }
      });
      panel.addEventListener('dblclick', (event) => {
        const row = event.target.closest('[data-focused-schedule-index]');
        if (!row) return;
        handleFocusedSchedulePanelAction('live', row.dataset.focusedScheduleIndex);
      });
    }

    function shouldUseDockedSidebarLayout() {
      if (sidebarLayoutMode !== 'layout2') return false;
      const sidebar = document.getElementById('sidebar');
      const host = document.getElementById('left-workspace');
      if (!sidebar || !host) return false;
      const hostWidth = host.clientWidth || host.offsetWidth || 0;
      if (!hostWidth) return false;
      const savedWidth = parseFloat(sidebar.style.width || '');
      const cssWidth = parseFloat(getComputedStyle(sidebar).width || '');
      const sidebarWidth = Math.max(150, Number.isFinite(savedWidth) ? savedWidth : 0, Number.isFinite(cssWidth) ? cssWidth : 200);
      const mainMinWidth = 300;
      const spacer = 10;
      return hostWidth >= (sidebarWidth + mainMinWidth + spacer);
    }

    function isSidebarDockedLayoutActive() {
      return document.body.classList.contains('sidebar-layout-docked-active');
    }

    function syncSidebarLayoutModeForViewport() {
      const shouldDock = shouldUseDockedSidebarLayout();
      document.body.classList.toggle('sidebar-layout-docked-active', shouldDock);
      if (sidebarLayoutMode !== 'layout2') return;
      const sidebar = document.getElementById('sidebar');
      if (shouldDock) {
        if (sidebar) {
          let shouldOpen = true;
          try {
            const savedOpen = localStorage.getItem('sidebarOpen');
            if (savedOpen === '0') shouldOpen = false;
          } catch (_) {}
          sidebar.classList.toggle('sidebar-open', shouldOpen);
          sidebar.style.left = '';
          sidebar.style.top = '';
          sidebar.style.height = '';
          sidebar.style.maxWidth = '';
          try {
            const saved = localStorage.getItem('sidebarWidth');
            if (saved) {
              sidebar.style.width = saved;
              sidebar.style.minWidth = saved;
            }
          } catch (_) {}
        }
      } else {
        setSidebarPopupOpen(false);
      }
      updateSidebarToggleTooltip();
      positionSidebarQuickActions();
    }

    function applySidebarLayoutMode(layout, opts = {}) {
      const persist = opts.persist !== false;
      sidebarLayoutMode = normalizeSidebarLayout(layout);
      const select = document.getElementById('sidebar-layout-select');
      if (select && select.value !== sidebarLayoutMode) select.value = sidebarLayoutMode;
      syncSidebarLayoutModeForViewport();
      if (persist) {
        saveState();
        saveToStorageDebounced();
      }
    }

    function handleSidebarLayoutChange() {
      const select = document.getElementById('sidebar-layout-select');
      applySidebarLayoutMode(select ? select.value : 'layout2', { persist: true });
    }

    function positionSidebarPopup() {
      const sidebar = document.getElementById('sidebar');
      const host = document.getElementById('left-workspace');
      const activityBar = document.getElementById('activity-bar');
      const topbar = document.getElementById('app-topbar');
      if (!sidebar) return;
      if (isSidebarDockedLayoutActive()) {
        sidebar.style.left = '';
        sidebar.style.top = '';
        sidebar.style.height = '';
        sidebar.style.maxWidth = '';
        positionSidebarQuickActions();
        return;
      }
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        sidebar.style.left = '';
        sidebar.style.top = '';
        sidebar.style.height = '';
        sidebar.style.width = '';
        positionSidebarQuickActions();
        return;
      }

      const activityRect = activityBar ? activityBar.getBoundingClientRect() : null;
      const hostRect = host ? host.getBoundingClientRect() : null;
      const headerRect = topbar ? topbar.getBoundingClientRect() : null;

      // always place the popup below the app header; activity bar normally
      // starts immediately under the header but in some edge cases (tiny
      // panels, scroll, obs-isolated mode) the computed top may collapse to 0
      // which would push the sidebar up into the title bar. using the header
      // bottom keeps it pinned correctly.
      const top = headerRect
        ? headerRect.bottom
        : (activityRect ? activityRect.top : (hostRect ? hostRect.top : 0));

      // width offset is controlled by activity bar width – use its right edge if
      // available, otherwise fall back to the workspace left.
      const left = activityRect
        ? activityRect.right
        : (hostRect ? hostRect.left : 0);

      // height should extend to the bottom of the window from the top offset.
      const height = Math.max(1, window.innerHeight - top);

      sidebar.style.left = Math.round(left) + 'px';
      sidebar.style.top = Math.round(top) + 'px';
      sidebar.style.height = Math.round(height) + 'px';
      sidebar.style.width = '200px';
      sidebar.style.minWidth = '200px';
      sidebar.style.maxWidth = '200px';
      positionSidebarQuickActions();
    }

    function setSidebarPopupOpen(open) {
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebar-popup-backdrop');
      if (!sidebar) return;
      if (isSidebarDockedLayoutActive()) {
        const shouldOpen = !!open;
        sidebar.classList.toggle('sidebar-open', shouldOpen);
        if (backdrop) backdrop.classList.remove('open');
        try { localStorage.setItem('sidebarOpen', shouldOpen ? '1' : '0'); } catch (e) {}
        updateSidebarToggleTooltip();
        positionSidebarQuickActions();
        return;
      }
      const shouldOpen = !!open;
      positionSidebarPopup();
      sidebar.classList.toggle('sidebar-open', shouldOpen);
      if (backdrop) backdrop.classList.remove('open');
      try { localStorage.setItem('sidebarOpen', shouldOpen ? '1' : '0'); } catch (e) {}
      updateSidebarToggleTooltip();
      positionSidebarQuickActions();
    }

    function closeSidebarPopup() {
      setSidebarPopupOpen(false);
    }

    function toggleSidebar() {
      const s = document.getElementById('sidebar');
      if (!s) return;
      if (isSidebarDockedLayoutActive()) {
        setSidebarPopupOpen(!s.classList.contains('sidebar-open'));
        return;
      }
      setSidebarPopupOpen(!s.classList.contains('sidebar-open'));
    }

    function positionFooterPrimaryTabs() {
      const footer = document.getElementById('page-nav-bar');
      const primary = footer ? footer.querySelector('.page-nav-primary') : null;
      const toolsLeft = footer ? footer.querySelector('.page-nav-tool-left') : null;
      const sidebarBtn = document.getElementById('footer-sidebar-btn');
      const main = document.getElementById('main');
      if (!footer || !primary || !main) return;
      const footerRect = footer.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      if (!footerRect.width || !mainRect.width) return;
      const centerX = mainRect.left + (mainRect.width / 2) - footerRect.left;
      primary.style.left = `${Math.round(centerX)}px`;
      if (!toolsLeft) return;
      const primaryWidth = primary.offsetWidth || 0;
      const toolsWidth = toolsLeft.offsetWidth || 0;
      const sidebarRight = sidebarBtn
        ? (sidebarBtn.getBoundingClientRect().right - footerRect.left)
        : 52;
      const gap = 12;
      const leftStart = Math.max(12, Math.round(sidebarRight + gap));
      const leftEnd = Math.round(centerX - (primaryWidth / 2) - gap);
      toolsLeft.style.left = `${Math.max(leftStart, leftEnd - toolsWidth)}px`;
    }

    window.addEventListener('resize', () => {
      syncSidebarLayoutModeForViewport();
      positionSidebarPopup();
      positionFooterPrimaryTabs();
      positionSidebarQuickActions();
    });
    window.addEventListener('scroll', () => {
      positionSidebarPopup();
      positionSidebarQuickActions();
    }, true);
    setupModeBackgroundLinkControl();
    setupWorkspaceFontSizeControl();
    
