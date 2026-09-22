    // ===== QUICK SLIDE EDIT (songs only) =====
    // A pencil on each slide of the workspace opens plain-text editing in place:
    // Enter commits, Shift+Enter adds a line, Escape cancels.
    //
    // Writing back is deliberately conservative. Page splitting FILTERS lines out of the
    // song (solfa notation, category markers, punctuation-only lines), so rebuilding the
    // song from its pages would silently delete them. Instead the edited page's lines are
    // located as a contiguous run inside the original content and only that run is
    // replaced. If the run can't be found unambiguously, the edit is refused rather than
    // risking a corrupted song.

    let bspQuickEditRow = null; // the row currently being edited

    function bspSplitLines(text) {
      return String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    }

    // Finds the page's lines inside the content lines, comparing trimmed text so that
    // indentation differences don't defeat the match. Returns null when missing, and
    // 'ambiguous' when the same block appears more than once (a repeated chorus), because
    // replacing the wrong copy would be worse than doing nothing.
    function bspLocatePageRange(contentLines, pageLines) {
      const norm = (s) => String(s == null ? '' : s).trim();
      const target = pageLines.map(norm).filter(l => l !== '');
      if (!target.length) return null;

      const matches = [];
      for (let i = 0; i < contentLines.length; i++) {
        let j = i, k = 0;
        while (j < contentLines.length && k < target.length) {
          const line = norm(contentLines[j]);
          if (line === '') { j++; continue; }      // blank lines are not part of a page
          if (line !== target[k]) break;
          j++; k++;
        }
        if (k === target.length) {
          matches.push({ start: i, end: j - 1 });
          if (matches.length > 1) return 'ambiguous';
        }
      }
      return matches.length === 1 ? matches[0] : null;
    }

    function bspCommitQuickEdit(item, pageIndex, newText) {
      if (!item) return { ok: false, reason: 'no-item' };
      const pages = getPagesFromItem(item, false);
      const page = pages[pageIndex];
      if (!page) return { ok: false, reason: 'no-page' };

      const contentLines = bspSplitLines(item.content || '');
      const range = bspLocatePageRange(contentLines, bspSplitLines(page.raw || ''));
      if (range === 'ambiguous') return { ok: false, reason: 'ambiguous' };
      if (!range) return { ok: false, reason: 'not-found' };

      const replacement = bspSplitLines(newText).map(l => l.replace(/\s+$/, ''));
      // Drop leading/trailing blank lines so the slide keeps its shape.
      while (replacement.length && !replacement[0].trim()) replacement.shift();
      while (replacement.length && !replacement[replacement.length - 1].trim()) replacement.pop();
      if (!replacement.length) return { ok: false, reason: 'empty' };

      const next = contentLines.slice(0, range.start)
        .concat(replacement)
        .concat(contentLines.slice(range.end + 1));
      item.content = next.join('\n');

      // Pages are memoised on a content hash, but clear anyway so a stale entry can never
      // outlive the edit.
      try { if (typeof ITEM_PAGES_CACHE !== 'undefined' && ITEM_PAGES_CACHE.clear) ITEM_PAGES_CACHE.clear(); } catch (_) {}
      return { ok: true };
    }

    function bspCancelQuickEdit() {
      if (!bspQuickEditRow) return;
      bspQuickEditRow = null;
      if (typeof updateButtonView === 'function') updateButtonView({ preserveScroll: true });
    }

    function bspStartQuickEdit(rowEl, pageIndex) {
      if (!rowEl || !currentItem) return;
      // Songs only, by request. A verse added to the setlist has no `version`, so the
      // setlist marker is checked as well — otherwise scripture would be editable here.
      if (getIsBibleItem(currentItem) || currentItem._metaKind === 'bible_verse') return;
      const pages = getPagesFromItem(currentItem, false);
      const page = pages[pageIndex];
      if (!page) return;

      bspQuickEditRow = rowEl;
      const btn = rowEl.querySelector('.lyric-btn');
      if (btn) btn.style.display = 'none';
      rowEl.querySelectorAll('.lyric-go-live, .quick-add, .lyric-edit').forEach(el => { el.style.display = 'none'; });

      const wrap = document.createElement('div');
      wrap.className = 'lyric-quick-edit';

      const ta = document.createElement('textarea');
      ta.className = 'lyric-quick-edit__input';
      ta.value = page.raw || '';
      ta.rows = Math.max(2, bspSplitLines(page.raw || '').length);
      ta.spellcheck = false;

      const hint = document.createElement('div');
      hint.className = 'lyric-quick-edit__hint';
      hint.textContent = t('quick_edit_hint');

      const commit = () => {
        const res = bspCommitQuickEdit(currentItem, pageIndex, ta.value);
        bspQuickEditRow = null;
        if (!res.ok) {
          const msgKey = res.reason === 'ambiguous' ? 'quick_edit_ambiguous'
            : res.reason === 'empty' ? 'quick_edit_empty'
            : 'quick_edit_failed';
          showToast(t(msgKey));
          if (typeof updateButtonView === 'function') updateButtonView({ preserveScroll: true });
          return;
        }
        // Persist, redraw, and refresh the output if this slide is the one on air.
        if (typeof saveState === 'function') saveState();
        if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
        if (typeof renderSongs === 'function') renderSongs();
        if (typeof updateButtonView === 'function') updateButtonView({ preserveScroll: true });
        if (typeof isLive !== 'undefined' && isLive && typeof livePointer !== 'undefined' && livePointer &&
            typeof scheduleLiveUpdate === 'function') {
          scheduleLiveUpdate();
        }
        showToast(t('quick_edit_saved'));
      };

      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {   // Shift+Enter keeps its newline
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          bspCancelQuickEdit();
        }
        e.stopPropagation();   // don't let panel shortcuts fire while typing
      });
      ta.addEventListener('blur', () => { if (bspQuickEditRow === rowEl) commit(); });

      wrap.appendChild(ta);
      wrap.appendChild(hint);
      rowEl.appendChild(wrap);
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
