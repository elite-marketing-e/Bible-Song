    // ===== BIBLE VERSION DROPDOWN =====
    // Replaces the old two-row #version-bar button strip: versions are now behind a
    // single trigger instead of all being on screen at once. The visible surface stays
    // constant no matter how many versions are loaded.
    //
    // Behaviour kept from the old strip: per-version colour from VERSION_COLORS,
    // active version highlight, dual-version primary/secondary flags, and delete.
    // #version-bar is on the i18n skip list (version names are user data), so nothing
    // rendered here carries data-i18n.

    let bspVerOpen = false;
    let bspVerFilter = '';
    let bspVerCursor = -1;
    let bspVerRows = [];
    let bspVerPendingDelete = '';
    let bspVerBound = false;

    function bspVerEls() {
      return {
        root: document.getElementById('bsp-ver'),
        trigger: document.getElementById('bsp-ver-trigger'),
        dot: document.getElementById('bsp-ver-dot'),
        label: document.getElementById('bsp-ver-label'),
        count: document.getElementById('bsp-ver-count'),
        panel: document.getElementById('bsp-ver-panel'),
        filterWrap: document.getElementById('bsp-ver-filter-wrap'),
        filter: document.getElementById('bsp-ver-filter'),
        list: document.getElementById('bsp-ver-list')
      };
    }

    function bspVerKeys() {
      return Object.keys(bibles || {});
    }

    function bspVerColor(ver) {
      const keys = bspVerKeys();
      const i = keys.indexOf(ver);
      if (i < 0) return 'var(--text-tertiary)';
      return VERSION_COLORS[i % VERSION_COLORS.length];
    }

    function bspVerMatches(ver) {
      if (!bspVerFilter) return true;
      return normalizeSearchText(ver).includes(bspVerFilter);
    }

    function bspVerPositionPanel() {
      const { trigger, panel } = bspVerEls();
      bspPositionFloatingPanel(trigger, panel);
    }

    function bspVerOnViewportChange() {
      if (bspVerOpen) bspVerPositionPanel();
    }

    function bspVerSetOpen(next) {
      const { root, trigger, panel, filter } = bspVerEls();
      if (!root || !trigger || !panel) return;
      bspVerOpen = !!next;
      root.classList.toggle('is-open', bspVerOpen);
      trigger.setAttribute('aria-expanded', bspVerOpen ? 'true' : 'false');
      panel.hidden = !bspVerOpen;

      if (bspVerOpen) {
        bspVerFilter = '';
        bspVerPendingDelete = '';
        if (filter) filter.value = '';
        bspDdPortalToBody(panel);
        bspVerRenderList();
        bspVerPositionPanel();
        window.addEventListener('scroll', bspVerOnViewportChange, true);
        window.addEventListener('resize', bspVerOnViewportChange);
        requestAnimationFrame(() => {
          const { filter: f } = bspVerEls();
          if (f && f.offsetParent !== null) f.focus();
          bspVerPositionPanel();
          bspVerScrollCursorIntoView();
        });
      } else {
        bspVerCursor = -1;
        bspVerPendingDelete = '';
        window.removeEventListener('scroll', bspVerOnViewportChange, true);
        window.removeEventListener('resize', bspVerOnViewportChange);
      }
    }

    function bspVerPick(ver) {
      // Key-existence, not value: a lazily-unloaded version is a null sentinel but is
      // still a valid pick — changeActiveBibleVersion loads it.
      if (!ver || !(ver in bibles)) return;
      changeActiveBibleVersion(ver);
      bspVerSetOpen(false);
      bspSyncBibleVersionDropdown();
      const { trigger } = bspVerEls();
      if (trigger) trigger.focus();
    }

    // Deleting a version drops it from IndexedDB for good, so the first click only
    // arms the button and the second one commits. The old strip deleted on a single
    // click, which is a poor idea in a panel driven live during a service.
    function bspVerRequestDelete(ver) {
      if (bspVerPendingDelete !== ver) {
        bspVerPendingDelete = ver;
        bspVerRenderList();
        return;
      }
      bspVerPendingDelete = '';
      bspVerDeleteConfirmed(ver);
    }

    function bspVerDeleteConfirmed(ver) {
      if (!(ver in bibles)) return;
      delete bibles[ver];
      clearBibleSearchCache(ver);
      if (activeBibleVersion === ver) activeBibleVersion = null;
      idbDelete(STORE_BIBLES, ver).catch(() => {});
      saveState();
      saveToStorageDebounced();
      renderVersionBar();
      renderSongs();
      updateBibleLists();
      if (isLive) scheduleLiveUpdate();
      if (!bspVerKeys().length) bspVerSetOpen(false);
      else bspVerRenderList();
    }

    function bspVerRenderList() {
      const { list, filterWrap } = bspVerEls();
      if (!list) return;
      const keys = bspVerKeys();

      // The filter only earns its space once the list is long enough to need it.
      if (filterWrap) filterWrap.style.display = keys.length > 6 ? '' : 'none';

      list.innerHTML = '';
      bspVerRows = [];

      keys.filter(bspVerMatches).forEach(ver => {
        const idx = bspVerRows.length;
        bspVerRows.push(ver);

        const isPrimary = activeBibleVersion === ver;
        const isSecondary = !!(typeof dualVersionModeEnabled !== 'undefined' && dualVersionModeEnabled &&
          typeof dualVersionSecondaryId !== 'undefined' && dualVersionSecondaryId === ver);

        const row = document.createElement('div');
        row.className = 'bsp-ver__row' + (isPrimary ? ' is-active' : '');
        row.dataset.index = String(idx);

        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'bsp-ver__pick';
        pick.setAttribute('role', 'option');
        if (isPrimary) pick.setAttribute('aria-selected', 'true');

        const dot = document.createElement('span');
        dot.className = 'bsp-ver__dot';
        dot.style.setProperty('--bsp-ver-color', bspVerColor(ver));

        const name = document.createElement('span');
        name.className = 'bsp-ver__name';
        name.textContent = ver;

        pick.appendChild(dot);
        pick.appendChild(name);

        if (isPrimary && isSecondary) {
          // Cannot be both; guard anyway so the UI never renders a contradiction.
          const flag = document.createElement('span');
          flag.className = 'bsp-ver__flag primary';
          flag.textContent = '1';
          pick.appendChild(flag);
        } else if (isPrimary) {
          const flag = document.createElement('span');
          flag.className = 'bsp-ver__flag primary';
          flag.textContent = (typeof dualVersionModeEnabled !== 'undefined' && dualVersionModeEnabled &&
            typeof dualVersionSecondaryId !== 'undefined' && dualVersionSecondaryId) ? '1' : '✓';
          pick.appendChild(flag);
        } else if (isSecondary) {
          const flag = document.createElement('span');
          flag.className = 'bsp-ver__flag secondary';
          flag.textContent = '2';
          pick.appendChild(flag);
        }

        pick.addEventListener('click', () => bspVerPick(ver));

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'bsp-ver__del' + (bspVerPendingDelete === ver ? ' is-confirming' : '');
        del.textContent = bspVerPendingDelete === ver ? t('ui_confirm_short') : '✕';
        del.title = bspVerPendingDelete === ver ? t('ui_confirm_delete_version') : t('ui_delete_version');
        del.setAttribute('aria-label', `${t('ui_delete_version')}: ${ver}`);
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          bspVerRequestDelete(ver);
        });

        row.appendChild(pick);
        row.appendChild(del);
        list.appendChild(row);
      });

      if (!bspVerRows.length) {
        const empty = document.createElement('div');
        empty.className = 'bsp-ver__empty';
        empty.textContent = keys.length ? t('ui_no_versions_match') : t('ui_no_versions_loaded');
        list.appendChild(empty);
      }

      // Always offer a way in. This dropdown is the natural place to manage versions, so
      // with none loaded it must not be a dead end — it used to just say "no version
      // loaded" and sit disabled, which read as "importing is gone".
      if (!bspVerFilter) {
        const importRow = document.createElement('button');
        importRow.type = 'button';
        importRow.className = 'bsp-ver__import';
        importRow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
        const label = document.createElement('span');
        label.textContent = t('ui_import_bible_version');
        importRow.appendChild(label);
        importRow.addEventListener('click', () => {
          bspVerSetOpen(false);
          if (typeof triggerImport === 'function') triggerImport();
        });
        list.appendChild(importRow);
      }

      const activeIdx = bspVerRows.indexOf(activeBibleVersion);
      bspVerCursor = activeIdx >= 0 ? activeIdx : (bspVerRows.length ? 0 : -1);
      bspVerPaintCursor();
    }

    function bspVerPaintCursor() {
      const { list } = bspVerEls();
      if (!list) return;
      list.querySelectorAll('.bsp-ver__row').forEach(el => {
        el.classList.toggle('is-cursor', Number(el.dataset.index) === bspVerCursor);
      });
    }

    function bspVerScrollCursorIntoView() {
      const { list } = bspVerEls();
      if (!list) return;
      const el = list.querySelector('.bsp-ver__row.is-cursor');
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }

    function bspVerMoveCursor(delta) {
      if (!bspVerRows.length) return;
      bspVerCursor = Math.max(0, Math.min(bspVerRows.length - 1, bspVerCursor + delta));
      bspVerPaintCursor();
      bspVerScrollCursorIntoView();
    }

    function bspVerOnPanelKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // First Escape only cancels a pending delete, so it cannot close the panel
        // while the operator is mid-confirmation.
        if (bspVerPendingDelete) {
          bspVerPendingDelete = '';
          bspVerRenderList();
          return;
        }
        bspVerSetOpen(false);
        const { trigger } = bspVerEls();
        if (trigger) trigger.focus();
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); bspVerMoveCursor(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); bspVerMoveCursor(-1); return; }
      if (e.key === 'Home') { e.preventDefault(); bspVerCursor = 0; bspVerPaintCursor(); bspVerScrollCursorIntoView(); return; }
      if (e.key === 'End') { e.preventDefault(); bspVerCursor = bspVerRows.length - 1; bspVerPaintCursor(); bspVerScrollCursorIntoView(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const ver = bspVerRows[bspVerCursor];
        if (ver) bspVerPick(ver);
      }
    }

    function bspVerOnTriggerKeydown(e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        bspVerSetOpen(true);
      }
    }

    function bspSyncBibleVersionDropdown() {
      const { root, trigger, dot, label, count } = bspVerEls();
      if (!root || !trigger || !label) return;
      const keys = bspVerKeys();
      const hasVersions = keys.length > 0;
      const active = (activeBibleVersion && (activeBibleVersion in bibles)) ? activeBibleVersion : '';

      label.textContent = active || (hasVersions ? t('ui_select_version') : t('ui_no_versions_loaded'));
      label.classList.toggle('is-placeholder', !active);
      if (dot) dot.style.setProperty('--bsp-ver-color', active ? bspVerColor(active) : 'var(--text-tertiary)');
      if (count) count.textContent = keys.length > 1 ? String(keys.length) : '';
      // Stays enabled even with no versions: the panel is how you reach "Import a Bible
      // version", so disabling it would close the only obvious door.
      root.classList.remove('is-disabled');
      trigger.disabled = false;
      if (bspVerOpen) bspVerRenderList();
    }

    function bspInitBibleVersionDropdown() {
      const { trigger, panel, filter } = bspVerEls();
      if (!trigger || !panel || bspVerBound) return;
      bspVerBound = true;

      trigger.addEventListener('click', () => {
        if (trigger.disabled) return;
        bspVerSetOpen(!bspVerOpen);
      });
      trigger.addEventListener('keydown', bspVerOnTriggerKeydown);
      panel.addEventListener('keydown', bspVerOnPanelKeydown);

      if (filter) {
        filter.addEventListener('input', () => {
          bspVerFilter = normalizeSearchText(filter.value);
          bspVerPendingDelete = '';
          bspVerRenderList();
        });
      }

      document.addEventListener('click', (e) => {
        if (!bspVerOpen) return;
        const { root, panel: openPanel } = bspVerEls();
        if (!bspDdClickIsInside(e, root, openPanel)) bspVerSetOpen(false);
      });

      bspSyncBibleVersionDropdown();
    }
