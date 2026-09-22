    // ===== BIBLE CATEGORIES =====
    // Book names come from the loaded bible file, in that file's own language
    // (updateBibleLists derives them from chapter titles: "Genese 1" -> "Genese").
    // So categories are resolved by mapping each name back to a canonical book
    // number 1-66 via BIBLE_BOOKS / BIBLE_BOOK_TRANSLATIONS, never by English text.

    const BSP_BIBLE_CATEGORIES = Object.freeze([
      { id: 'pentateuch',       testament: 'ot', from: 1,  to: 5  },
      { id: 'historical',       testament: 'ot', from: 6,  to: 17 },
      { id: 'wisdom',           testament: 'ot', from: 18, to: 22 },
      { id: 'major_prophets',   testament: 'ot', from: 23, to: 27 },
      { id: 'minor_prophets',   testament: 'ot', from: 28, to: 39 },
      { id: 'gospels',          testament: 'nt', from: 40, to: 43 },
      { id: 'acts',             testament: 'nt', from: 44, to: 44 },
      { id: 'pauline',          testament: 'nt', from: 45, to: 57 },
      { id: 'general_epistles', testament: 'nt', from: 58, to: 65 },
      { id: 'revelation',       testament: 'nt', from: 66, to: 66 }
    ]);

    function bspBibleCategoryLabel(categoryId) {
      return t(`bible_cat_${categoryId}`);
    }

    function bspCategoryForBookNumber(num) {
      if (!Number.isInteger(num)) return null;
      return BSP_BIBLE_CATEGORIES.find(cat => num >= cat.from && num <= cat.to) || null;
    }

    // Reverse index of every known book name (all languages) -> canonical number.
    // Used as a fallback when the version's language cannot be identified.
    let bspBookNumberIndexCache = null;

    function bspEachBookNameMap(visit) {
      if (typeof BIBLE_BOOKS === 'object' && BIBLE_BOOKS) visit('__canonical', BIBLE_BOOKS);
      if (typeof BIBLE_BOOK_TRANSLATIONS === 'object' && BIBLE_BOOK_TRANSLATIONS) {
        Object.entries(BIBLE_BOOK_TRANSLATIONS).forEach(([lang, map]) => {
          if (map && typeof map === 'object') visit(lang, map);
        });
      }
    }

    function bspReverseBookMap(map) {
      const rev = new Map();
      Object.entries(map || {}).forEach(([num, name]) => {
        const key = normalizeBookName(name);
        const parsed = Number(num);
        if (key && Number.isInteger(parsed) && !rev.has(key)) rev.set(key, parsed);
      });
      return rev;
    }

    function bspBuildBookNumberIndex() {
      if (bspBookNumberIndexCache) return bspBookNumberIndexCache;
      const index = new Map();
      // English canonical is visited first so it wins any cross-language name clash.
      bspEachBookNameMap((_lang, map) => {
        bspReverseBookMap(map).forEach((num, key) => {
          if (!index.has(key)) index.set(key, num);
        });
      });
      bspBookNumberIndexCache = index;
      return index;
    }

    // A bible file is normally in a single language. Scoring each language map
    // against the actual book set and resolving inside the winner avoids
    // mis-filing a book because an unrelated language reuses the same spelling.
    function bspPickBookMapForBooks(books) {
      const keys = (books || []).map(normalizeBookName).filter(Boolean);
      if (!keys.length) return null;
      let best = null;
      let bestScore = 0;
      bspEachBookNameMap((_lang, map) => {
        const rev = bspReverseBookMap(map);
        let score = 0;
        keys.forEach(key => { if (rev.has(key)) score += 1; });
        if (score > bestScore) {
          bestScore = score;
          best = rev;
        }
      });
      return bestScore > 0 ? best : null;
    }

    function bspResolveBookNumber(name, preferredMap) {
      const key = normalizeBookName(name);
      if (!key) return null;
      if (preferredMap && preferredMap.has(key)) return preferredMap.get(key);
      const found = bspBuildBookNumberIndex().get(key);
      return Number.isInteger(found) ? found : null;
    }

    // Returns ordered groups for the given book names, preserving canonical order
    // inside each category. Books whose name resolves to nothing are never dropped
    // silently: they land in a trailing "Other" group so the operator can still
    // reach them (custom or non-standard bible files).
    function bspGroupBooksByCategory(books) {
      const list = (books || []).filter(Boolean);
      const preferredMap = bspPickBookMapForBooks(list);
      const buckets = new Map();
      const unresolved = [];

      list.forEach((book, fileIndex) => {
        const num = bspResolveBookNumber(book, preferredMap);
        const cat = bspCategoryForBookNumber(num);
        if (!cat) {
          unresolved.push({ book, num: null, fileIndex });
          return;
        }
        if (!buckets.has(cat.id)) buckets.set(cat.id, []);
        buckets.get(cat.id).push({ book, num, fileIndex });
      });

      const groups = [];
      BSP_BIBLE_CATEGORIES.forEach(cat => {
        const entries = buckets.get(cat.id);
        if (!entries || !entries.length) return; // a NT-only bible shows no OT groups
        entries.sort((a, b) => a.num - b.num);
        groups.push({
          id: cat.id,
          testament: cat.testament,
          label: bspBibleCategoryLabel(cat.id),
          books: entries.map(e => e.book)
        });
      });

      if (unresolved.length) {
        unresolved.sort((a, b) => a.fileIndex - b.fileIndex);
        groups.push({
          id: 'other',
          testament: 'other',
          label: bspBibleCategoryLabel('other'),
          books: unresolved.map(e => e.book)
        });
      }

      return groups;
    }

    function bspInvalidateBibleCategoryCaches() {
      bspBookNumberIndexCache = null;
    }

    // ===== BIBLE CATEGORY DROPDOWN (progressive enhancement) =====
    // The native <select id="bible-book-select"> stays in the DOM and remains the
    // single source of truth: every existing caller still reads its .value and the
    // inline onchange="handleBookSelect()" keeps firing. This widget only mirrors it.

    let bspBcatOpen = false;
    let bspBcatFilter = '';
    let bspBcatActiveIndex = -1;
    let bspBcatFlatBooks = [];

    function bspBcatEls() {
      return {
        select: document.getElementById('bible-book-select'),
        root: document.getElementById('bsp-bcat'),
        trigger: document.getElementById('bsp-bcat-trigger'),
        label: document.getElementById('bsp-bcat-label'),
        panel: document.getElementById('bsp-bcat-panel'),
        filter: document.getElementById('bsp-bcat-filter'),
        list: document.getElementById('bsp-bcat-list')
      };
    }

    function bspBcatReadGroups() {
      const { select } = bspBcatEls();
      if (!select) return [];
      const groups = [];
      Array.from(select.children).forEach(child => {
        if (child.tagName === 'OPTGROUP') {
          const books = Array.from(child.children)
            .filter(o => o.tagName === 'OPTION' && o.value)
            .map(o => o.value);
          if (books.length) groups.push({ id: child.dataset.categoryId || '', label: child.label, books });
        } else if (child.tagName === 'OPTION' && child.value) {
          let loose = groups.find(g => g.id === '__loose');
          if (!loose) {
            loose = { id: '__loose', label: '', books: [] };
            groups.push(loose);
          }
          loose.books.push(child.value);
        }
      });
      return groups;
    }

    function bspBcatPositionPanel() {
      const { trigger, panel } = bspBcatEls();
      bspPositionFloatingPanel(trigger, panel);
    }

    function bspBcatOnViewportChange() {
      if (bspBcatOpen) bspBcatPositionPanel();
    }

    function bspBcatSetOpen(next) {
      const { root, trigger, panel, filter } = bspBcatEls();
      if (!root || !trigger || !panel) return;
      bspBcatOpen = !!next;
      root.classList.toggle('is-open', bspBcatOpen);
      trigger.setAttribute('aria-expanded', bspBcatOpen ? 'true' : 'false');
      panel.hidden = !bspBcatOpen;

      if (bspBcatOpen) {
        bspBcatFilter = '';
        if (filter) filter.value = '';
        bspDdPortalToBody(panel);
        bspBcatRenderList();
        bspBcatPositionPanel();
        // `true`: catch scrolling in any ancestor, not just the window.
        window.addEventListener('scroll', bspBcatOnViewportChange, true);
        window.addEventListener('resize', bspBcatOnViewportChange);
        requestAnimationFrame(() => {
          if (filter) filter.focus();
          bspBcatPositionPanel();
          bspBcatScrollActiveIntoView();
        });
      } else {
        bspBcatActiveIndex = -1;
        window.removeEventListener('scroll', bspBcatOnViewportChange, true);
        window.removeEventListener('resize', bspBcatOnViewportChange);
      }
    }

    function bspBcatSelect(book) {
      const { select } = bspBcatEls();
      if (!select) return;
      select.value = book;
      // Existing code binds via the inline onchange attribute, which assigning
      // .value does not trigger — dispatch so handleBookSelect() still runs.
      select.dispatchEvent(new Event('change', { bubbles: true }));
      bspBcatSetOpen(false);
      bspSyncBibleCategoryDropdown();
      const { trigger } = bspBcatEls();
      if (trigger) trigger.focus();
    }

    function bspBcatMatches(book) {
      if (!bspBcatFilter) return true;
      return normalizeBookName(book).includes(bspBcatFilter);
    }

    function bspBcatRenderList() {
      const { list, select } = bspBcatEls();
      if (!list || !select) return;
      const current = select.value;
      const groups = bspBcatReadGroups();
      list.innerHTML = '';
      bspBcatFlatBooks = [];

      groups.forEach(group => {
        const books = group.books.filter(bspBcatMatches);
        if (!books.length) return;
        const section = document.createElement('div');
        section.className = 'bsp-bcat__group';
        if (group.label) {
          const head = document.createElement('div');
          head.className = 'bsp-bcat__group-label';
          head.textContent = group.label;
          section.appendChild(head);
        }
        books.forEach(book => {
          const idx = bspBcatFlatBooks.length;
          bspBcatFlatBooks.push(book);
          const opt = document.createElement('button');
          opt.type = 'button';
          opt.className = 'bsp-bcat__option';
          opt.textContent = book;
          opt.dataset.index = String(idx);
          opt.setAttribute('role', 'option');
          if (book === current) {
            opt.classList.add('is-selected');
            opt.setAttribute('aria-selected', 'true');
          }
          opt.addEventListener('click', () => bspBcatSelect(book));
          section.appendChild(opt);
        });
        list.appendChild(section);
      });

      if (!bspBcatFlatBooks.length) {
        const empty = document.createElement('div');
        empty.className = 'bsp-bcat__empty';
        empty.textContent = t('ui_no_books_match');
        list.appendChild(empty);
      }

      const selectedIdx = bspBcatFlatBooks.indexOf(current);
      bspBcatActiveIndex = selectedIdx >= 0 ? selectedIdx : (bspBcatFlatBooks.length ? 0 : -1);
      bspBcatPaintActive();
    }

    function bspBcatPaintActive() {
      const { list } = bspBcatEls();
      if (!list) return;
      list.querySelectorAll('.bsp-bcat__option').forEach(el => {
        el.classList.toggle('is-active', Number(el.dataset.index) === bspBcatActiveIndex);
      });
    }

    function bspBcatScrollActiveIntoView() {
      const { list } = bspBcatEls();
      if (!list) return;
      const el = list.querySelector('.bsp-bcat__option.is-active');
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }

    function bspBcatMoveActive(delta) {
      if (!bspBcatFlatBooks.length) return;
      const next = bspBcatActiveIndex + delta;
      bspBcatActiveIndex = Math.max(0, Math.min(bspBcatFlatBooks.length - 1, next));
      bspBcatPaintActive();
      bspBcatScrollActiveIntoView();
    }

    function bspBcatOnTriggerKeydown(e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        bspBcatSetOpen(true);
      }
    }

    function bspBcatOnPanelKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        bspBcatSetOpen(false);
        const { trigger } = bspBcatEls();
        if (trigger) trigger.focus();
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); bspBcatMoveActive(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); bspBcatMoveActive(-1); return; }
      if (e.key === 'Home') { e.preventDefault(); bspBcatActiveIndex = 0; bspBcatPaintActive(); bspBcatScrollActiveIntoView(); return; }
      if (e.key === 'End') { e.preventDefault(); bspBcatActiveIndex = bspBcatFlatBooks.length - 1; bspBcatPaintActive(); bspBcatScrollActiveIntoView(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const book = bspBcatFlatBooks[bspBcatActiveIndex];
        if (book) bspBcatSelect(book);
      }
    }

    function bspSyncBibleCategoryDropdown() {
      const { select, root, label, trigger } = bspBcatEls();
      if (!select || !root || !label) return;
      const hasBooks = !!select.querySelector('option[value]:not([value=""])');
      const value = select.value;
      label.textContent = value || t('ui_select_book');
      label.classList.toggle('is-placeholder', !value);
      root.classList.toggle('is-disabled', !hasBooks);
      if (trigger) trigger.disabled = !hasBooks;
      if (!hasBooks && bspBcatOpen) bspBcatSetOpen(false);
      if (bspBcatOpen) bspBcatRenderList();
    }

    function bspInitBibleCategoryDropdown() {
      const { select, trigger, filter, panel } = bspBcatEls();
      if (!select || !trigger || !panel) return;

      trigger.addEventListener('click', () => {
        if (trigger.disabled) return;
        bspBcatSetOpen(!bspBcatOpen);
      });
      trigger.addEventListener('keydown', bspBcatOnTriggerKeydown);
      panel.addEventListener('keydown', bspBcatOnPanelKeydown);

      if (filter) {
        filter.addEventListener('input', () => {
          bspBcatFilter = normalizeBookName(filter.value);
          bspBcatRenderList();
        });
      }

      document.addEventListener('click', (e) => {
        if (!bspBcatOpen) return;
        const { root, panel: openPanel } = bspBcatEls();
        if (!bspDdClickIsInside(e, root, openPanel)) bspBcatSetOpen(false);
      });

      // Keep the widget honest if anything else drives the select programmatically.
      select.addEventListener('change', () => bspSyncBibleCategoryDropdown());

      bspSyncBibleCategoryDropdown();
    }
