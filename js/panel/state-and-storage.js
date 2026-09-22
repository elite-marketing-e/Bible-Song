
    // Marqueur de build du PANNEAU : permet de vérifier qu'une fenêtre tourne bien sur le
    // DERNIER code, et non une instance Electron ouverte AVANT les correctifs (ou un serveur
    // 5510 réutilisé). Dans la console du panneau (Ctrl+Shift+I → Console), taper
    // BSP_PANEL_BUILD, ou lire la ligne « [BSP] PANEL BUILD-… » au chargement.
    try { window.BSP_PANEL_BUILD = 'PANEL BUILD-43 · 2026-09-22 · bouton MAJ dans l\'en-tête (pastille MAJ dispo / Installer)'; console.log('[BSP] ' + window.BSP_PANEL_BUILD); } catch (_) {}

    // ===== DB =====
    function openDb() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_SONGS)) {
            db.createObjectStore(STORE_SONGS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_BIBLES)) {
            db.createObjectStore(STORE_BIBLES, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_STATE)) {
            db.createObjectStore(STORE_STATE, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORE_MEDIA)) {
            db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return dbPromise;
    }

    function idbGet(storeName, key) {
      return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }));
    }

    function idbGetAll(storeName) {
      return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }));
    }

    // Keys only — no values. Boot uses this to learn which bible versions exist without
    // pulling their (multi-megabyte) parsed verses into memory.
    function idbGetAllKeys(storeName) {
      return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }));
    }

    // ===== LAZY BIBLE LOADING =====
    // The whole library used to sit parsed in the heap at once (12 versions, ~77 MB of
    // XML → hundreds of MB of JS objects), which is what produced "out of memory". Now
    // only the active (and dual-secondary) version's verses live in RAM. Every other
    // version is a SENTINEL — `bibles[name] === null` — so the version LIST still
    // enumerates through Object.keys(bibles) unchanged, while its bytes stay in
    // IndexedDB until actually needed.
    const bibleLoadPromises = {}; // name -> in-flight load, so concurrent asks share one read

    function isBibleLoaded(name) {
      return !!name && Array.isArray(bibles[name]);
    }

    // Loads a version's verses into bibles[name] on demand. Never creates a phantom key
    // for a name the library doesn't know. Returns a Promise of the verse array.
    function ensureBibleLoaded(name) {
      if (!name) return Promise.resolve(null);
      if (Array.isArray(bibles[name])) return Promise.resolve(bibles[name]);
      if (bibleLoadPromises[name]) return bibleLoadPromises[name];
      const known = (name in bibles);
      const p = idbGet(STORE_BIBLES, name).then(rec => {
        delete bibleLoadPromises[name];
        if (rec && Array.isArray(rec.parsedData)) { bibles[name] = rec.parsedData; return rec.parsedData; }
        if (known) bibles[name] = [];
        return bibles[name] || [];
      }).catch(() => {
        delete bibleLoadPromises[name];
        if (known) bibles[name] = [];
        return bibles[name] || [];
      });
      bibleLoadPromises[name] = p;
      return p;
    }

    // Turns every version that is neither active nor the dual secondary back into a
    // sentinel, freeing its verse array. Call AFTER active/secondary are set so the cache
    // holds at most a couple of versions.
    function evictInactiveBibles() {
      const keep = new Set();
      if (typeof activeBibleVersion !== 'undefined' && activeBibleVersion) keep.add(activeBibleVersion);
      if (typeof dualVersionModeEnabled !== 'undefined' && dualVersionModeEnabled &&
          typeof dualVersionSecondaryId !== 'undefined' && dualVersionSecondaryId) keep.add(dualVersionSecondaryId);
      Object.keys(bibles).forEach(name => {
        if (!keep.has(name) && Array.isArray(bibles[name])) bibles[name] = null;
      });
    }

    window.ensureBibleLoaded = ensureBibleLoaded;
    window.evictInactiveBibles = evictInactiveBibles;

    function idbPut(storeName, value) {
      if (storeName === STORE_SONGS) queueRelayStatePush({ includeSongs: true });
      if (storeName === STORE_BIBLES) queueRelayStatePush({ includeBibles: true });
      return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(value);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    }

    function idbDelete(storeName, key) {
      return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    }

    function dbGetAll(storeName) {
      return idbGetAll(storeName);
    }

    function dbPutMany(storeName, records) {
      const items = Array.isArray(records) ? records : [];
      if (!items.length) return Promise.resolve(true);
      if (storeName === STORE_SONGS) queueRelayStatePush({ includeSongs: true });
      if (storeName === STORE_BIBLES) queueRelayStatePush({ includeBibles: true });
      return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        items.forEach(item => store.put(item));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    }

    function dbClearStore(storeName) {
      if (storeName === STORE_SONGS) queueRelayStatePush({ includeSongs: true });
      if (storeName === STORE_BIBLES) queueRelayStatePush({ includeBibles: true });
      return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    }

    function dbSetAppState(nextState, opts = {}) {
      const updatedAt = opts.updatedAt || Date.now();
      appStateUpdatedAt = updatedAt;
      const payload = { key: 'appState', value: nextState, updatedAt };
      return idbPut(STORE_STATE, payload);
    }

    function persistLtStyles() {
      if (isRestoringBackup) return Promise.resolve(false);
      const json = safeStringify(ltStyles);
      const payload = { key: 'ltStyles', value: json, format: 'json', updatedAt: Date.now() };
      return idbPut(STORE_STATE, payload).catch(() => false);
    }

    function flushAppState() {
      if (isRestoringBackup) return Promise.resolve(false);
      syncAppStateFromUi();
      const updatedAt = isApplyingRemoteState ? (appStateUpdatedAt || Date.now()) : Date.now();
      appStateUpdatedAt = updatedAt;
      const payload = { key: 'appState', value: appState, updatedAt };
      return idbPut(STORE_STATE, payload).catch(() => false);
    }

    // ===== UTILITIES / SEARCH =====
    function normalizeSearchText(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g, '')
        .replace(/[\u2018\u2019]/g, "'")
        .toLowerCase()
        // Keep ":" for chapter:verse refs; normalize other separators/punctuation.
        .replace(/[^\p{L}\p{N}:]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function getItemSearchableText(item) {
      if (!item) return '';
      if (item.version) return normalizeSearchText(item.title || '');
      if (item.searchableText) return item.searchableText;
      const base = `${item.title || ''}\n${item.content || item.text || ''}`;
      return normalizeSearchText(base);
    }

    const bibleSearchCache = new Map();

    function clearBibleSearchCache(versionId) {
      if (versionId) bibleSearchCache.delete(versionId);
      else bibleSearchCache.clear();
    }

    function buildBibleSearchIndex(versionId) {
      const list = (versionId && bibles[versionId]) ? bibles[versionId] : [];
      const entries = [];
      list.forEach((item, chapterIndex) => {
        const extracted = extractBookAndChapter(item);
        const book = item?.book || extracted.book || '';
        const chap = item?.chapter || extracted.chap || '';
        const lines = String(item?.content || '').split('\n');
        lines.forEach((line) => {
          const match = line.match(/^(\d+)\s+(.+)/);
          if (!match) return;
          const verse = match[1];
          const text = match[2];
          const searchText = normalizeSearchText(`${book} ${chap}:${verse} ${text}`);
          entries.push({ chapterIndex, book, chapter: chap, verse, text, searchText });
        });
      });
      return { entries, size: list.length };
    }

    function getBibleSearchIndex(versionId) {
      const list = (versionId && bibles[versionId]) ? bibles[versionId] : [];
      const cached = bibleSearchCache.get(versionId);
      if (cached && cached.size === list.length) return cached.entries;
      const built = buildBibleSearchIndex(versionId);
      bibleSearchCache.set(versionId, built);
      return built.entries;
    }

    function parseBibleReferenceQuery(raw) {
      const q = normalizeSearchText(raw).trim();
      if (!q) return null;
      const match = q.match(/^([\p{L}1-3 ]+)\s+(\d+)(?::(\d*))?$/u);
      if (!match) return null;
      const [, bookRaw, chapterRaw, versePrefixRaw] = match;
      const book = normalizeSearchText(bookRaw).trim();
      const chapter = String(chapterRaw || '').trim();
      const versePrefix = String(versePrefixRaw || '');
      const hasColon = q.includes(':');
      return {
        raw,
        normalizedQuery: q,
        book,
        chapter,
        versePrefix,
        hasColon,
        isChapterQuery: !hasColon || !versePrefix,
        isVersePrefixQuery: hasColon && !!versePrefix
      };
    }

    function isBibleReferenceQuery(raw) {
      return !!parseBibleReferenceQuery(raw);
    }

    function findBibleReferenceChapter(versionId, query, opts = {}) {
      const parsed = (query && typeof query === 'object' && query.chapter)
        ? query
        : parseBibleReferenceQuery(query);
      if (!parsed) return null;
      const list = (versionId && bibles[versionId]) ? bibles[versionId] : [];
      if (!list.length) return null;
      const selectedBookKey = normalizeBookName(opts.book || '');
      const bookNeedle = normalizeBookName(parsed.book);
      const compactBookNeedle = bookNeedle.replace(/\s+/g, '');
      let chapterIndex = -1;
      let chapterItem = null;

      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        const extracted = extractBookAndChapter(item);
        const itemBook = item?.book || extracted.book || '';
        const itemBookKey = normalizeBookName(itemBook);
        const itemCompactBookKey = itemBookKey.replace(/\s+/g, '');
        const itemChapter = String(item?.chapter || extracted.chap || '').trim();
        if (!itemBookKey || !itemChapter) continue;
        if (selectedBookKey && itemBookKey !== selectedBookKey) continue;
        if (itemChapter !== parsed.chapter) continue;
        const bookMatches =
          itemBookKey === bookNeedle ||
          itemBookKey.startsWith(bookNeedle) ||
          itemCompactBookKey === compactBookNeedle ||
          itemCompactBookKey.startsWith(compactBookNeedle);
        if (!bookMatches) continue;
        chapterIndex = index;
        chapterItem = item;
        break;
      }

      if (chapterIndex === -1 || !chapterItem) return null;
      return { chapterIndex, chapterItem, parsed };
    }

    function findBibleReferenceMatches(query, opts = {}) {
      const parsed = (query && typeof query === 'object' && query.chapter)
        ? query
        : parseBibleReferenceQuery(query);
      if (!parsed) return [];
      const versionId = opts.versionId || activeBibleVersion;
      if (!versionId || !bibles[versionId]) return [];
      const chapterMatch = findBibleReferenceChapter(versionId, parsed, opts);
      if (!chapterMatch) return [];
      const { chapterIndex, chapterItem } = chapterMatch;
      const results = [];
      String(chapterItem.content || '').split('\n').forEach((line) => {
        const match = String(line || '').match(/^(\d+)\s+(.+)/);
        if (!match) return;
        const verse = match[1];
        if (parsed.versePrefix && !verse.startsWith(parsed.versePrefix)) return;
        results.push({
          chapterIndex,
          book: chapterItem.book || extractBookAndChapter(chapterItem).book,
          chapter: parsed.chapter,
          verse,
          text: match[2]
        });
      });
      return results;
    }

    function findBibleKeywordMatches(query, opts = {}) {
      const q = normalizeSearchText(query).trim();
      if (!q || q.length < 2) return [];
      const tokens = q.split(/\s+/).filter(Boolean);
      if (!tokens.length) return [];
      const maxResults = opts.maxResults || 200;
      const versionId = opts.versionId || activeBibleVersion;
      if (!versionId || !bibles[versionId]) return [];
      const selectedBook = opts.book || '';
      const bookKey = normalizeBookName(selectedBook);
      const entries = getBibleSearchIndex(versionId);
      const results = [];
      for (const entry of entries) {
        if (bookKey && normalizeBookName(entry.book) !== bookKey) continue;
        if (!tokens.every(t => entry.searchText.includes(t))) continue;
        results.push(entry);
        if (results.length >= maxResults) break;
      }
      return results;
    }

    function slugify(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    function createId(prefix, value) {
      const base = slugify(value).slice(0, 32) || 'item';
      return `${prefix}_${base}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function buildSongRecord(song, { isNew = false } = {}) {
      const now = Date.now();
      const id = song.id || createId('song', song.title);
      const text = song.text || song.content || '';
      const searchableText = normalizeSearchText(`${song.title || ''}\n${text}`);
      const normalizedLines = text.split('\n');
      return {
        id,
        title: song.title || '',
        text,
        translatedLyrics: String(song.translatedLyrics || ''),
        translationLanguage: String(song.translationLanguage || ''),
        translationStatus: String(song.translationStatus || 'idle'),
        translationLocked: !!song.translationLocked,
        translatedAt: Number(song.translatedAt || 0),
        translationHash: String(song.translationHash || ''),
        bilingualEnabled: !!song.bilingualEnabled,
        normalizedLines,
        searchableText,
        createdAt: isNew ? now : (song.createdAt || now),
        updatedAt: now
      };
    }

    function hydrateSongFromRecord(record) {
      return normalizeSongTranslationState({
        id: record.id,
        title: record.title || '',
        content: record.text || '',
        text: record.text || '',
        translatedLyrics: String(record.translatedLyrics || ''),
        translationLanguage: String(record.translationLanguage || ''),
        translationStatus: String(record.translationStatus || 'idle'),
        translationLocked: !!record.translationLocked,
        translatedAt: Number(record.translatedAt || 0),
        translationHash: String(record.translationHash || ''),
        bilingualEnabled: !!record.bilingualEnabled,
        searchableText: record.searchableText || normalizeSearchText(`${record.title || ''}\n${record.text || ''}`),
        createdAt: record.createdAt || Date.now(),
        updatedAt: record.updatedAt || Date.now()
      });
    }

    function scheduleSongPersist(song) {
      if (!song) return;
      clearTimeout(songSaveTimer);
      songSaveTimer = setTimeout(() => {
        const record = buildSongRecord(song);
        song.id = record.id;
        song.searchableText = record.searchableText;
        song.createdAt = record.createdAt;
        song.updatedAt = record.updatedAt;
        idbPut(STORE_SONGS, record).catch(() => {});
      }, 400);
    }

    function buildBibleRecord(name, parsedData, { isNew = false, createdAt = null } = {}) {
      const now = Date.now();
      const id = name;
      const searchableText = normalizeSearchText(name);
      const createdAtValue = createdAt || (isNew ? now : now);
      return {
        id,
        name,
        parsedData: Array.isArray(parsedData) ? parsedData : [],
        searchableText,
        createdAt: createdAtValue,
        updatedAt: now
      };
    }

    function persistBibleVersion(name) {
      const data = bibles[name] || [];
      const record = buildBibleRecord(name, data);
      return idbPut(STORE_BIBLES, record);
    }

    function schedulePersistAppState() {
      if (!stateReady || isRestoringBackup) {
        pendingPersist = true;
        return;
      }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveToStorage();
      }, 500);
    }

    function getBackgroundSnapshot() {
      const bgTypeEl = document.getElementById('bg-type');
      if (!bgTypeEl) return null;
      const snapshot = {
        bgType: bgTypeEl.value,
        bgImageSource: document.getElementById('bg-image-source')?.value,
        bgImageUrl: document.getElementById('bg-image-url')?.value,
        bgUploadDataUrl,
        bgVideoSource: document.getElementById('bg-video-source')?.value,
        bgVideoUrl: document.getElementById('bg-video-url')?.value,
        bgVideoUploadDataUrl,
        bgVideoLoop: document.getElementById('bg-video-loop')?.checked,
        bgVideoSpeed: document.getElementById('bg-video-speed')?.value,
        bgMode,
        bgColor: document.getElementById('bg-color-quick')?.value,
        bgGradientShadow: document.getElementById('bg-color-shadow')?.value,
        bgGradientHighlight: document.getElementById('bg-color-highlight')?.value,
        bgBlur: document.getElementById('bg-blur')?.value,
        bgEdgeFix: document.getElementById('bg-edge-fix')?.value,
        bgOpacity: getActiveBgOpacityValue(),
        bgOpacityFull,
        bgOpacityLT,
        bgY: document.getElementById('bg-y')?.value,
        bgToggle: document.getElementById('bg-toggle')?.checked,
        animateBgTransitions: document.getElementById('animate-bg-transitions')?.checked,
        bgGradientAngle: document.getElementById('bg-gradient-angle')?.value || 135
      };
      return snapshot;
    }

    function applyBackgroundSnapshot(target, snapshot) {
      if (!target || !snapshot) return;
      BG_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
          target[key] = snapshot[key];
        }
      });
    }

    function extractBackgroundSnapshot(settings) {
      if (!settings || typeof settings !== 'object') return null;
      const snapshot = {};
      BG_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
          snapshot[key] = settings[key];
        }
      });
      return Object.keys(snapshot).length ? snapshot : null;
    }

    function getAnimationSnapshot() {
      const typeEl = document.getElementById('song-transition-type');
      if (!typeEl) return null;
      return {
        songTransitionType: typeEl.value,
        songTransitionDuration: document.getElementById('song-transition-duration')?.value,
        animateBgTransitions: document.getElementById('animate-bg-transitions')?.checked
      };
    }

    function applyAnimationSnapshot(target, snapshot) {
      if (!target || !snapshot) return;
      ANIMATION_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
          target[key] = snapshot[key];
        }
      });
    }

    function extractAnimationSnapshot(settings) {
      if (!settings || typeof settings !== 'object') return null;
      const snapshot = {};
      ANIMATION_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
          snapshot[key] = settings[key];
        }
      });
      return Object.keys(snapshot).length ? snapshot : null;
    }

    function persistAnimationState() {
      if (!stateReady || isRestoringBackup) {
        pendingAnimationPersist = true;
        return;
      }
      const snapshot = getAnimationSnapshot();
      if (!snapshot) return;
      const payload = { key: 'animationSettings', value: snapshot, updatedAt: Date.now() };
      idbPut(STORE_STATE, payload).catch(() => {});
    }

    function schedulePersistAnimation() {
      if (!stateReady || isRestoringBackup) {
        pendingAnimationPersist = true;
        return;
      }
      clearTimeout(animationSaveTimer);
      animationSaveTimer = setTimeout(() => {
        persistAnimationState();
      }, 500);
    }

    function getTypographySnapshot() {
      const familyEl = document.getElementById('font-family');
      if (!familyEl) return null;
      return {
        fontFamily: familyEl.value,
        fontWeight: document.getElementById('font-weight')?.value,
        fontSizeFull: document.getElementById('font-size-val')?.value,
        fullTextTransform,
        ltFontSongs,
        ltFontBible,
        ltFontCustom,
        refFontSize: document.getElementById('ref-font-size-val')?.value,
        lineHeightFull: document.getElementById('line-height-full')?.value,
        lineHeightLT: document.getElementById('line-height-lt')?.value,
        textColor: document.getElementById('text-color')?.value,
        refColor: document.getElementById('ref-color')?.value,
        refBgColor: document.getElementById('ref-bg-color')?.value,
        dualVersionModeEnabled,
        dualVersionSecondaryId
      };
    }

    function applyTypographySnapshot(target, snapshot) {
      if (!target || !snapshot) return;
      TYPOGRAPHY_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
          target[key] = snapshot[key];
        }
      });
    }

    function extractTypographySnapshot(settings) {
      if (!settings || typeof settings !== 'object') return null;
      const snapshot = {};
      TYPOGRAPHY_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
          snapshot[key] = settings[key];
        }
      });
      return Object.keys(snapshot).length ? snapshot : null;
    }

    function persistTypographyState() {
      if (!stateReady || isRestoringBackup) {
        pendingTypographyPersist = true;
        return;
      }
      const snapshot = getTypographySnapshot();
      if (!snapshot) return;
      const payload = { key: 'typographySettings', value: snapshot, updatedAt: Date.now() };
      idbPut(STORE_STATE, payload).catch(() => {});
    }

    function schedulePersistTypography() {
      if (!stateReady || isRestoringBackup) {
        pendingTypographyPersist = true;
        return;
      }
      clearTimeout(typographySaveTimer);
      typographySaveTimer = setTimeout(() => {
        persistTypographyState();
      }, 500);
    }

    function getModeSettingsSnapshot() {
      const fullSizeEl = document.getElementById('font-size-val');
      if (!fullSizeEl) return null;
      return {
        fontSizeFull: fullSizeEl.value,
        lineHeightFull: document.getElementById('line-height-full')?.value,
        fullTextTransform: document.getElementById('full-text-transform')?.value || fullTextTransform,
        autoResizeFull: document.getElementById('auto-resize-full')?.value,
        autoResizeLT: document.getElementById('auto-resize-lt')?.value,
        refPositionFull: document.getElementById('ref-position-full')?.value,
        fullOffsetX: document.getElementById('full-offset-x')?.value,
        fullOffsetY: document.getElementById('full-offset-y')?.value,
        hAlignFullRef: fullRefHAlign,
        hAlignFull: fullHAlign,
        vAlignFull: fullVAlign,
        ltFontSongs,
        ltFontBible,
        ltFontCustom,
        lineHeightLT: document.getElementById('line-height-lt')?.value,
        hAlignLTSongs: ltHAlignSongs,
        vAlignLTSongs: ltVAlignSongs,
        ltAnchorMode,
        hAlignLTBible: ltHAlignBible,
        vAlignLTBible: ltVAlignBible,
        hAlignLTBibleVerse: ltHAlignBibleVerse,
        autoAdjustLtHeight: document.getElementById('auto-adjust-lt-height')?.checked,
        refBgColor: document.getElementById('ref-bg-color')?.value,
        refBgEnabled: refBgEnabled,
        ltRefFontSize: document.getElementById('ref-font-size-lt-val')?.value,
        referenceShadowEnabled: referenceShadowEnabled,
        verseShadowEnabled: verseShadowEnabled,
        referenceTextCapitalized: document.getElementById('capitalize-ref-text')?.checked,
        showVersion: document.getElementById('show-version')?.checked,
        shortenBibleVersions: document.getElementById('shorten-bible-versions')?.checked,
        shortenBibleBooks: document.getElementById('shorten-bible-books')?.checked,
        showVerseNos: document.getElementById('show-verse-nos')?.checked,
        versionSwitchUpdatesLive: document.getElementById('version-switch-updates-live')?.checked,
        dualVersionModeEnabled: dualVersionModeEnabled,
        dualVersionSecondaryId: dualVersionSecondaryId
      };
    }

    function applyModeSettingsSnapshot(target, snapshot) {
      if (!target || !snapshot) return;
      MODE_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
          target[key] = snapshot[key];
        }
      });
    }

    function extractModeSettingsSnapshot(settings) {
      if (!settings || typeof settings !== 'object') return null;
      const snapshot = {};
      MODE_SETTINGS_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
          snapshot[key] = settings[key];
        }
      });
      return Object.keys(snapshot).length ? snapshot : null;
    }

    const PROJECTION_SETTINGS_PROFILE_KEYS = Array.from(new Set([
      'fontFamily',
      'fontWeight',
      'fontSizeFull',
      'fullTextTransform',
      'ltFontSongs',
      'ltFontBible',
      'ltFontCustom',
      'refFontSize',
      'lineHeightFull',
      'lineHeightLT',
      'letterSpacing',
      'refBold',
      'refItalic',
      'textColor',
      'refColor',
      'refBgColor',
      'bgType',
      'bgImageSource',
      'bgImageUrl',
      'bgUploadDataUrl',
      'bgVideoSource',
      'bgVideoUrl',
      'bgVideoUploadDataUrl',
      'bgVideoLoop',
      'bgVideoSpeed',
      'bgMode',
      'bgColor',
      'bgGradientShadow',
      'bgGradientHighlight',
      'bgBlur',
      'bgEdgeFix',
      'bgOpacity',
      'bgOpacityFull',
      'bgOpacityLT',
      'bgY',
      'bgToggle',
      'animateBgTransitions',
      'bgGradientAngle',
      'ltRefFontSize',
      'linesPerPage',
      'activeRatio',
      'sdWidth',
      'sdMargin',
      'sdMarginTop',
      'sdMarginRight',
      'sdMarginBottom',
      'sdMarginLeft',
      'sdSlant',
      'sdStrokeWidth',
      'sdStrokeColor',
      'ltTextTransform',
      'fullRefTextTransform',
      'ltRefTextTransform',
      'showVersion',
      'showVerseNos',
      'shortenBibleVersions',
      'shortenBibleBooks',
      'autoAdjustLtHeight',
      'autoResizeFull',
      'autoResizeLT',
      'refPositionFull',
      'fullOffsetX',
      'fullOffsetY',
      'ltWidthPct',
      'ltScalePct',
      'ltOffsetX',
      'ltOffsetY',
      'ltBorderRadius',
      'padLRFull',
      'padLRLT',
      'hAlignFullRef',
      'hAlignFull',
      'vAlignFull',
      'hAlignLTSongs',
      'vAlignLTSongs',
      'ltAnchorMode',
      'hAlignLTBible',
      'vAlignLTBible',
      'hAlignLTBibleVerse',
      'referenceShadowEnabled',
      'verseShadowEnabled',
      'referenceTextCapitalized',
      'refBgEnabled',
      'refBorderRadius',
      'refBorderWidth',
      'refBorderColor',
      'refUnderlineEnabled',
      'refUnderlineColor',
      'refUnderlineThickness',
      'ltBoxUnderlineEnabled',
      'ltBoxUnderlineColor',
      'ltBoxUnderlineThickness',
      'padTopFull', 'padRightFull', 'padBottomFull', 'padLeftFull',
      'padTopLT', 'padRightLT', 'padBottomLT', 'padLeftLT',
      'padLinked',
      'minFitScale',
      'verseShadowColor', 'verseShadowBlur', 'verseShadowOffsetX', 'verseShadowOffsetY', 'verseShadowOpacity',
      'songShadowEnabled', 'songShadowColor', 'songShadowBlur', 'songShadowOffsetX', 'songShadowOffsetY', 'songShadowOpacity',
      'verseContourEnabled', 'verseContourColor', 'verseContourSize',
      'songContourEnabled', 'songContourColor', 'songContourSize',
      'refContourEnabled', 'refContourColor', 'refContourSize',
      'verseStrokeEnabled', 'verseStrokeColor', 'verseStrokeSize',
      'songStrokeEnabled', 'songStrokeColor', 'songStrokeSize',
      'refStrokeEnabled', 'refStrokeColor', 'refStrokeSize',
      'ltPresetSelection',
      'ltPresetUpdatesLive',
      'dualVersionModeEnabled',
      'dualVersionSecondaryId'
    ]));
    const SETTINGS_TARGET_TABS = ['bible', 'songs', 'schedule'];

    function normalizeSettingsTargetTab(value) {
      return (value === 'follow' || SETTINGS_TARGET_TABS.includes(value)) ? value : 'follow';
    }

    function getEffectiveSettingsTargetTab(target = settingsTargetTab) {
      const normalized = normalizeSettingsTargetTab(target);
      return normalized === 'follow' ? (sidebarTab || 'bible') : normalized;
    }

    function captureProjectionSettingsSnapshot() {
      return {
        ...(getTypographySnapshot() || {}),
        ...(getBackgroundSnapshot() || {}),
        fontSizeFull: document.getElementById('font-size-val')?.value,
        ltFontSongs, ltFontBible, ltFontCustom,
        refFontSize: document.getElementById('ref-font-size-val')?.value,
        ltRefFontSize: document.getElementById('ref-font-size-lt-val')?.value,
        lineHeightFull: document.getElementById('line-height-full')?.value,
        lineHeightLT: document.getElementById('line-height-lt')?.value,
        textColor: document.getElementById('text-color')?.value,
        refColor: document.getElementById('ref-color')?.value,
        refBgColor: document.getElementById('ref-bg-color')?.value,
        linesPerPage, activeRatio, sdWidth, sdMargin, sdMarginTop, sdMarginRight, sdMarginBottom, sdMarginLeft, sdSlant, sdStrokeWidth, sdStrokeColor,
        fullTextTransform: document.getElementById('full-text-transform')?.value || fullTextTransform,
        ltTextTransform: document.getElementById('lt-text-transform')?.value || ltTextTransform || 'uppercase',
        fullRefTextTransform: document.getElementById('full-ref-text-transform')?.value || fullRefTextTransform || 'uppercase',
        ltRefTextTransform: document.getElementById('lt-ref-text-transform')?.value || ltRefTextTransform || 'uppercase',
        showVersion: document.getElementById('show-version')?.checked,
        showVerseNos: document.getElementById('show-verse-nos')?.checked,
        shortenBibleVersions: document.getElementById('shorten-bible-versions')?.checked,
        shortenBibleBooks: document.getElementById('shorten-bible-books')?.checked,
        autoAdjustLtHeight: document.getElementById('auto-adjust-lt-height')?.checked,
        autoResizeFull: document.getElementById('auto-resize-full')?.value,
        autoResizeLT: document.getElementById('auto-resize-lt')?.value,
        refPositionFull: document.getElementById('ref-position-full')?.value,
        fullOffsetX: document.getElementById('full-offset-x')?.value,
        fullOffsetY: document.getElementById('full-offset-y')?.value,
        ltPresetSelection: document.getElementById('lt-preset-select')?.value || 'default',
        ltPresetUpdatesLive: document.getElementById('lt-preset-update-live')?.value !== 'false',
        ltWidthPct: document.getElementById('lt-width-pct')?.value,
        ltScalePct: document.getElementById('lt-scale-pct')?.value,
        ltOffsetX: document.getElementById('lt-offset-x')?.value,
        ltOffsetY: document.getElementById('lt-offset-y')?.value,
        ltBorderRadius: document.getElementById('lt-border-radius')?.value,
        padLRFull: document.getElementById('pad-lr-full')?.value ?? 5,
        padLRLT: document.getElementById('pad-lr-lt')?.value ?? 5,
        hAlignFullRef: fullRefHAlign, hAlignFull: fullHAlign, vAlignFull: fullVAlign,
        hAlignLTSongs: ltHAlignSongs, vAlignLTSongs: ltVAlignSongs, ltAnchorMode,
        hAlignLTBible: ltHAlignBible, vAlignLTBible: ltVAlignBible, hAlignLTBibleVerse: ltHAlignBibleVerse,
        referenceShadowEnabled, verseShadowEnabled,
        referenceTextCapitalized: document.getElementById('capitalize-ref-text')?.checked,
        refBgEnabled, dualVersionModeEnabled, dualVersionSecondaryId,
        // Per-output reference/LT box styling — backed by globals (the controls live in
        // the per-screen design panel, not the settings modal).
        refBorderRadius, refBorderWidth, refBorderColor,
        refUnderlineEnabled, refUnderlineColor, refUnderlineThickness,
        refBold, refItalic, letterSpacing,
        ltBoxUnderlineEnabled, ltBoxUnderlineColor, ltBoxUnderlineThickness,
        padTopFull, padRightFull, padBottomFull, padLeftFull,
        padTopLT, padRightLT, padBottomLT, padLeftLT,
        padLinked, minFitScale,
        verseShadowColor, verseShadowBlur, verseShadowOffsetX, verseShadowOffsetY, verseShadowOpacity,
        songShadowEnabled, songShadowColor, songShadowBlur, songShadowOffsetX, songShadowOffsetY, songShadowOpacity,
        verseContourEnabled, verseContourColor, verseContourSize,
        songContourEnabled, songContourColor, songContourSize,
        refContourEnabled, refContourColor, refContourSize,
        verseStrokeEnabled, verseStrokeColor, verseStrokeSize,
        songStrokeEnabled, songStrokeColor, songStrokeSize,
        refStrokeEnabled, refStrokeColor, refStrokeSize
      };
    }

    function normalizeProjectionSettingsSnapshot(raw, fallback = {}) {
      const next = { ...fallback };
      const source = (raw && typeof raw === 'object') ? raw : {};
      PROJECTION_SETTINGS_PROFILE_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) next[key] = source[key];
      });
      return next;
    }

    function createDefaultProjectionSettingsProfiles(seed = null) {
      const base = normalizeProjectionSettingsSnapshot(seed || captureProjectionSettingsSnapshot(), {});
      return {
        bible: {
          ...base,
          ltPresetSelection: 'rounded-card',
          autoResizeLT: 'shrink',
          lineHeightLT: 1.1,
          padLRLT: 5,
          ltWidthPct: 100,
          ltScalePct: 80,
          ltOffsetX: 0,
          ltOffsetY: 25,
          ltBorderRadius: 23,
          autoAdjustLtHeight: true,
          hAlignLTBible: 'center',
          vAlignLTBible: 'middle',
          hAlignLTBibleVerse: 'center',
          ltAnchorMode: 'bottom',
          bgOpacityFull: 100,
          bgOpacityLT: 100
        },
        songs: {
          ...base,
          ltWidthPct: 60,
          ltOffsetX: 0,
          ltOffsetY: 50,
          bgOpacityFull: 100,
          bgOpacityLT: 100
        },
        schedule: { ...base }
      };
    }

    function ensureProjectionSettingsProfiles(seed = null) {
      if (!projectionSettingsProfilesByTab || typeof projectionSettingsProfilesByTab !== 'object') {
        projectionSettingsProfilesByTab = createDefaultProjectionSettingsProfiles(seed);
      }
      const defaults = createDefaultProjectionSettingsProfiles(seed);
      SETTINGS_TARGET_TABS.forEach((tab) => {
        projectionSettingsProfilesByTab[tab] = normalizeProjectionSettingsSnapshot(projectionSettingsProfilesByTab[tab], defaults[tab]);
      });
      return projectionSettingsProfilesByTab;
    }

    function loadProjectionSettingsProfilesFromUi(ui) {
      const seed = normalizeProjectionSettingsSnapshot(ui || {}, captureProjectionSettingsSnapshot());
      projectionSettingsProfilesByTab = createDefaultProjectionSettingsProfiles(seed);
      const source = (ui && ui.projectionSettingsProfiles && typeof ui.projectionSettingsProfiles === 'object') ? ui.projectionSettingsProfiles : {};
      SETTINGS_TARGET_TABS.forEach((tab) => {
        projectionSettingsProfilesByTab[tab] = normalizeProjectionSettingsSnapshot(source[tab], projectionSettingsProfilesByTab[tab]);
      });
      settingsTargetTab = normalizeSettingsTargetTab(ui?.settingsTargetTab);
      return projectionSettingsProfilesByTab;
    }

    function saveProjectionSettingsProfileForTab(tab = getEffectiveSettingsTargetTab()) {
      if (!SETTINGS_TARGET_TABS.includes(tab)) return null;
      // Editing a screen → write to that output's override, never the base profile.
      if ((tab === 'bible' || tab === 'songs') && bspSettingsOutputIsScreen()) {
        bspSaveSettingsToOutput(settingsTargetOutput, tab);
        return null;
      }
      const profiles = ensureProjectionSettingsProfiles();
      const prevProfile = profiles[tab];
      const snap = normalizeProjectionSettingsSnapshot(captureProjectionSettingsSnapshot(), prevProfile);
      // Le MODE (activeRatio) est géré PAR KIND, explicitement, par setRatio /
      // bspApplyKindModeForOutput (qui écrivent profiles[kind].activeRatio en direct). La
      // capture générale ci-dessus lit la globale `activeRatio` transitoire, qui reflète le
      // DERNIER bouton de mode cliqué QUEL QUE SOIT le kind ; l'écrire dans profiles[tab] faisait
      // fuiter le mode d'un kind vers l'autre (ex. changer le mode du CHANT déplaçait la BIBLE à
      // l'antenne). On préserve donc le mode déjà persisté pour CE tab — la capture ne le bouge
      // jamais.
      if (prevProfile && prevProfile.activeRatio != null) snap.activeRatio = prevProfile.activeRatio;
      profiles[tab] = snap;
      return profiles[tab];
    }

    function getProjectionSettingsSnapshotForTab(tab = getEffectiveSettingsTargetTab()) {
      // While a per-output payload is being rendered, that output's design wins over the
      // tab profile — and, because callers read this before falling back to the DOM,
      // over the panel's current UI too.
      if (bspDesignProfileOverride) return bspDesignProfileOverride;
      if (!SETTINGS_TARGET_TABS.includes(tab)) return normalizeProjectionSettingsSnapshot(captureProjectionSettingsSnapshot(), {});
      const profiles = ensureProjectionSettingsProfiles();
      return normalizeProjectionSettingsSnapshot(profiles[tab], captureProjectionSettingsSnapshot());
    }

    function applyProjectionRuntimeSnapshot(profile) {
      const next = normalizeProjectionSettingsSnapshot(profile, captureProjectionSettingsSnapshot());
      if (typeof next.fullTextTransform !== 'undefined') fullTextTransform = next.fullTextTransform;
      if (typeof next.ltTextTransform !== 'undefined') ltTextTransform = next.ltTextTransform;
      if (typeof next.fullRefTextTransform !== 'undefined') fullRefTextTransform = next.fullRefTextTransform;
      if (typeof next.ltRefTextTransform !== 'undefined') ltRefTextTransform = next.ltRefTextTransform;
      if (next.ltFontSongs != null) ltFontSongs = Number(next.ltFontSongs);
      if (next.ltFontBible != null) ltFontBible = Number(next.ltFontBible);
      if (next.ltFontCustom != null) ltFontCustom = Number(next.ltFontCustom);
      if (next.ltRefFontSize != null) ltRefFontSize = Number(next.ltRefFontSize);
      if (next.linesPerPage != null) linesPerPage = Math.max(1, Math.min(getMaxLinesForCurrentTab(sidebarTab), Number(next.linesPerPage) || 1));
      if (next.activeRatio) activeRatio = ['16-9', 'sd-left', 'sd-right', 'custom'].indexOf(next.activeRatio) !== -1 ? next.activeRatio : 'full';
      if (next.sdWidth != null) sdWidth = Math.max(15, Math.min(90, Number(next.sdWidth) || 50));
      if (next.sdMargin != null) sdMargin = Math.max(0, Math.min(40, Number(next.sdMargin) || 0));
      if (next.sdMarginTop != null) sdMarginTop = Math.max(0, Math.min(40, Number(next.sdMarginTop) || 0));
      if (next.sdMarginRight != null) sdMarginRight = Math.max(0, Math.min(40, Number(next.sdMarginRight) || 0));
      else if (next.sdMargin != null) sdMarginRight = sdMargin;
      if (next.sdMarginBottom != null) sdMarginBottom = Math.max(0, Math.min(40, Number(next.sdMarginBottom) || 0));
      if (next.sdMarginLeft != null) sdMarginLeft = Math.max(0, Math.min(40, Number(next.sdMarginLeft) || 0));
      else if (next.sdMargin != null) sdMarginLeft = sdMargin;
      if (next.sdSlant != null) sdSlant = Math.max(-40, Math.min(40, Number(next.sdSlant) || 0));
      if (next.sdStrokeWidth != null) sdStrokeWidth = Math.max(0, Math.min(40, Number(next.sdStrokeWidth) || 0));
      if (next.sdStrokeColor != null) sdStrokeColor = String(next.sdStrokeColor);
      if (next.autoAdjustLtHeight != null) autoAdjustLtHeight = !!next.autoAdjustLtHeight;
      fullRefHAlign = next.hAlignFullRef || fullRefHAlign;
      fullHAlign = next.hAlignFull || fullHAlign;
      fullVAlign = next.vAlignFull || fullVAlign;
      ltHAlignSongs = next.hAlignLTSongs || ltHAlignSongs;
      ltVAlignSongs = next.vAlignLTSongs || ltVAlignSongs;
      ltAnchorMode = next.ltAnchorMode === 'top' ? 'top' : 'bottom';
      ltHAlignBible = next.hAlignLTBible || ltHAlignBible;
      ltVAlignBible = next.vAlignLTBible || ltVAlignBible;
      ltHAlignBibleVerse = next.hAlignLTBibleVerse || ltHAlignBibleVerse;
      if (next.refBgEnabled != null) refBgEnabled = !!next.refBgEnabled;
      if (next.refBorderRadius != null) refBorderRadius = Math.max(0, Math.min(240, Number(next.refBorderRadius) || 0));
      if (next.refBorderWidth != null) refBorderWidth = Math.max(0, Math.min(40, Number(next.refBorderWidth) || 0));
      if (next.refBorderColor) refBorderColor = next.refBorderColor;
      if (next.refUnderlineEnabled != null) refUnderlineEnabled = !!next.refUnderlineEnabled;
      if (next.refUnderlineColor) refUnderlineColor = next.refUnderlineColor;
      if (next.refUnderlineThickness != null) refUnderlineThickness = Math.max(0, Math.min(40, Number(next.refUnderlineThickness) || 0));
      if (next.ltBoxUnderlineEnabled != null) ltBoxUnderlineEnabled = !!next.ltBoxUnderlineEnabled;
      if (next.ltBoxUnderlineColor) ltBoxUnderlineColor = next.ltBoxUnderlineColor;
      if (next.ltBoxUnderlineThickness != null) ltBoxUnderlineThickness = Math.max(0, Math.min(40, Number(next.ltBoxUnderlineThickness) || 0));
      if (next.refBold != null) refBold = !!next.refBold;
      if (next.refItalic != null) refItalic = !!next.refItalic;
      if (next.letterSpacing != null) letterSpacing = Math.max(-20, Math.min(60, Number(next.letterSpacing) || 0));
      const padNum = (v, d) => (v == null ? d : Math.max(0, Math.min(600, Number(v) || 0)));
      padTopFull = padNum(next.padTopFull, padTopFull);
      padRightFull = padNum(next.padRightFull, padRightFull);
      padBottomFull = padNum(next.padBottomFull, padBottomFull);
      padLeftFull = padNum(next.padLeftFull, padLeftFull);
      padTopLT = padNum(next.padTopLT, padTopLT);
      padRightLT = padNum(next.padRightLT, padRightLT);
      padBottomLT = padNum(next.padBottomLT, padBottomLT);
      padLeftLT = padNum(next.padLeftLT, padLeftLT);
      if (next.padLinked != null) padLinked = !!next.padLinked;
      if (next.minFitScale != null) minFitScale = Math.max(0.02, Math.min(1, Number(next.minFitScale) || 0.03));
      const blurNum = (v, d) => (v == null ? d : Math.max(0, Math.min(80, Number(v) || 0)));
      const offNum = (v, d) => (v == null ? d : Math.max(-40, Math.min(40, Number(v) || 0)));
      if (next.verseShadowColor) verseShadowColor = next.verseShadowColor;
      verseShadowBlur = blurNum(next.verseShadowBlur, verseShadowBlur);
      verseShadowOffsetX = offNum(next.verseShadowOffsetX, verseShadowOffsetX);
      verseShadowOffsetY = offNum(next.verseShadowOffsetY, verseShadowOffsetY);
      if (next.verseShadowOpacity != null) verseShadowOpacity = Math.max(0, Math.min(1, Number(next.verseShadowOpacity)));
      if (next.songShadowEnabled != null) songShadowEnabled = !!next.songShadowEnabled;
      if (next.songShadowColor) songShadowColor = next.songShadowColor;
      songShadowBlur = blurNum(next.songShadowBlur, songShadowBlur);
      songShadowOffsetX = offNum(next.songShadowOffsetX, songShadowOffsetX);
      songShadowOffsetY = offNum(next.songShadowOffsetY, songShadowOffsetY);
      if (next.songShadowOpacity != null) songShadowOpacity = Math.max(0, Math.min(1, Number(next.songShadowOpacity)));
      if (next.referenceShadowEnabled != null) referenceShadowEnabled = !!next.referenceShadowEnabled;
      if (next.verseShadowEnabled != null) verseShadowEnabled = !!next.verseShadowEnabled;
      const contourSizeNum = (v, d) => (v == null ? d : Math.max(0, Math.min(20, Number(v) || 0)));
      if (next.verseContourEnabled != null) verseContourEnabled = !!next.verseContourEnabled;
      if (next.verseContourColor) verseContourColor = next.verseContourColor;
      verseContourSize = contourSizeNum(next.verseContourSize, verseContourSize);
      if (next.songContourEnabled != null) songContourEnabled = !!next.songContourEnabled;
      if (next.songContourColor) songContourColor = next.songContourColor;
      songContourSize = contourSizeNum(next.songContourSize, songContourSize);
      if (next.refContourEnabled != null) refContourEnabled = !!next.refContourEnabled;
      if (next.refContourColor) refContourColor = next.refContourColor;
      refContourSize = contourSizeNum(next.refContourSize, refContourSize);
      if (next.verseStrokeEnabled != null) verseStrokeEnabled = !!next.verseStrokeEnabled;
      if (next.verseStrokeColor) verseStrokeColor = next.verseStrokeColor;
      verseStrokeSize = contourSizeNum(next.verseStrokeSize, verseStrokeSize);
      if (next.songStrokeEnabled != null) songStrokeEnabled = !!next.songStrokeEnabled;
      if (next.songStrokeColor) songStrokeColor = next.songStrokeColor;
      songStrokeSize = contourSizeNum(next.songStrokeSize, songStrokeSize);
      if (next.refStrokeEnabled != null) refStrokeEnabled = !!next.refStrokeEnabled;
      if (next.refStrokeColor) refStrokeColor = next.refStrokeColor;
      refStrokeSize = contourSizeNum(next.refStrokeSize, refStrokeSize);
      if (next.referenceTextCapitalized != null) referenceTextCapitalized = !!next.referenceTextCapitalized;
      if (next.dualVersionModeEnabled != null) dualVersionModeEnabled = !!next.dualVersionModeEnabled;
      if (Object.prototype.hasOwnProperty.call(next, 'dualVersionSecondaryId')) dualVersionSecondaryId = next.dualVersionSecondaryId || null;
    }

    function updateSettingsTargetControl() {
      const value = normalizeSettingsTargetTab(settingsTargetTab);
        const activeKey = value === 'follow' ? getEffectiveSettingsTargetTab(value) : value;
        ['follow', 'bible', 'songs', 'schedule'].forEach((key) => {
        const btn = document.getElementById(`settings-target-${key}`);
          if (btn) btn.classList.toggle('active', key === activeKey);
      });
      if (typeof refreshSettingsTabVisibility === 'function') {
        refreshSettingsTabVisibility(getEffectiveSettingsTargetTab());
      }
    }

    function refreshSettingsTabVisibility(targetTab = getEffectiveSettingsTargetTab()) {
      const effectiveTarget = SETTINGS_TARGET_TABS.includes(targetTab) ? targetTab : 'bible';
      const tabSpecificMap = {
        song: 'songs',
        bible: 'bible',
        setlist: 'schedule'
      };
      const setlistHiddenTabs = new Set(['fullscreen', 'lowerthird', 'typography', 'background']);
      document.querySelectorAll('.sm-sidebar-item[data-sm-tab]').forEach((item) => {
        const tabId = item.dataset.smTab;
        if (effectiveTarget === 'schedule' && setlistHiddenTabs.has(tabId)) {
          item.style.display = 'none';
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(tabSpecificMap, tabId)) {
          if (tabId !== 'customstyle') item.style.display = '';
          return;
        }
        item.style.display = (tabSpecificMap[tabId] === effectiveTarget) ? '' : 'none';
      });
      const activeSidebarItem = document.querySelector('.sm-sidebar-item.active[data-sm-tab]');
      const activeTabId = activeSidebarItem?.dataset?.smTab || document.querySelector('.sm-tab-panel.active')?.dataset?.smPanel || 'fullscreen';
      const visibleSidebarItems = Array.from(document.querySelectorAll('.sm-sidebar-item[data-sm-tab]'))
        .filter((item) => item.style.display !== 'none');
      const nextTabId = visibleSidebarItems.some((item) => item.dataset.smTab === activeTabId)
        ? activeTabId
        : (visibleSidebarItems[0]?.dataset?.smTab || 'fullscreen');
      const isBibleTarget = effectiveTarget === 'bible';
      const isSongsTarget = effectiveTarget === 'songs';
      const setDisplay = (id, show) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? '' : 'none';
      };
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      setDisplay('full-ref-font-field', isBibleTarget);
      setDisplay('full-ref-align-field', isBibleTarget);
      setDisplay('full-ref-position-field', isBibleTarget);
      setDisplay('lt-ref-font-field', isBibleTarget);
      setDisplay('lt-bible-verse-align-row', isBibleTarget);
      setDisplay('ref-color-field', !isSongsTarget);
      setDisplay('ref-shadow-field', !isSongsTarget);
      // ref-bg-toggle-row / ref-bg-color-row restent MASQUÉS : l'UI de la boîte de référence
      // (couleur, arrondi, bordure, souligné) est rendue par bspRenderSettingsBgRef dans
      // #sm-bg-ref-extra, Bible-only et par sortie. Les <input> hérités restent dans le DOM.
      setDisplay('full-song-transform-field', isSongsTarget);
      setDisplay('lt-song-transform-field', isSongsTarget);
      setDisplay('full-ref-transform-field', isBibleTarget);
      setDisplay('lt-ref-transform-field', isBibleTarget);
      setText('full-content-font-label', isBibleTarget ? 'Verse Font Size (pt)' : (isSongsTarget ? 'Song Font Size (pt)' : 'Font Size (pt)'));
      setText('lt-content-font-label', isBibleTarget ? 'Verse Font Size (pt)' : (isSongsTarget ? 'Song Font Size (pt)' : 'Font Size (pt)'));
      setText('lt-primary-align-label', isBibleTarget ? 'Ref. X Align' : (isSongsTarget ? 'Text X Align' : 'X Align'));
      setText('full-content-align-label', isBibleTarget ? 'Verse X Align' : 'Text X Align');
      setText('verse-shadow-label', isBibleTarget ? 'Verse Shadow' : (isSongsTarget ? 'Song Shadow' : 'Verse/Song Shadow'));
      if (nextTabId) switchSettingsTab(nextTabId);
    }

    function applyProjectionSettingsSnapshot(profile, opts = {}) {
      const targetTab = SETTINGS_TARGET_TABS.includes(opts.tab) ? opts.tab : sidebarTab;
      const next = normalizeProjectionSettingsSnapshot(profile, captureProjectionSettingsSnapshot());
      if (next.fontFamily) {
        const fontFamilyEl = document.getElementById('font-family');
        if (fontFamilyEl) fontFamilyEl.value = next.fontFamily;
        if (typeof renderFontFamilyOptions === 'function') renderFontFamilyOptions(next.fontFamily);
      }
      if (next.fontWeight && document.getElementById('font-weight')) document.getElementById('font-weight').value = next.fontWeight;
      if (next.fontSizeFull != null && document.getElementById('font-size-val')) document.getElementById('font-size-val').value = next.fontSizeFull;
      if (typeof next.fullTextTransform !== 'undefined') updateFullTextTransformValue(next.fullTextTransform);
      if (typeof next.fullRefTextTransform !== 'undefined') updateReferenceTextTransformValue('full', next.fullRefTextTransform);
      ltFontSongs = (next.ltFontSongs != null) ? Number(next.ltFontSongs) : ltFontSongs;
      ltFontBible = (next.ltFontBible != null) ? Number(next.ltFontBible) : ltFontBible;
      ltFontCustom = (next.ltFontCustom != null) ? Number(next.ltFontCustom) : ltFontCustom;
      if (next.refFontSize != null && document.getElementById('ref-font-size-val')) document.getElementById('ref-font-size-val').value = next.refFontSize;
      if (next.ltRefFontSize != null && document.getElementById('ref-font-size-lt-val')) document.getElementById('ref-font-size-lt-val').value = next.ltRefFontSize;
      ltRefFontSize = Number(next.ltRefFontSize || ltRefFontSize);
      if (next.lineHeightFull != null && document.getElementById('line-height-full')) document.getElementById('line-height-full').value = next.lineHeightFull;
      if (next.lineHeightLT != null && document.getElementById('line-height-lt')) document.getElementById('line-height-lt').value = next.lineHeightLT;
      if (next.padLRFull != null && document.getElementById('pad-lr-full')) {
        document.getElementById('pad-lr-full').value = next.padLRFull;
      } else if (next.padLR != null && document.getElementById('pad-lr-full')) {
        document.getElementById('pad-lr-full').value = next.padLR;
      }
      if (next.padLRLT != null && document.getElementById('pad-lr-lt')) {
        document.getElementById('pad-lr-lt').value = next.padLRLT;
      } else if (next.padLR != null && document.getElementById('pad-lr-lt')) {
        document.getElementById('pad-lr-lt').value = next.padLR;
      }
      if (next.textColor && document.getElementById('text-color')) document.getElementById('text-color').value = next.textColor;
      if (next.textColor && document.getElementById('text-color-hex')) document.getElementById('text-color-hex').value = String(next.textColor).toUpperCase();
      if (next.refColor && document.getElementById('ref-color')) document.getElementById('ref-color').value = next.refColor;
      if (next.refColor && document.getElementById('ref-color-hex')) document.getElementById('ref-color-hex').value = String(next.refColor).toUpperCase();
      if (next.refBgColor && document.getElementById('ref-bg-color')) document.getElementById('ref-bg-color').value = next.refBgColor;
      if (next.refBgColor && document.getElementById('ref-bg-color-hex')) document.getElementById('ref-bg-color-hex').value = String(next.refBgColor).toUpperCase();
      if (next.linesPerPage != null) linesPerPage = Math.max(1, Math.min(getMaxLinesForCurrentTab(targetTab), Number(next.linesPerPage) || 1));
      if (next.activeRatio) activeRatio = ['16-9', 'sd-left', 'sd-right', 'custom'].indexOf(next.activeRatio) !== -1 ? next.activeRatio : 'full';
      if (next.sdWidth != null) sdWidth = Math.max(15, Math.min(90, Number(next.sdWidth) || 50));
      if (next.sdMargin != null) sdMargin = Math.max(0, Math.min(40, Number(next.sdMargin) || 0));
      if (next.sdMarginTop != null) sdMarginTop = Math.max(0, Math.min(40, Number(next.sdMarginTop) || 0));
      if (next.sdMarginRight != null) sdMarginRight = Math.max(0, Math.min(40, Number(next.sdMarginRight) || 0));
      else if (next.sdMargin != null) sdMarginRight = sdMargin;
      if (next.sdMarginBottom != null) sdMarginBottom = Math.max(0, Math.min(40, Number(next.sdMarginBottom) || 0));
      if (next.sdMarginLeft != null) sdMarginLeft = Math.max(0, Math.min(40, Number(next.sdMarginLeft) || 0));
      else if (next.sdMargin != null) sdMarginLeft = sdMargin;
      if (next.sdSlant != null) sdSlant = Math.max(-40, Math.min(40, Number(next.sdSlant) || 0));
      if (next.sdStrokeWidth != null) sdStrokeWidth = Math.max(0, Math.min(40, Number(next.sdStrokeWidth) || 0));
      if (next.sdStrokeColor != null) sdStrokeColor = String(next.sdStrokeColor);
      if (typeof next.ltTextTransform !== 'undefined') updateLtTextTransformValue(next.ltTextTransform, { markUser: true });
      if (typeof next.ltRefTextTransform !== 'undefined') updateReferenceTextTransformValue('lt', next.ltRefTextTransform);
      if (next.showVersion != null && document.getElementById('show-version')) document.getElementById('show-version').checked = !!next.showVersion;
      if (next.showVerseNos != null && document.getElementById('show-verse-nos')) document.getElementById('show-verse-nos').checked = !!next.showVerseNos;
      if (next.shortenBibleVersions != null && document.getElementById('shorten-bible-versions')) document.getElementById('shorten-bible-versions').checked = !!next.shortenBibleVersions;
      if (next.shortenBibleBooks != null && document.getElementById('shorten-bible-books')) document.getElementById('shorten-bible-books').checked = !!next.shortenBibleBooks;
      autoAdjustLtHeight = next.autoAdjustLtHeight != null ? !!next.autoAdjustLtHeight : autoAdjustLtHeight;
      if (document.getElementById('auto-adjust-lt-height')) document.getElementById('auto-adjust-lt-height').checked = autoAdjustLtHeight;
      if (next.autoResizeFull && document.getElementById('auto-resize-full')) document.getElementById('auto-resize-full').value = next.autoResizeFull;
      if (next.autoResizeLT && document.getElementById('auto-resize-lt')) document.getElementById('auto-resize-lt').value = next.autoResizeLT;
      if (next.refPositionFull && document.getElementById('ref-position-full')) document.getElementById('ref-position-full').value = next.refPositionFull;
      if (next.fullOffsetX != null && document.getElementById('full-offset-x')) document.getElementById('full-offset-x').value = next.fullOffsetX;
      if (next.fullOffsetY != null && document.getElementById('full-offset-y')) document.getElementById('full-offset-y').value = next.fullOffsetY;
      if (typeof renderLtPresetOptions === 'function') renderLtPresetOptions(next.ltPresetSelection || 'default', targetTab);
      if (typeof updateLtPresetUpdateLiveState === 'function') {
        updateLtPresetUpdateLiveState(next.ltPresetUpdatesLive !== false);
      }
      if (next.ltWidthPct != null && document.getElementById('lt-width-pct')) document.getElementById('lt-width-pct').value = next.ltWidthPct;
      if (next.ltWidthPct != null && document.getElementById('lt-width-pct-value')) document.getElementById('lt-width-pct-value').textContent = `${next.ltWidthPct}%`;
      if (next.ltScalePct != null && document.getElementById('lt-scale-pct')) document.getElementById('lt-scale-pct').value = next.ltScalePct;
      if (next.ltScalePct != null && document.getElementById('lt-scale-pct-value')) document.getElementById('lt-scale-pct-value').textContent = `${next.ltScalePct}%`;
      if (next.ltOffsetX != null && document.getElementById('lt-offset-x')) document.getElementById('lt-offset-x').value = next.ltOffsetX;
      if (next.ltOffsetY != null && document.getElementById('lt-offset-y')) document.getElementById('lt-offset-y').value = next.ltOffsetY;
      if (next.ltBorderRadius != null && document.getElementById('lt-border-radius')) document.getElementById('lt-border-radius').value = next.ltBorderRadius;
      if (next.ltBorderRadius != null && document.getElementById('lt-border-radius-value')) document.getElementById('lt-border-radius-value').textContent = `${next.ltBorderRadius}px`;
      if (next.bgType && document.getElementById('bg-type')) document.getElementById('bg-type').value = next.bgType;
      if (next.bgImageSource && document.getElementById('bg-image-source')) document.getElementById('bg-image-source').value = next.bgImageSource;
      if (Object.prototype.hasOwnProperty.call(next, 'bgImageUrl') && document.getElementById('bg-image-url')) document.getElementById('bg-image-url').value = next.bgImageUrl || '';
      if (Object.prototype.hasOwnProperty.call(next, 'bgUploadDataUrl')) bgUploadDataUrl = next.bgUploadDataUrl || null;
      if (next.bgVideoSource && document.getElementById('bg-video-source')) document.getElementById('bg-video-source').value = next.bgVideoSource;
      if (Object.prototype.hasOwnProperty.call(next, 'bgVideoUrl') && document.getElementById('bg-video-url')) document.getElementById('bg-video-url').value = next.bgVideoUrl || '';
      if (Object.prototype.hasOwnProperty.call(next, 'bgVideoUploadDataUrl')) bgVideoUploadDataUrl = next.bgVideoUploadDataUrl || null;
      if (next.bgVideoLoop != null && document.getElementById('bg-video-loop')) document.getElementById('bg-video-loop').checked = !!next.bgVideoLoop;
      if (next.bgVideoSpeed != null && document.getElementById('bg-video-speed')) document.getElementById('bg-video-speed').value = next.bgVideoSpeed;
      if (next.bgColor && document.getElementById('bg-color-quick')) document.getElementById('bg-color-quick').value = next.bgColor;
      if (next.bgGradientShadow && document.getElementById('bg-color-shadow')) {
        bgGradientShadow = next.bgGradientShadow;
        document.getElementById('bg-color-shadow').value = next.bgGradientShadow;
      }
      if (next.bgGradientHighlight && document.getElementById('bg-color-highlight')) {
        bgGradientHighlight = next.bgGradientHighlight;
        document.getElementById('bg-color-highlight').value = next.bgGradientHighlight;
      }
      if (typeof next.bgMode !== 'undefined' && typeof setBgMode === 'function') {
        setBgMode(next.bgMode, { silent: true });
      } else if (typeof updateBgModeUi === 'function') {
        updateBgModeUi();
      }
      if (next.bgBlur != null && document.getElementById('bg-blur')) document.getElementById('bg-blur').value = next.bgBlur;
      if (next.bgEdgeFix != null && document.getElementById('bg-edge-fix')) document.getElementById('bg-edge-fix').value = next.bgEdgeFix ? 'on' : 'off';
      if (next.bgOpacityFull != null) bgOpacityFull = Math.max(0, Math.min(100, Number(next.bgOpacityFull) || 0));
      if (next.bgOpacityLT != null) bgOpacityLT = Math.max(0, Math.min(100, Number(next.bgOpacityLT) || 0));
      if (next.bgY != null && document.getElementById('bg-y')) document.getElementById('bg-y').value = next.bgY;
      if (next.bgToggle != null && document.getElementById('bg-toggle')) document.getElementById('bg-toggle').checked = !!next.bgToggle;
      if (next.animateBgTransitions != null && document.getElementById('animate-bg-transitions')) document.getElementById('animate-bg-transitions').checked = !!next.animateBgTransitions;
      if (next.bgGradientAngle != null && document.getElementById('bg-gradient-angle')) document.getElementById('bg-gradient-angle').value = next.bgGradientAngle;
      if (document.getElementById('bg-upload-hint')) {
        document.getElementById('bg-upload-hint').innerText = bgUploadDataUrl ? t('settings_image_selected') : t('settings_no_image_selected');
      }
      if (document.getElementById('bg-video-upload-hint')) {
        document.getElementById('bg-video-upload-hint').innerText = bgVideoUploadDataUrl ? t('settings_video_selected') : t('settings_no_video_selected');
      }
      if (typeof handleBgTypeChange === 'function') handleBgTypeChange();
      if (typeof syncBgOpacitySlider === 'function') syncBgOpacitySlider();
      fullRefHAlign = next.hAlignFullRef || fullRefHAlign;
      fullHAlign = next.hAlignFull || fullHAlign;
      fullVAlign = next.vAlignFull || fullVAlign;
      ltHAlignSongs = next.hAlignLTSongs || ltHAlignSongs;
      ltVAlignSongs = next.vAlignLTSongs || ltVAlignSongs;
      ltAnchorMode = next.ltAnchorMode === 'top' ? 'top' : 'bottom';
      ltHAlignBible = next.hAlignLTBible || ltHAlignBible;
      ltVAlignBible = next.vAlignLTBible || ltVAlignBible;
      ltHAlignBibleVerse = next.hAlignLTBibleVerse || ltHAlignBibleVerse;
      if (next.refBgEnabled != null) setRefBgEnabled(!!next.refBgEnabled, { silent: true });
      if (next.referenceShadowEnabled != null) setReferenceShadowEnabled(!!next.referenceShadowEnabled, { silent: true });
      if (next.verseShadowEnabled != null) setVerseShadowEnabled(!!next.verseShadowEnabled, { silent: true });
      if (next.referenceTextCapitalized != null) setReferenceCapitalized(!!next.referenceTextCapitalized, { silent: true });
      if (next.dualVersionModeEnabled != null) setDualVersionModeEnabled(!!next.dualVersionModeEnabled, { silent: true });
      if (Object.prototype.hasOwnProperty.call(next, 'dualVersionSecondaryId')) setDualVersionSecondaryId(next.dualVersionSecondaryId || null, { silent: true });
      setLtFontInputValue(getEffectiveLtFont());
      updateFullAlignButtons();
      updateLtAlignButtons();
      if (typeof refreshSliderPaint === 'function') {
        refreshSliderPaint([
          'line-height-full',
          'line-height-lt',
          'pad-lr-full',
          'pad-lr-lt',
          'lt-width-pct',
          'lt-scale-pct',
          'lt-border-radius',
          'bg-blur',
          'bg-opacity-full',
          'bg-opacity-lt',
          'bg-y',
          'bg-gradient-angle',
          'bg-video-speed'
        ]);
      }
      if (typeof syncLtPresetSelectionToCurrentValues === 'function') {
        syncLtPresetSelectionToCurrentValues(targetTab);
      }
      document.querySelectorAll('#line-picker .seg-btn').forEach((b) => b.classList.toggle('active', b.id === 'line-' + linesPerPage));
      document.getElementById('ratio-full')?.classList.toggle('active', activeRatio === 'full');
      document.getElementById('ratio-lt')?.classList.toggle('active', activeRatio === '16-9');
      document.getElementById('ratio-custom')?.classList.toggle('active', false);
      updateLinePickerAvailability();
      updateCustomModeAvailability();
      updateTextEditorModeAvailability();
      if (opts.triggerChange && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function applyProjectionSettingsProfileForTab(tab, opts = {}) {
      if (!SETTINGS_TARGET_TABS.includes(tab)) return false;
      // Editing a screen → load THAT output's effective design into the controls AND globals.
      if ((tab === 'bible' || tab === 'songs') && bspSettingsOutputIsScreen()) {
        bspLoadSettingsFromOutput(settingsTargetOutput, tab);
        return true;
      }
      applyProjectionSettingsSnapshot(getProjectionSettingsSnapshotForTab(tab), { ...opts, tab });
      // Option B: loading the BASE (Live) must also put the runtime globals back on the on-air
      // kind's base. Otherwise, after editing a screen (where the globals hold THAT screen's
      // design), the live render would keep following the screen once it is no longer targeted.
      applyProjectionRuntimeSnapshot(getProjectionSettingsSnapshotForTab(sidebarTab));
      return true;
    }

    function setSettingsTargetTab(target, opts = {}) {
      saveProjectionSettingsProfileForTab(getEffectiveSettingsTargetTab());
      settingsTargetTab = normalizeSettingsTargetTab(target);
      updateSettingsTargetControl();
      applyProjectionSettingsProfileForTab(getEffectiveSettingsTargetTab(), { triggerChange: !!opts.triggerChange });
      // When a screen is targeted (Option B) the globals intentionally hold that screen's
      // design, and the live output is protected inside pushLiveUpdate — so we must NOT reset
      // the globals to the on-air base here, or the next capture would clobber the screen.
      const isLockedInactiveTarget = settingsTargetTab !== 'follow' && getEffectiveSettingsTargetTab() !== sidebarTab;
      if (isLockedInactiveTarget && !bspSettingsOutputIsScreen()) {
        applyProjectionRuntimeSnapshot(getProjectionSettingsSnapshotForTab(sidebarTab));
      }
      // The advanced pages (SD, contour, stroke, ref border) are per-kind → re-render on tab.
      if (typeof bspRenderSettingsDesignPages === 'function') bspRenderSettingsDesignPages();
      if (!opts.silent) saveToStorageDebounced();
    }

    function handleSettingsTargetChange(target) {
      setSettingsTargetTab(target || 'bible');
    }

    // ═══ Per-output routing of the Settings modal (output × kind) ═══
    // When settingsTargetOutput names a screen, the SAME Settings controls edit that output's
    // design override instead of the base. The base (profiles[bible/songs]) is never written
    // while a screen is targeted, so the live/OBS render — which reads the base profile, not
    // the DOM — is unaffected. When settingsTargetOutput is '' everything is exactly as before.
    function bspSettingsOutputIsScreen() {
      return !!settingsTargetOutput && (typeof bspScreensAdded !== 'undefined') &&
        Array.isArray(bspScreensAdded) && bspScreensAdded.some((s) => s.id === settingsTargetOutput);
    }

    // Keys the general capture MUST NOT write into a screen override. They have no Settings
    // DOM control — they live only in runtime globals, which bspLoadSettingsFromOutput resets
    // to the BASE (to keep the live output correct). Capturing them would write the base value
    // over the screen's own (set by the dedicated advanced pages / mode selector) — the cause
    // of "the screen reverts to the Live design". These keys are written DIRECTLY, per output,
    // by bspSettingsApplyDesignKey / bspSettingsApplyMode, so the capture leaves them alone.
    const BSP_SETTINGS_OUTPUT_SKIP_KEYS = {
      activeRatio: 1, linesPerPage: 1,
      sdWidth: 1, sdMargin: 1, sdMarginTop: 1, sdMarginRight: 1, sdMarginBottom: 1, sdMarginLeft: 1,
      sdSlant: 1, sdStrokeWidth: 1, sdStrokeColor: 1,
      verseContourEnabled: 1, verseContourColor: 1, verseContourSize: 1,
      songContourEnabled: 1, songContourColor: 1, songContourSize: 1,
      refContourEnabled: 1, refContourColor: 1, refContourSize: 1,
      verseStrokeEnabled: 1, verseStrokeColor: 1, verseStrokeSize: 1,
      songStrokeEnabled: 1, songStrokeColor: 1, songStrokeSize: 1,
      refStrokeEnabled: 1, refStrokeColor: 1, refStrokeSize: 1,
      refBorderWidth: 1, refBorderColor: 1,
      // Reference box style: written directly by the per-output reference controls
      // (bold/italic in Typography ; box on/off + colour + radius + border + underline in the
      // Background tab, bspRenderSettingsBgRef), so the general capture must leave them alone —
      // same contract as the border/contour/stroke. refBgColor is here too now that the box
      // colour is driven directly per output (its legacy #ref-bg-color input stays hidden).
      refBgEnabled: 1, refBgColor: 1, refBorderRadius: 1, refBold: 1, refItalic: 1,
      refUnderlineEnabled: 1, refUnderlineColor: 1, refUnderlineThickness: 1
    };

    // Capture the current controls into the targeted output's override, kind-suffixed for the
    // per-kind keys. Keys equal to the inherited base are dropped so the override stays minimal.
    // The advanced/global-only keys above are skipped — they are written directly per output.
    function bspSaveSettingsToOutput(outputId, kind) {
      if (typeof bspGetOutputDesign !== 'function' || typeof bspReplaceOutputDesign !== 'function') return;
      const snap = normalizeProjectionSettingsSnapshot(captureProjectionSettingsSnapshot(), {});
      const kindBase = (typeof bspScreenDesignBaseForKind === 'function') ? bspScreenDesignBaseForKind(kind) : {};
      const next = { ...(bspGetOutputDesign(outputId) || {}) };
      PROJECTION_SETTINGS_PROFILE_KEYS.forEach((key) => {
        if (BSP_SETTINGS_OUTPUT_SKIP_KEYS[key]) return; // written directly, never via capture
        if (typeof snap[key] === 'undefined') return;
        const split = BSP_KIND_SPLIT_KEYS.indexOf(key) !== -1;
        const sk = split ? (key + '__' + kind) : key;
        if (snap[key] == null || JSON.stringify(snap[key]) === JSON.stringify(kindBase[key])) delete next[sk];
        else next[sk] = snap[key];
      });
      bspReplaceOutputDesign(outputId, next);
    }

    // Load the targeted output's effective design (base + override, kind-resolved) into the
    // Settings controls AND into the runtime globals (Option B). Setting the globals to the
    // SCREEN — not the base — is what lets every ordinary Settings control (alignment, font,
    // size, format, case, reference box, padding, shadow…) edit this output through the normal
    // capture path, with no per-control wiring. The live/OBS render stays correct because
    // pushLiveUpdate rebuilds the base from the base profile whenever a screen is targeted.
    // The advanced/global-only keys in the skip list are excluded here: they own dedicated
    // per-output controls (mode selector, SD / contour / stroke / border pages) that read and
    // write the override directly, so their globals are intentionally left on the live/base.
    function bspLoadSettingsFromOutput(outputId, kind) {
      const kindBase = (typeof bspScreenDesignBaseForKind === 'function') ? bspScreenDesignBaseForKind(kind) : {};
      const eff = {};
      PROJECTION_SETTINGS_PROFILE_KEYS.forEach((key) => {
        if (BSP_SETTINGS_OUTPUT_SKIP_KEYS[key]) return;
        const split = BSP_KIND_SPLIT_KEYS.indexOf(key) !== -1;
        eff[key] = split
          ? bspKindEffective(outputId, key, kind, kindBase)
          : bspScreenEffective(outputId, key, kindBase);
      });
      applyProjectionSettingsSnapshot(eff, { tab: kind, triggerChange: false });
      applyProjectionRuntimeSnapshot(eff);
    }

    function handleSettingsOutputChange(value) {
      // Persist the CURRENT target first (routes to base or the current screen override).
      saveProjectionSettingsProfileForTab(getEffectiveSettingsTargetTab());
      const v = String(value || '');
      settingsTargetOutput = (v && v !== 'obs' && typeof bspScreensAdded !== 'undefined' &&
        bspScreensAdded.some((s) => s.id === v)) ? v : '';
      applyProjectionSettingsProfileForTab(getEffectiveSettingsTargetTab(), { triggerChange: false });
      updateSettingsOutputSelect();
      if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
    }

    // Which design kind the Settings modal is currently editing (schedule has no design → bible).
    function bspSettingsDesignKind() {
      const k = (typeof getEffectiveSettingsTargetTab === 'function') ? getEffectiveSettingsTargetTab() : 'bible';
      return (k === 'songs') ? 'songs' : 'bible';
    }

    // Read/write a design key for the CURRENT Settings target (Live = base profile for the
    // kind; a screen = its override, kind-suffixed for per-kind keys). Same routing the two
    // chokepoints use — so the dynamically-rendered advanced pages (SD, contour, stroke,
    // reference border) behave exactly like the rest of Settings, per output.
    function bspSettingsEffectiveDesignKey(baseKey, kind) {
      kind = (kind === 'songs') ? 'songs' : 'bible';
      const kindBase = (typeof bspScreenDesignBaseForKind === 'function') ? bspScreenDesignBaseForKind(kind) : {};
      const split = BSP_KIND_SPLIT_KEYS.indexOf(baseKey) !== -1;
      if (bspSettingsOutputIsScreen()) {
        return split ? bspKindEffective(settingsTargetOutput, baseKey, kind, kindBase)
                     : bspScreenEffective(settingsTargetOutput, baseKey, kindBase);
      }
      return kindBase[baseKey];
    }

    function bspSettingsApplyDesignKey(baseKey, value, kind) {
      kind = (kind === 'songs') ? 'songs' : 'bible';
      const split = BSP_KIND_SPLIT_KEYS.indexOf(baseKey) !== -1;
      if (bspSettingsOutputIsScreen()) {
        const sk = split ? (baseKey + '__' + kind) : baseKey;
        const kindBase = (typeof bspScreenDesignBaseForKind === 'function') ? bspScreenDesignBaseForKind(kind) : {};
        const next = { ...(bspGetOutputDesign(settingsTargetOutput) || {}) };
        if (value == null || JSON.stringify(value) === JSON.stringify(kindBase[baseKey])) delete next[sk];
        else next[sk] = value;
        bspReplaceOutputDesign(settingsTargetOutput, next); // persists + schedules live update
      } else {
        const profiles = ensureProjectionSettingsProfiles();
        const prof = normalizeProjectionSettingsSnapshot(profiles[kind], {});
        prof[baseKey] = value;
        profiles[kind] = prof;
        // Re-sync the on-air kind's runtime globals so a base edit shows live immediately.
        if (typeof applyProjectionRuntimeSnapshot === 'function') {
          // INVARIANT : régler un paramètre NON-mode (Inner-edge slant, largeur, marges,
          // trait…) ne doit JAMAIS changer le mode FS/LT/SD. applyProjectionRuntimeSnapshot
          // réécrit `activeRatio` depuis le profil du tab — qui peut avoir dérivé du mode réel
          // (mode posé via setRatio/zone du bas, profil pas encore synchronisé). Résultat :
          // `activeRatio` retombait en 'full', puis le prochain projectLive faisait
          // `liveRatio = activeRatio` → retour en Fullscreen quelques secondes après. On
          // sauvegarde et restaure le mode autour du snapshot (sauf si on change activeRatio).
          const savedActive = (typeof activeRatio !== 'undefined') ? activeRatio : undefined;
          const savedLive = (typeof liveRatio !== 'undefined') ? liveRatio : undefined;
          applyProjectionRuntimeSnapshot(getProjectionSettingsSnapshotForTab(sidebarTab));
          if (baseKey !== 'activeRatio') {
            if (savedActive !== undefined) activeRatio = savedActive;
            if (savedLive !== undefined) liveRatio = savedLive;
          }
        }
        if (typeof scheduleLiveUpdate === 'function') scheduleLiveUpdate();
        if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      }
    }

    // ===== SOURCE UNIQUE DU MODE FS/LT/SD (barre du bas ⇄ Settings) =====
    // Les deux sélecteurs de mode (la zone en bas de l'interface principale ET le segment
    // Mode des Settings) passent par ICI, pour qu'ils restent toujours synchrones.
    //
    // Le bug « ça marche pas / conflit » venait d'un DOUBLE stockage du mode de la sortie
    // Live : la barre du bas écrivait une surcharge `activeRatio__<kind>` sur la sortie
    // 'obs', tandis que Settings écrivait le `activeRatio` du profil de base. Les deux
    // divergeaient et se réappliquaient l'un par-dessus l'autre (retour en arrière à
    // l'ouverture des Settings, etc.). On unifie : pour Live, le mode vit UNIQUEMENT dans le
    // profil de base ; pour un écran, dans sa surcharge. Une seule vérité, lue par les deux.
    function bspApplyKindModeForOutput(targetId, kind, mode) {
      kind = (kind === 'songs') ? 'songs' : 'bible';
      if (['full', '16-9', 'sd-left', 'sd-right'].indexOf(mode) === -1) return;
      const isScreen = !!(targetId && targetId !== 'obs' && typeof bspScreensAdded !== 'undefined' &&
        Array.isArray(bspScreensAdded) && bspScreensAdded.some((s) => s && s.id === targetId));

      if (isScreen) {
        // Écran : surcharge activeRatio__<kind> (retombe sur le profil si égal à la base).
        const kindBase = (typeof bspScreenDesignBaseForKind === 'function') ? bspScreenDesignBaseForKind(kind) : {};
        const sk = 'activeRatio__' + kind;
        const next = { ...((typeof bspGetOutputDesign === 'function' && bspGetOutputDesign(targetId)) || {}) };
        if (mode === (kindBase.activeRatio || 'full')) delete next[sk]; else next[sk] = mode;
        if (typeof bspReplaceOutputDesign === 'function') bspReplaceOutputDesign(targetId, next);
      } else {
        // Live / OBS : SEULE source = le profil de base du kind + pilotage réel de la
        // projection. Pas de surcharge 'obs' pour le mode (source du conflit).
        const profiles = ensureProjectionSettingsProfiles();
        const prof = normalizeProjectionSettingsSnapshot(profiles[kind], {});
        prof.activeRatio = mode;
        profiles[kind] = prof;
        if (typeof bspDriveObsLiveMode === 'function') bspDriveObsLiveMode(kind, mode);
        // Empêcher la désync avec l'état workspace « focused » : régler le mode d'un kind qui
        // n'est pas celui affiché ne passe pas par setRatio, donc l'état focused de ce kind
        // resterait sur l'ancien mode et le ferait retomber en FS au retour sur l'onglet.
        if (typeof bspSyncFocusedWorkspaceRatioForTab === 'function') bspSyncFocusedWorkspaceRatioForTab(kind, mode);
        // Migration : purge une éventuelle vieille surcharge 'obs' de mode qui shadowerait.
        const obsOv = (typeof bspGetOutputDesign === 'function') ? bspGetOutputDesign('obs') : null;
        if (obsOv && (obsOv['activeRatio__' + kind] != null || obsOv.activeRatio != null)) {
          const n = { ...obsOv }; delete n['activeRatio__' + kind]; delete n.activeRatio;
          if (typeof bspReplaceOutputDesign === 'function') bspReplaceOutputDesign('obs', n);
        }
        if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      }

      // Re-render les DEUX sélecteurs : ils lisent désormais la même source.
      if (typeof bspRenderScreenModeZone === 'function') bspRenderScreenModeZone();
      if (typeof bspRenderSettingsModeSelector === 'function') bspRenderSettingsModeSelector();
      if (typeof bspRenderSettingsDesignPages === 'function') bspRenderSettingsDesignPages();
      if (typeof bspIsDesignModalOpen === 'function' && bspIsDesignModalOpen() &&
          typeof bspRenderScreenDesignPanel === 'function') bspRenderScreenDesignPanel();
      if (typeof isLive !== 'undefined' && isLive && typeof scheduleLiveUpdate === 'function') scheduleLiveUpdate();
    }

    // Settings → délègue à la source unique (cible = sortie sélectionnée dans Settings).
    function bspSettingsApplyMode(mode) {
      bspApplyKindModeForOutput(settingsTargetOutput || 'obs', bspSettingsDesignKind(), mode);
    }

    // Populates the output <select> (Live + every screen). Called on modal open AND whenever
    // the screens bar re-renders, so adding/removing a screen updates it live. A target whose
    // screen was removed falls back to Live.
    function updateSettingsOutputSelect() {
      const sel = document.getElementById('settings-target-output');
      if (!sel) return;
      const screens = (typeof bspScreensAdded !== 'undefined' && Array.isArray(bspScreensAdded)) ? bspScreensAdded : [];
      if (settingsTargetOutput && !screens.some((s) => s.id === settingsTargetOutput)) {
        // L'écran ciblé vient d'être supprimé. En Option B les globales ET les contrôles DOM
        // portaient SON design ; on recharge la base du kind à l'antenne dans les DEUX (la
        // capture lit d'abord le DOM, ex. le select de casse réf.), sinon la prochaine capture
        // (cible = Live) écrirait le design de l'écran disparu dans le profil de base.
        settingsTargetOutput = '';
        if (typeof getProjectionSettingsSnapshotForTab === 'function') {
          const baseSnap = getProjectionSettingsSnapshotForTab(sidebarTab);
          if (typeof applyProjectionSettingsSnapshot === 'function') applyProjectionSettingsSnapshot(baseSnap, { tab: sidebarTab });
          if (typeof applyProjectionRuntimeSnapshot === 'function') applyProjectionRuntimeSnapshot(baseSnap);
        }
      }
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const liveLabel = (typeof t === 'function' && t('settings_output_live')) || 'Live';
      const opts = ['<option value="">' + esc(liveLabel) + '</option>'];
      screens.forEach((s) => { opts.push('<option value="' + esc(s.id) + '">' + esc(s.label || s.id) + '</option>'); });
      sel.innerHTML = opts.join('');
      sel.value = settingsTargetOutput || '';
      if (typeof bspRenderSettingsDesignPages === 'function') bspRenderSettingsDesignPages();
      // Drive the prominent bar: tint + hint change depending on Live (base) vs a screen.
      const bar = document.getElementById('settings-output-bar');
      const hintEl = document.getElementById('settings-output-hint');
      const onScreen = bspSettingsOutputIsScreen();
      if (bar) bar.setAttribute('data-scope', onScreen ? 'screen' : 'live');
      if (hintEl) {
        hintEl.textContent = onScreen
          ? ((typeof t === 'function' && t('settings_output_hint_screen')) || "Réglages propres à cet écran.")
          : ((typeof t === 'function' && t('settings_output_hint_live')) || "Design de base — s'applique à toute sortie sans réglage propre.");
      }
    }

    function getSetlistSettingsSnapshot() {
      const autoGoLiveToggle = document.getElementById('setlist-auto-go-live');
      const advancePreviewToggle = document.getElementById('setlist-advance-preview');
      return {
        autoGoLiveOnSelect: autoGoLiveToggle ? !!autoGoLiveToggle.checked : !!setlistSettings.autoGoLiveOnSelect,
        advancePreviewAfterLive: advancePreviewToggle ? !!advancePreviewToggle.checked : !!setlistSettings.advancePreviewAfterLive
      };
    }

    function applySetlistSettingsSnapshot(raw) {
      const source = (raw && typeof raw === 'object') ? raw : {};
      setlistSettings = {
        autoGoLiveOnSelect: source.autoGoLiveOnSelect === true,
        advancePreviewAfterLive: source.advancePreviewAfterLive !== false
      };
      const autoGoLiveToggle = document.getElementById('setlist-auto-go-live');
      if (autoGoLiveToggle) autoGoLiveToggle.checked = !!setlistSettings.autoGoLiveOnSelect;
      const advancePreviewToggle = document.getElementById('setlist-advance-preview');
      if (advancePreviewToggle) advancePreviewToggle.checked = !!setlistSettings.advancePreviewAfterLive;
      return { ...setlistSettings };
    }


    // ===== STATE =====
    function getUiSnapshot() {
      if (isFocusedWorkspaceMode()) {
        saveFocusedWorkspaceControlsForTab(sidebarTab);
      }
      saveProjectionSettingsProfileForTab(getEffectiveSettingsTargetTab());
      return {
        language: currentLanguage,
        fontFamily: document.getElementById('font-family').value,
        fontWeight: document.getElementById('font-weight').value,
        fontSizeFull: document.getElementById('font-size-val').value,
        ltFontSongs, ltFontBible, ltFontCustom,
        refFontSize: document.getElementById('ref-font-size-val').value,
        refBgColor: document.getElementById('ref-bg-color').value,
        autoAdjustLtHeight: document.getElementById('auto-adjust-lt-height').checked,
        ltStyle,
        songTransitionType: document.getElementById('song-transition-type').value,
        songTransitionDuration: document.getElementById('song-transition-duration').value,
        animateBgTransitions: document.getElementById('animate-bg-transitions').checked,
        ltStyles,
        customFonts,
        bgType: document.getElementById('bg-type').value,
        bgImageSource: document.getElementById('bg-image-source').value,
        bgImageUrl: document.getElementById('bg-image-url').value,
        bgUploadDataUrl,
        bgVideoSource: document.getElementById('bg-video-source').value,
        bgVideoUrl: document.getElementById('bg-video-url').value,
        bgVideoUploadDataUrl,
        bgVideoLoop: document.getElementById('bg-video-loop').checked,
        bgVideoSpeed: document.getElementById('bg-video-speed').value,
        bgMode,
        bgColor: document.getElementById('bg-color-quick').value,
        bgGradientShadow: document.getElementById('bg-color-shadow').value,
        bgGradientHighlight: document.getElementById('bg-color-highlight').value,
        bgBlur: document.getElementById('bg-blur').value,
        bgEdgeFix: document.getElementById('bg-edge-fix').value,
        bgOpacity: getActiveBgOpacityValue(),
        bgOpacityFull,
        bgOpacityLT,
        bgY: document.getElementById('bg-y').value,
        bgGradientAngle: document.getElementById('bg-gradient-angle')?.value || 135,
        textX: document.getElementById('text-x')?.value ?? 0,
        textY: document.getElementById('text-y')?.value ?? 860,
        padLR: document.getElementById('pad-lr-lt')?.value ?? 5,
        padLRFull: document.getElementById('pad-lr-full')?.value ?? 5,
        padLRLT: document.getElementById('pad-lr-lt')?.value ?? 5,
        padB: document.getElementById('pad-b')?.value ?? 0,
        fullTextTransform: document.getElementById('full-text-transform')?.value || fullTextTransform,
        ltTextTransform: document.getElementById('lt-text-transform')?.value || 'uppercase',
        showVersion: document.getElementById('show-version').checked,
        shortenBibleVersions: document.getElementById('shorten-bible-versions')?.checked,
        shortenBibleBooks: document.getElementById('shorten-bible-books')?.checked,
        showSongSolfaNotes: document.getElementById('show-song-solfa-notes')?.checked !== false,
        showSongCategoryName: document.getElementById('show-song-category-name')?.checked !== false,
        displaySongSections: document.getElementById('display-song-sections')?.checked === true,
        songBilingualEnabled: document.getElementById('song-bilingual-enabled')?.checked === true,
        songDisplayMode: document.getElementById('song-display-mode')?.value || DEFAULT_SONG_BILINGUAL_SETTINGS.displayMode,
        songTranslationMode: document.getElementById('song-translation-mode')?.value || DEFAULT_SONG_BILINGUAL_SETTINGS.translationMode,
        songAutoTranslateOnImport: document.getElementById('song-auto-translate-import')?.checked !== false,
        songAutoTranslateOnOpen: document.getElementById('song-auto-translate-open')?.checked !== false,
        songTargetLanguage: (document.getElementById('song-translation-language')?.value || DEFAULT_SONG_BILINGUAL_SETTINGS.targetLanguage).trim(),
        songSourceLanguage: (document.getElementById('song-translation-source-language')?.value || DEFAULT_SONG_BILINGUAL_SETTINGS.sourceLanguage).trim(),
        songSecondaryFontScale: document.getElementById('song-secondary-font-scale')?.value || DEFAULT_SONG_BILINGUAL_SETTINGS.secondaryFontScale,
        songCacheTranslationsLocally: document.getElementById('song-cache-translations')?.checked !== false,
        songFreeTranslationApiUrl: (document.getElementById('song-free-translation-api-url')?.value || DEFAULT_SONG_BILINGUAL_SETTINGS.freeTranslationApiUrl).trim(),
        songTranslationApiUrl: (document.getElementById('song-translation-api-url')?.value || '').trim(),
        songTranslationApiKey: document.getElementById('song-translation-api-key')?.value || '',
        showVerseNos: document.getElementById('show-verse-nos').checked,
        versionSwitchUpdatesLive: document.getElementById('version-switch-updates-live').checked,
        textColor: document.getElementById('text-color').value,
        refColor: document.getElementById('ref-color').value,
        linesPerPage,
        activeRatio,
        sdWidth,
        sdMargin,
        sdMarginTop,
        sdMarginRight,
        sdMarginBottom,
        sdMarginLeft,
        sdSlant,
        sdStrokeWidth,
        sdStrokeColor,
        lineHeightFull: document.getElementById('line-height-full').value,
        lineHeightLT: document.getElementById('line-height-lt').value,
        ltWidthPct: document.getElementById('lt-width-pct')?.value || 100,
        ltScalePct: document.getElementById('lt-scale-pct')?.value || 100,
        ltOffsetY: document.getElementById('lt-offset-y')?.value || 0,
        ltOffsetX: document.getElementById('lt-offset-x')?.value || 0,
        fullOffsetX: document.getElementById('full-offset-x')?.value || 0,
        fullOffsetY: document.getElementById('full-offset-y')?.value || 0,
        ltBorderRadius: document.getElementById('lt-border-radius')?.value || 0,
        bgToggle: document.getElementById('bg-toggle').checked,
        hAlignFullRef: fullRefHAlign,
        hAlignFull: fullHAlign,
        vAlignFull: fullVAlign,
        hAlignLTSongs: ltHAlignSongs,
        vAlignLTSongs: ltVAlignSongs,
        ltAnchorMode,
        hAlignLTBible: ltHAlignBible,
        vAlignLTBible: ltVAlignBible,
        hAlignLTBibleVerse: ltHAlignBibleVerse,
        autoResizeFull: document.getElementById('auto-resize-full').value,
        autoResizeLT: document.getElementById('auto-resize-lt')?.value,
        refPositionFull: document.getElementById('ref-position-full')?.value,
        remoteShowEnabled: document.getElementById('remote-show-toggle')?.checked,
        remoteShowUseHostname: document.getElementById('remote-show-use-hostname')?.checked,
        remoteShowHost: document.getElementById('remote-show-host')?.value,
        remoteShowPort: document.getElementById('remote-show-port')?.value,
        remoteShowRelayHost: document.getElementById('remote-show-relay-host')?.value,
        remoteShowRelayPort: document.getElementById('remote-show-relay-port')?.value,
        remoteShowPairCode: document.getElementById('remote-show-pair-code')?.value,
        feedbackApiUrl: normalizeFeedbackApiUrl(appState?.settings?.feedbackApiUrl),
        hostMode: getHostMode(),
        vmix: getVmixSettings(),
        theme: document.getElementById('theme-select')?.value || 'skyline',
        sidebarLayout: document.getElementById('sidebar-layout-select')?.value || sidebarLayoutMode || 'layout2',
        workspaceLayoutMode: document.getElementById('workspace-layout-mode-select')?.value || workspaceLayoutMode || 'focused',
        focusedWorkspaceControls: ensureFocusedWorkspaceControlsState(),
        projectionSettingsProfiles: ensureProjectionSettingsProfiles(),
        settingsTargetTab: normalizeSettingsTargetTab(settingsTargetTab),
        setlistSettings: getSetlistSettingsSnapshot(),
        ltModeUserPresets: Array.isArray(ltModeUserPresets)
          ? ltModeUserPresets.map((preset) => ({
              ...preset,
              values: preset && preset.values ? { ...preset.values } : null
            }))
          : []
      };
    }
