    // ===== SETLIST HEADER (sidebar, Setlist tab) =====
    // Title + comment above the setlist, a quick Save (export) reachable without opening
    // Settings, and a New-setlist action. Editing anything auto-saves to local storage —
    // the app already persists on change, so "save" here means export to a file.

    let bspSetlistSavedTimer = 0;

    function bspSetlistHeaderVisible(tab) {
      const el = document.getElementById('bsp-setlist-header');
      if (!el) return;
      el.hidden = (tab || (typeof sidebarTab !== 'undefined' ? sidebarTab : '')) !== 'schedule';
      if (!el.hidden) bspRenderSetlistHeader();
    }

    function bspRenderSetlistHeader() {
      const titleEl = document.getElementById('bsp-slh-title');
      const commentEl = document.getElementById('bsp-slh-comment');
      if (titleEl && document.activeElement !== titleEl) titleEl.value = (setlistMeta && setlistMeta.title) || '';
      if (commentEl && document.activeElement !== commentEl) commentEl.value = (setlistMeta && setlistMeta.comment) || '';
    }

    // ── Sections de setlist ──────────────────────────────────────────────────────
    // Une section est une entrée séparatrice `{_metaKind:'section', title, id}` dans `schedule`.
    // Elle n'est ni projetable ni dé-dupliquée (getScheduleEntryKey renvoie null) ; elle sert
    // à regrouper visuellement les éléments (ex. « Louange », « Prédication », « Versets »).
    function bspAddSetlistSection() {
      if (!Array.isArray(schedule)) return;
      const entry = {
        _metaKind: 'section',
        id: 'sec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: (typeof t === 'function' && t('setlist_section_default')) || 'Nouvelle section'
      };
      schedule.push(entry);
      if (typeof saveState === 'function') saveState();
      if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      if (typeof sidebarTab !== 'undefined' && sidebarTab === 'schedule' && typeof renderSongs === 'function') {
        renderSongs();
        // Renommage immédiat de la section fraîchement ajoutée (dernière ligne).
        setTimeout(() => {
          const list = document.getElementById('song-list');
          if (!list) return;
          const rows = list.querySelectorAll('.setlist-section-row');
          const btn = rows.length ? rows[rows.length - 1].querySelector('.setlist-section-row__rename') : null;
          if (btn) btn.click();
        }, 30);
      }
      if (typeof showToast === 'function') showToast((typeof t === 'function' && t('setlist_section_added')) || 'Section ajoutée');
    }
    window.bspAddSetlistSection = bspAddSetlistSection;

    function bspFlashSetlistSaved() {
      const s = document.getElementById('bsp-slh-status');
      if (!s) return;
      s.textContent = t('setlist_autosaved');
      s.classList.add('is-shown');
      if (bspSetlistSavedTimer) clearTimeout(bspSetlistSavedTimer);
      bspSetlistSavedTimer = setTimeout(() => s.classList.remove('is-shown'), 1400);
    }

    function bspOnSetlistMetaInput() {
      const titleEl = document.getElementById('bsp-slh-title');
      const commentEl = document.getElementById('bsp-slh-comment');
      if (!setlistMeta || typeof setlistMeta !== 'object') setlistMeta = { title: '', comment: '' };
      setlistMeta.title = titleEl ? titleEl.value : '';
      setlistMeta.comment = commentEl ? commentEl.value : '';
      if (typeof saveState === 'function') saveState();
      if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      bspFlashSetlistSaved();
    }

    // ── New setlist ──────────────────────────────────────────────────────────────
    function bspOpenNewSetlist() {
      const modal = document.getElementById('bsp-newsetlist-modal');
      if (!modal) return;
      const title = document.getElementById('bsp-nsl-title');
      const comment = document.getElementById('bsp-nsl-comment');
      if (title) title.value = '';
      if (comment) comment.value = '';
      modal.hidden = false;
      if (title) title.focus();
      document.addEventListener('keydown', bspNewSetlistKeydown, true);
    }

    function bspCloseNewSetlist() {
      const modal = document.getElementById('bsp-newsetlist-modal');
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      document.removeEventListener('keydown', bspNewSetlistKeydown, true);
    }

    function bspNewSetlistKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); bspCloseNewSetlist(); }
      else if (e.key === 'Enter' && (e.target.id === 'bsp-nsl-title' || e.target.id === 'bsp-nsl-comment')) {
        e.preventDefault(); bspConfirmNewSetlist();
      }
    }

    // Replaces the current setlist with a fresh empty one. Guarded when the current
    // setlist has items, since a service order is not something to drop by accident.
    async function bspConfirmNewSetlist() {
      const title = (document.getElementById('bsp-nsl-title')?.value || '').trim();
      const comment = (document.getElementById('bsp-nsl-comment')?.value || '').trim();
      const exportNow = !!document.getElementById('bsp-nsl-export')?.checked;

      const doCreate = () => {
        schedule.length = 0;
        setlistMeta = { title, comment };
        if (typeof selectItem === 'function') { /* nothing to select */ }
        if (typeof renderSongs === 'function') renderSongs();
        if (typeof saveState === 'function') saveState();
        if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
        bspRenderSetlistHeader();
        bspCloseNewSetlist();
        // "Destination" at creation: export the fresh (empty) setlist to a file the user
        // picks, so it exists to re-import later. Auto-save to that file isn't possible
        // from a browser, so the local copy is the live one; the file is a snapshot.
        if (exportNow && typeof bspExportSetlist === 'function') bspExportSetlist();
        if (typeof showToast === 'function') showToast(t('setlist_created'));
      };

      if (Array.isArray(schedule) && schedule.length && typeof showConfirm === 'function') {
        showConfirm(t('setlist_new_title'), t('setlist_new_confirm').replace('{n}', String(schedule.length)), doCreate);
      } else {
        doCreate();
      }
    }
