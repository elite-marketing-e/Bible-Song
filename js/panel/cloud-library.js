    // ===== CLOUD : BIBLIOTHÈQUE PARTAGÉE (chants + Bibles) via un dépôt GitHub PRIVÉ =====
    // Un fichier par élément : songs/<id>.json, bibles/<version>.json. Plusieurs PC envoient
    // UNIQUEMENT leurs nouveautés/modifications (un commit par envoi) ; les autres PC voient une
    // pastille quand le cloud a changé et récupèrent. Suppressions : restent locales.
    //
    // Détection des changements, par fichier, avec l'état de la dernière synchro (IndexedDB) :
    //   files[path] = { sha: blob distant connu, ck: empreinte du CONTENU distant connu }
    //   - distant changé  ⇔ sha de l'arbre distant ≠ files[path].sha  → téléchargé, fusionné
    //   - local changé    ⇔ empreinte du contenu local ≠ files[path].ck → envoyé
    // L'empreinte (ck) ignore id et dates : deux PC qui ont le même chant ne le renvoient pas
    // en boucle. Un même chant présent sur 2 PC avec des id différents est RELIÉ (links) au même
    // fichier au lieu d'être dupliqué. Conflit (modifié des 2 côtés) : le plus récent gagne.
    //
    // Le TOKEN n'est jamais exporté, ni envoyé au téléphone/relais, ni affiché : chiffré par l'OS
    // dans l'app Electron (safeStorage), localStorage seulement en mode navigateur.

    const BSP_CLOUD_CFG_KEY = 'bsp-cloud-cfg-v1';
    const BSP_CLOUD_TOKEN_LS = 'bsp-cloud-token';
    const BSP_CLOUD_STATE_KEY = 'cloudSync';
    const BSP_CLOUD_DEFAULT_REPO = 'elite-marketing-e/Bible-Song-Library';
    const BSP_CLOUD_POLL_MS = 3 * 60 * 1000;

    let bspCloudCfg = { repo: BSP_CLOUD_DEFAULT_REPO, branch: 'main', expires: '', auto: true, station: '' };
    let bspCloudToken = '';
    let bspCloudState = { repo: '', head: '', files: {}, links: {}, dirtyBibles: {} };
    let bspCloudBusy = false;
    let bspCloudSuppressDirty = false;
    // L'état de synchro est chargé de façon asynchrone : rien n'est sauvegardé avant (sinon on
    // écraserait l'état enregistré), et les Bibles marquées entre-temps sont mises en file.
    let bspCloudStateLoaded = false;
    const bspCloudPendingDirty = new Set();
    let bspCloudPollTimer = 0;
    let bspCloudLastNotifiedHead = '';
    let bspCloudStatus = { remote: { songs: 0, bibles: 0, head: '' }, local: { songs: 0, bibles: 0 }, lastSync: 0, error: '', message: '' };

    // ── Config / token / état ─────────────────────────────────────────────────
    function bspCloudLoadCfg() {
      try { const c = JSON.parse(localStorage.getItem(BSP_CLOUD_CFG_KEY) || 'null'); if (c && typeof c === 'object') bspCloudCfg = Object.assign(bspCloudCfg, c); } catch (_) {}
    }
    function bspCloudSaveCfg() {
      try { localStorage.setItem(BSP_CLOUD_CFG_KEY, JSON.stringify({ repo: bspCloudCfg.repo, branch: bspCloudCfg.branch, expires: bspCloudCfg.expires, auto: bspCloudCfg.auto, station: bspCloudCfg.station })); } catch (_) {}
    }
    function bspCloudSecureStore() {
      return !!(window.BSPDesktop && typeof window.BSPDesktop.secretGet === 'function');
    }
    async function bspCloudLoadToken() {
      try {
        if (bspCloudSecureStore()) bspCloudToken = (await window.BSPDesktop.secretGet('cloudToken')) || '';
        else bspCloudToken = localStorage.getItem(BSP_CLOUD_TOKEN_LS) || '';
      } catch (_) { bspCloudToken = ''; }
    }
    async function bspCloudSetToken(tok) {
      const v = String(tok || '').trim();
      if (bspCloudSecureStore()) {
        const r = await window.BSPDesktop.secretSet('cloudToken', v);
        if (!r || !r.ok) throw new Error((r && r.error) || 'enregistrement impossible');
      } else {
        try { if (v) localStorage.setItem(BSP_CLOUD_TOKEN_LS, v); else localStorage.removeItem(BSP_CLOUD_TOKEN_LS); } catch (_) {}
      }
      bspCloudToken = v;
    }
    function bspCloudConfigured() { return !!(bspCloudToken && bspCloudCfg.repo); }

    async function bspCloudLoadState() {
      try {
        const rec = await idbGet(STORE_STATE, BSP_CLOUD_STATE_KEY);
        if (rec && rec.value && typeof rec.value === 'object') bspCloudState = Object.assign({ repo: '', head: '', files: {}, links: {}, dirtyBibles: {} }, rec.value);
      } catch (_) {}
      // Changer de dépôt = repartir de zéro (les empreintes ne valent que pour un dépôt).
      if (bspCloudState.repo && bspCloudState.repo !== bspCloudCfg.repo) bspCloudState = { repo: bspCloudCfg.repo, head: '', files: {}, links: {}, dirtyBibles: {} };
      bspCloudStateLoaded = true;
      if (bspCloudPendingDirty.size) { bspCloudPendingDirty.forEach((n) => { bspCloudState.dirtyBibles[n] = 1; }); bspCloudPendingDirty.clear(); bspCloudSaveState(); }
    }
    function bspCloudSaveState() {
      if (!bspCloudStateLoaded) return;
      bspCloudState.repo = bspCloudCfg.repo;
      try { idbPut(STORE_STATE, { key: BSP_CLOUD_STATE_KEY, value: bspCloudState, updatedAt: Date.now() }).catch(() => {}); } catch (_) {}
    }
    // Appelé par idbPut (bibles) et le changement de langue : la version sera ré-envoyée
    // (seulement si son contenu a réellement changé — voir bspCloudPush).
    function bspCloudMarkBibleDirty(name) {
      if (bspCloudSuppressDirty || !name) return;
      if (!bspCloudStateLoaded) { bspCloudPendingDirty.add(name); return; }
      bspCloudState.dirtyBibles[name] = 1;
      bspCloudSaveState();
      bspCloudScheduleLocalCount();
    }

    // ── Utilitaires ───────────────────────────────────────────────────────────
    // Empreinte rapide (FNV-1a 2×32 bits) : comparaison de contenu, pas de sécurité.
    function bspCloudCk(str) {
      let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 ^= c; h1 = Math.imul(h1, 16777619);
        h2 ^= c; h2 = Math.imul(h2, 0x5bd1e995); h2 ^= h2 >>> 15;
      }
      return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + ':' + str.length;
    }
    function bspCloudSafeName(name) {
      const base = String(name || 'x').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'x';
      return base + '-' + bspCloudCk(String(name)).slice(0, 6);
    }
    function bspCloudSongPath(id) { return 'songs/' + bspCloudSafeName(id) + '.json'; }
    function bspCloudBiblePath(name) { return 'bibles/' + bspCloudSafeName(name) + '.json'; }
    function bspCloudUtf8ToB64(str) {
      const bytes = new TextEncoder().encode(str);
      let bin = ''; const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      return btoa(bin);
    }
    function bspCloudB64ToUtf8(b64) {
      const bin = atob(String(b64 || '').replace(/\s+/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }

    // Document « chant » sur le cloud. `id` = id du FICHIER (stable entre PC), pas l'id local.
    function bspCloudSongDoc(song, cloudId) {
      return {
        id: cloudId,
        title: String(song.title || ''),
        text: String(song.content || song.text || ''),
        translatedLyrics: String(song.translatedLyrics || ''),
        translationLanguage: String(song.translationLanguage || ''),
        bilingualEnabled: !!song.bilingualEnabled,
        createdAt: Number(song.createdAt || 0) || Date.now(),
        updatedAt: Number(song.updatedAt || 0) || Date.now()
      };
    }
    function bspCloudSongCk(s) {
      // La langue de traduction ne compte que s'il y a une traduction : chaque PC attribue une
      // langue PAR DÉFAUT (réglage local) aux chants qui n'en ont pas → sinon renvois en boucle.
      const tr = String(s.translatedLyrics || '');
      return bspCloudCk(JSON.stringify([String(s.title || ''), String(s.content || s.text || ''), tr, tr ? String(s.translationLanguage || '') : '', !!s.bilingualEnabled]));
    }

    // ── API GitHub ────────────────────────────────────────────────────────────
    async function bspCloudApi(path, opts) {
      const o = opts || {};
      // BSP_CLOUD_API_BASE : uniquement pour les tests (faux serveur GitHub local).
      const apiBase = (typeof window !== 'undefined' && window.BSP_CLOUD_API_BASE) || 'https://api.github.com';
      const res = await fetch(apiBase + '/repos/' + bspCloudCfg.repo + path, {
        method: o.method || 'GET',
        headers: Object.assign({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + bspCloudToken,
          'X-GitHub-Api-Version': '2022-11-28'
        }, o.body ? { 'Content-Type': 'application/json' } : {}),
        body: o.body ? JSON.stringify(o.body) : undefined,
        cache: 'no-store'
      });
      if (res.status === 401) throw Object.assign(new Error('Token refusé ou expiré.'), { code: 'auth' });
      if (res.status === 403) {
        const remain = res.headers.get('x-ratelimit-remaining');
        throw Object.assign(new Error(remain === '0' ? 'Limite de requêtes GitHub atteinte, réessayez plus tard.' : 'Droits insuffisants : le token doit avoir « Contents : Read and write » sur ce dépôt.'), { code: 'perm' });
      }
      if (res.status === 404) throw Object.assign(new Error('Dépôt introuvable ou non accessible avec ce token.'), { code: 'notfound' });
      if (res.status === 409 && /empty/i.test(await res.clone().text())) throw Object.assign(new Error('Le dépôt est vide.'), { code: 'empty' });
      if (!res.ok) {
        let msg = 'Erreur GitHub ' + res.status;
        try { const j = await res.json(); if (j && j.message) msg += ' : ' + j.message; } catch (_) {}
        throw Object.assign(new Error(msg), { code: 'http', status: res.status });
      }
      return res.status === 204 ? null : res.json();
    }

    // Arbre distant : { head, treeSha, files: { path: sha } } (songs/ et bibles/ seulement).
    async function bspCloudFetchRemote() {
      const ref = await bspCloudApi('/git/ref/heads/' + encodeURIComponent(bspCloudCfg.branch || 'main'));
      const head = ref.object.sha;
      const commit = await bspCloudApi('/git/commits/' + head);
      const tree = await bspCloudApi('/git/trees/' + commit.tree.sha + '?recursive=1');
      const files = {};
      (tree.tree || []).forEach((e) => {
        if (e.type === 'blob' && /^(songs|bibles)\/[^/]+\.json$/.test(e.path)) files[e.path] = e.sha;
      });
      return { head, treeSha: commit.tree.sha, files };
    }
    async function bspCloudGetBlobJson(sha) {
      const b = await bspCloudApi('/git/blobs/' + sha);
      const text = b.encoding === 'base64' ? bspCloudB64ToUtf8(b.content) : String(b.content || '');
      return JSON.parse(text);
    }

    // ── Liens chant local ↔ fichier cloud ─────────────────────────────────────
    function bspCloudPathToLocalSongId() {
      const rev = {};
      Object.keys(bspCloudState.links).forEach((k) => { if (k.indexOf('song:') === 0) rev[bspCloudState.links[k]] = k.slice(5); });
      return rev;
    }

    // ── RÉCUPÉRER (pull) ──────────────────────────────────────────────────────
    // Télécharge les fichiers distants modifiés depuis la dernière synchro et les fusionne.
    async function bspCloudPull(remote, onProgress) {
      remote = remote || await bspCloudFetchRemote();
      const changed = Object.keys(remote.files).filter((p) => !bspCloudState.files[p] || bspCloudState.files[p].sha !== remote.files[p]);
      const songPaths = changed.filter((p) => p.indexOf('songs/') === 0);
      const biblePaths = changed.filter((p) => p.indexOf('bibles/') === 0);
      const res = { songsAdded: 0, songsUpdated: 0, songsSame: 0, bibles: 0 };
      if (!Array.isArray(songs)) return res;

      // Index locaux.
      const byId = new Map(); const byTitle = new Map();
      songs.forEach((s, i) => {
        if (!s) return;
        if (s.id) byId.set(String(s.id), i);
        const k = (typeof bspSongTitleKey === 'function') ? bspSongTitleKey(s.title) : String(s.title || '').toLowerCase().trim();
        if (k && !byTitle.has(k)) byTitle.set(k, i);
      });
      const linkedPath = bspCloudPathToLocalSongId();
      const toPut = [];
      let done = 0;
      const total = songPaths.length + biblePaths.length;

      for (const p of songPaths) {
        const doc = await bspCloudGetBlobJson(remote.files[p]);
        done++; if (onProgress) onProgress(done, total);
        if (!doc || typeof doc !== 'object') continue;
        const remoteCk = bspCloudSongCk(doc);
        let idx = null;
        if (linkedPath[p] != null && byId.has(linkedPath[p])) idx = byId.get(linkedPath[p]);
        if (idx == null && doc.id != null && byId.has(String(doc.id))) idx = byId.get(String(doc.id));
        if (idx == null) {
          const tk = (typeof bspSongTitleKey === 'function') ? bspSongTitleKey(doc.title) : String(doc.title || '').toLowerCase().trim();
          if (tk && byTitle.has(tk)) idx = byTitle.get(tk);
        }
        if (idx == null) {
          // Nouveau chant pour ce PC : on reprend l'id du cloud s'il est libre.
          const rec = coerceSongRecord({ ...doc, id: byId.has(String(doc.id)) ? undefined : doc.id });
          if (!rec) continue;
          if (doc.updatedAt) rec.updatedAt = doc.updatedAt;
          if (doc.createdAt) rec.createdAt = doc.createdAt;
          toPut.push(rec);
          songs.push(hydrateSongFromRecord(rec));
          const ni = songs.length - 1;
          byId.set(String(rec.id), ni);
          bspCloudState.links['song:' + rec.id] = p;
          res.songsAdded++;
        } else {
          const cur = songs[idx];
          bspCloudState.links['song:' + cur.id] = p;
          const localCk = bspCloudSongCk(cur);
          const base = bspCloudState.files[p];
          const localEditedSinceSync = !base || base.ck !== localCk;
          if (localCk === remoteCk) {
            res.songsSame++;
          } else if (localEditedSinceSync && Number(cur.updatedAt || 0) > Number(doc.updatedAt || 0)) {
            res.songsSame++; // modifié des deux côtés, le local est plus récent : il sera envoyé
          } else {
            const rec = coerceSongRecord({ ...doc, id: cur.id });
            if (!rec) continue;
            rec.createdAt = cur.createdAt || rec.createdAt;
            rec.updatedAt = Number(doc.updatedAt || 0) || Date.now();
            toPut.push(rec);
            songs[idx] = hydrateSongFromRecord(rec);
            res.songsUpdated++;
          }
        }
        bspCloudState.files[p] = { sha: remote.files[p], ck: remoteCk };
      }

      // Bibles : la version du cloud est prise telle quelle (les versions sont synchronisées).
      for (const p of biblePaths) {
        const doc = await bspCloudGetBlobJson(remote.files[p]);
        done++; if (onProgress) onProgress(done, total);
        if (!doc || !doc.name || !Array.isArray(doc.parsedData)) continue;
        const name = String(doc.name);
        bspCloudSuppressDirty = true;
        try {
          await idbPut(STORE_BIBLES, buildBibleRecord(name, doc.parsedData, { isNew: !(name in bibles) }));
        } finally { bspCloudSuppressDirty = false; }
        // En mémoire : seulement si c'est la version active (sinon sentinelle → chargée à la demande).
        bibles[name] = (activeBibleVersion === name || (typeof dualVersionSecondaryId !== 'undefined' && dualVersionSecondaryId === name)) ? doc.parsedData : null;
        if (typeof clearBibleSearchCache === 'function') clearBibleSearchCache(name);
        if (doc.language && typeof bspBibleLangs === 'object') { bspBibleLangs[name] = String(doc.language); if (typeof bspBibleLangsPersist === 'function') bspBibleLangsPersist(); }
        delete bspCloudState.dirtyBibles[name];
        bspCloudState.files[p] = { sha: remote.files[p], ck: bspCloudCk(JSON.stringify({ name, language: doc.language || '', parsedData: doc.parsedData })) };
        res.bibles++;
      }

      if (toPut.length) {
        await openDb();
        await dbPutMany(STORE_SONGS, toPut);
        if (typeof bspSortSongsAlphabetically === 'function') bspSortSongsAlphabetically();
      }
      bspCloudState.head = remote.head;
      bspCloudSaveState();
      if (toPut.length || res.bibles) {
        if (typeof renderSongs === 'function') renderSongs();
        if (res.bibles) {
          if (!activeBibleVersion && Object.keys(bibles).length) activeBibleVersion = Object.keys(bibles)[0];
          if (typeof renderVersionBar === 'function') renderVersionBar();
          if (typeof updateBibleLists === 'function') updateBibleLists();
          if (typeof bspSyncBibleVersionDropdown === 'function') bspSyncBibleVersionDropdown();
        }
        if (typeof saveState === 'function') saveState();
        if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      }
      return res;
    }

    // ── ENVOYER (push) : uniquement les nouveautés/modifications, en UN commit ──
    async function bspCloudPush(onProgress, attempt) {
      const remote = await bspCloudFetchRemote();
      // D'abord récupérer : fusionne ce que les autres PC ont envoyé (le plus récent gagne).
      const pulled = await bspCloudPull(remote);
      const entries = [];      // { path, content } (chants, inline) | { path, sha } (Bibles, blob)
      const nextFiles = {};    // path -> ck (sha connu après le commit)
      const existing = new Set(Object.keys(remote.files));
      let nSongs = 0, nBibles = 0;

      // Chants.
      const usedPaths = new Set(Object.values(bspCloudState.links));
      (Array.isArray(songs) ? songs : []).forEach((s) => {
        if (!s || !s.id || (!s.title && !(s.text || s.content))) return;
        let p = bspCloudState.links['song:' + s.id];
        if (!p) {
          p = bspCloudSongPath(s.id);
          let n = 1;
          while ((existing.has(p) || usedPaths.has(p)) && n < 50) { p = bspCloudSongPath(s.id + '_' + (n++)); }
          bspCloudState.links['song:' + s.id] = p; usedPaths.add(p);
        }
        const ck = bspCloudSongCk(s);
        if (bspCloudState.files[p] && bspCloudState.files[p].ck === ck) return;
        const cloudId = p.slice(6, -5);
        entries.push({ path: p, content: JSON.stringify(bspCloudSongDoc(s, cloudId), null, 1) });
        nextFiles[p] = ck; nSongs++;
      });

      // Bibles : versions jamais envoyées + versions marquées modifiées (import, langue).
      const names = Object.keys(bibles || {});
      for (const name of names) {
        const p = bspCloudBiblePath(name);
        if (bspCloudState.files[p] && !bspCloudState.dirtyBibles[name]) continue;
        const rec = await idbGet(STORE_BIBLES, name).catch(() => null);
        const parsed = (rec && Array.isArray(rec.parsedData)) ? rec.parsedData : (Array.isArray(bibles[name]) ? bibles[name] : null);
        if (!parsed || !parsed.length) continue;
        const language = (typeof bspBibleLangOf === 'function') ? bspBibleLangOf(name) : '';
        const body = JSON.stringify({ name, language, parsedData: parsed });
        const ck = bspCloudCk(body);
        if (bspCloudState.files[p] && bspCloudState.files[p].ck === ck) { delete bspCloudState.dirtyBibles[name]; continue; }
        if (onProgress) onProgress('bible', name);
        const blob = await bspCloudApi('/git/blobs', { method: 'POST', body: { content: bspCloudUtf8ToB64(body), encoding: 'base64' } });
        entries.push({ path: p, sha: blob.sha });
        nextFiles[p] = ck; nBibles++;
      }

      if (!entries.length) { bspCloudSaveState(); return { pushed: 0, songs: 0, bibles: 0, pulled }; }

      // Arbre(s) : les chants sont envoyés EN LIGNE dans l'arbre (pas 1 requête par chant),
      // par lots pour garder des requêtes de taille raisonnable.
      let baseTree = remote.treeSha;
      const CHUNK = 400;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const part = entries.slice(i, i + CHUNK).map((e) => e.sha
          ? { path: e.path, mode: '100644', type: 'blob', sha: e.sha }
          : { path: e.path, mode: '100644', type: 'blob', content: e.content });
        if (onProgress) onProgress('tree', Math.min(i + CHUNK, entries.length) + '/' + entries.length);
        const t = await bspCloudApi('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: part } });
        baseTree = t.sha;
      }
      const station = String(bspCloudCfg.station || '').trim() || 'un PC';
      const message = 'Mise à jour depuis ' + station + ' : ' + nSongs + ' chant(s), ' + nBibles + ' Bible(s)';
      const commit = await bspCloudApi('/git/commits', { method: 'POST', body: { message, tree: baseTree, parents: [remote.head] } });
      try {
        await bspCloudApi('/git/refs/heads/' + encodeURIComponent(bspCloudCfg.branch || 'main'), { method: 'PATCH', body: { sha: commit.sha, force: false } });
      } catch (err) {
        // Un autre PC a envoyé entre-temps : on recommence une fois (récupérer puis envoyer).
        if (err && err.status === 422 && !attempt) return bspCloudPush(onProgress, 1);
        throw err;
      }
      // Sha réels des fichiers envoyés (pour reconnaître notre propre commit à la prochaine synchro).
      const t = await bspCloudApi('/git/trees/' + baseTree + '?recursive=1');
      const shaByPath = {};
      (t.tree || []).forEach((e) => { if (e.type === 'blob') shaByPath[e.path] = e.sha; });
      Object.keys(nextFiles).forEach((p) => { bspCloudState.files[p] = { sha: shaByPath[p] || '', ck: nextFiles[p] }; });
      names.forEach((n) => { if (nextFiles[bspCloudBiblePath(n)]) delete bspCloudState.dirtyBibles[n]; });
      bspCloudState.head = commit.sha;
      bspCloudSaveState();
      return { pushed: entries.length, songs: nSongs, bibles: nBibles, pulled };
    }

    // ── Compteurs (pastille) ──────────────────────────────────────────────────
    let bspCloudLocalTimer = 0;
    function bspCloudScheduleLocalCount() {
      if (bspCloudLocalTimer) clearTimeout(bspCloudLocalTimer);
      bspCloudLocalTimer = setTimeout(() => { bspCloudLocalTimer = 0; bspCloudCountLocal(); bspCloudRenderButton(); }, 1200);
    }
    function bspCloudCountLocal() {
      let s = 0;
      (Array.isArray(songs) ? songs : []).forEach((x) => {
        if (!x || !x.id) return;
        const p = bspCloudState.links['song:' + x.id];
        if (!p || !bspCloudState.files[p] || bspCloudState.files[p].ck !== bspCloudSongCk(x)) s++;
      });
      let b = 0;
      Object.keys(bibles || {}).forEach((n) => { if (!bspCloudState.files[bspCloudBiblePath(n)] || bspCloudState.dirtyBibles[n]) b++; });
      bspCloudStatus.local = { songs: s, bibles: b };
    }
    // Vérification légère du cloud (1 requête ; l'arbre seulement si le cloud a changé).
    async function bspCloudCheckRemote(opts) {
      if (!bspCloudConfigured() || bspCloudBusy) return;
      try {
        const ref = await bspCloudApi('/git/ref/heads/' + encodeURIComponent(bspCloudCfg.branch || 'main'));
        const head = ref.object.sha;
        if (head === bspCloudState.head) { bspCloudStatus.remote = { songs: 0, bibles: 0, head }; }
        else if (head !== bspCloudStatus.remote.head) {
          const remote = await bspCloudFetchRemote();
          let s = 0, b = 0;
          Object.keys(remote.files).forEach((p) => {
            if (bspCloudState.files[p] && bspCloudState.files[p].sha === remote.files[p]) return;
            if (p.indexOf('songs/') === 0) s++; else b++;
          });
          bspCloudStatus.remote = { songs: s, bibles: b, head };
        }
        bspCloudStatus.error = '';
        const r = bspCloudStatus.remote;
        if ((r.songs || r.bibles) && head !== bspCloudLastNotifiedHead && !(opts && opts.silent)) {
          bspCloudLastNotifiedHead = head;
          if (typeof showToast === 'function') showToast('☁ Cloud : ' + bspCloudSummary(r.songs, r.bibles) + ' à récupérer');
        }
      } catch (err) {
        bspCloudStatus.error = (err && err.message) || String(err);
      }
      bspCloudCountLocal();
      bspCloudRenderButton();
    }
    function bspCloudSummary(s, b) {
      const parts = [];
      if (s) parts.push(s + ' chant' + (s > 1 ? 's' : ''));
      if (b) parts.push(b + ' Bible' + (b > 1 ? 's' : ''));
      return parts.join(' et ') || 'rien';
    }
    function bspCloudStartPolling() {
      if (bspCloudPollTimer) clearInterval(bspCloudPollTimer);
      bspCloudPollTimer = 0;
      if (!bspCloudConfigured() || !bspCloudCfg.auto) return;
      bspCloudPollTimer = setInterval(() => { if (!document.hidden) bspCloudCheckRemote(); }, BSP_CLOUD_POLL_MS);
    }

    // ── Actions utilisateur ───────────────────────────────────────────────────
    async function bspCloudRun(kind) {
      if (bspCloudBusy) return;
      if (!bspCloudConfigured()) { bspCloudOpenSettings(); if (typeof showToast === 'function') showToast('Configurez d\'abord le cloud (token) dans les Réglages.'); return; }
      bspCloudBusy = true; bspCloudStatus.error = ''; bspCloudStatus.message = kind === 'pull' ? 'Récupération…' : 'Envoi…';
      bspCloudRenderButton(); bspCloudRenderPopover();
      try {
        if (kind === 'pull') {
          const r = await bspCloudPull(null, (d, t) => { bspCloudStatus.message = 'Récupération ' + d + '/' + t + '…'; bspCloudRenderPopover(); });
          const n = r.songsAdded + r.songsUpdated;
          bspCloudStatus.message = (n || r.bibles) ? ('Récupéré : ' + bspCloudSummary(n, r.bibles) + '.') : 'Déjà à jour.';
        } else {
          const r = await bspCloudPush((what, info) => { bspCloudStatus.message = (what === 'bible' ? 'Envoi de la Bible ' + info : 'Envoi ' + info) + '…'; bspCloudRenderPopover(); });
          const got = r.pulled ? (r.pulled.songsAdded + r.pulled.songsUpdated) : 0;
          bspCloudStatus.message = (r.pushed ? ('Envoyé : ' + bspCloudSummary(r.songs, r.bibles) + '.') : 'Rien de nouveau à envoyer.') +
            ((got || (r.pulled && r.pulled.bibles)) ? ' Récupéré : ' + bspCloudSummary(got, r.pulled.bibles) + '.' : '');
        }
        bspCloudStatus.lastSync = Date.now();
        bspCloudStatus.remote = { songs: 0, bibles: 0, head: bspCloudState.head };
        if (typeof showToast === 'function') showToast('☁ ' + bspCloudStatus.message);
      } catch (err) {
        bspCloudStatus.error = (err && err.message) || String(err);
        bspCloudStatus.message = '';
        if (typeof showToast === 'function') showToast('☁ ' + bspCloudStatus.error);
      } finally {
        bspCloudBusy = false;
        bspCloudCountLocal();
        bspCloudRenderButton(); bspCloudRenderPopover(); bspCloudRenderSettings();
      }
    }

    // Jours avant expiration du token (null si date inconnue).
    function bspCloudDaysLeft() {
      if (!bspCloudCfg.expires) return null;
      const d = new Date(bspCloudCfg.expires + 'T23:59:59');
      if (isNaN(d)) return null;
      return Math.ceil((d - Date.now()) / 86400000);
    }

    // ── En-tête : bouton + pastille + popover ─────────────────────────────────
    function bspCloudRenderButton() {
      const btn = document.getElementById('btn-cloud');
      if (!btn) return;
      const badge = document.getElementById('btn-cloud-badge');
      const r = bspCloudStatus.remote, l = bspCloudStatus.local;
      const down = (r.songs || 0) + (r.bibles || 0), up = (l.songs || 0) + (l.bibles || 0);
      const days = bspCloudDaysLeft();
      btn.classList.toggle('is-busy', bspCloudBusy);
      btn.classList.toggle('is-error', !!bspCloudStatus.error || (days != null && days <= 0));
      let txt = '', cls = '';
      if (!bspCloudConfigured()) { txt = ''; }
      else if (down) { txt = '↓' + down; cls = 'down'; }
      else if (up) { txt = '↑' + up; cls = 'up'; }
      else if (days != null && days <= 30) { txt = '!'; cls = 'warn'; }
      if (badge) { badge.textContent = txt; badge.className = 'bsp-cloud-badge ' + cls; badge.style.display = txt ? '' : 'none'; }
      btn.title = !bspCloudConfigured() ? 'Bibliothèque partagée (Cloud) — à configurer'
        : (down ? ('Cloud : ' + bspCloudSummary(r.songs, r.bibles) + ' à récupérer') : (up ? ('Cloud : ' + bspCloudSummary(l.songs, l.bibles) + ' à envoyer') : 'Cloud : à jour'));
    }
    function bspCloudTogglePopover(force) {
      let pop = document.getElementById('bsp-cloud-pop');
      const open = force != null ? force : !pop;
      if (!open) { if (pop) pop.remove(); return; }
      if (!pop) {
        pop = document.createElement('div'); pop.id = 'bsp-cloud-pop'; pop.className = 'bsp-cloud-pop';
        document.body.appendChild(pop);
        setTimeout(() => {
          const close = (e) => { const p = document.getElementById('bsp-cloud-pop'); const b = document.getElementById('btn-cloud'); if (!p) { document.removeEventListener('mousedown', close, true); return; } if (!p.contains(e.target) && !(b && b.contains(e.target))) { p.remove(); document.removeEventListener('mousedown', close, true); } };
          document.addEventListener('mousedown', close, true);
        }, 0);
      }
      bspCloudRenderPopover();
      if (bspCloudConfigured() && !bspCloudBusy) bspCloudCheckRemote({ silent: true }).then(bspCloudRenderPopover);
    }
    function bspCloudRenderPopover() {
      const pop = document.getElementById('bsp-cloud-pop');
      if (!pop) return;
      const btn = document.getElementById('btn-cloud');
      if (btn) { const r = btn.getBoundingClientRect(); pop.style.top = Math.round(r.bottom + 8) + 'px'; pop.style.left = Math.max(8, Math.round(Math.min(window.innerWidth - 330, r.left - 140))) + 'px'; }
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      if (!bspCloudConfigured()) {
        pop.innerHTML = '<div class="h">Bibliothèque partagée (Cloud)</div><p>Partagez chants et Bibles entre les PC de l\'église.</p><button class="b" data-act="settings">Configurer…</button>';
      } else {
        const r = bspCloudStatus.remote, l = bspCloudStatus.local, days = bspCloudDaysLeft();
        pop.innerHTML = `<div class="h">Bibliothèque partagée (Cloud)</div>
          <div class="row"><span>À récupérer</span><b>${esc(bspCloudSummary(r.songs, r.bibles))}</b></div>
          <div class="row"><span>À envoyer</span><b>${esc(bspCloudSummary(l.songs, l.bibles))}</b></div>
          ${days != null && days <= 30 ? `<div class="warn">${days <= 0 ? 'Le token a expiré : créez-en un nouveau.' : 'Le token expire dans ' + days + ' jour' + (days > 1 ? 's' : '') + '.'}</div>` : ''}
          ${bspCloudStatus.error ? `<div class="err">${esc(bspCloudStatus.error)}</div>` : ''}
          ${bspCloudStatus.message ? `<div class="msg">${esc(bspCloudStatus.message)}</div>` : ''}
          <div class="acts">
            <button class="b" data-act="push" ${bspCloudBusy ? 'disabled' : ''}>↑ Mettre à jour sur le Cloud</button>
            <button class="b ghost" data-act="pull" ${bspCloudBusy ? 'disabled' : ''}>↓ Récupérer</button>
          </div>
          <button class="lnk" data-act="settings">Réglages du cloud…</button>`;
      }
      pop.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        const a = b.getAttribute('data-act');
        if (a === 'settings') { bspCloudTogglePopover(false); bspCloudOpenSettings(); }
        else bspCloudRun(a);
      }));
    }

    // ── Réglages ──────────────────────────────────────────────────────────────
    function bspCloudOpenSettings() {
      if (typeof openSettingsModal === 'function') openSettingsModal();
      else if (typeof openModal === 'function') openModal('settingsModal');
      if (typeof switchSettingsTab === 'function') switchSettingsTab('presets');
      setTimeout(() => { const el = document.getElementById('bsp-cloud-settings'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
    }
    function bspCloudRenderSettings() {
      const box = document.getElementById('bsp-cloud-settings');
      if (!box) return;
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const days = bspCloudDaysLeft();
      const secure = bspCloudSecureStore();
      box.innerHTML = `
        <label class="settings-label">Bibliothèque partagée (Cloud GitHub)</label>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">Chants et Bibles partagés entre les PC. Seules les nouveautés et modifications sont envoyées ; les suppressions restent locales.</div>
        <div class="bsp-cloud-grid">
          <span>Dépôt</span><input id="bsp-cloud-repo" class="settings-input" value="${esc(bspCloudCfg.repo)}" placeholder="propriétaire/dépôt" spellcheck="false">
          <span>Nom de ce poste</span><input id="bsp-cloud-station" class="settings-input" value="${esc(bspCloudCfg.station)}" placeholder="Ex. Régie, Bureau pasteur" maxlength="40">
          <span>Token</span><div style="display:flex;gap:6px"><input id="bsp-cloud-token" class="settings-input" type="password" autocomplete="off" spellcheck="false" placeholder="${bspCloudToken ? 'Token enregistré ✓ — collez-en un autre pour le remplacer' : 'Collez ici le token GitHub (github_pat_…)'}" style="flex:1"></div>
          <span>Expire le</span><input id="bsp-cloud-exp" class="settings-input" type="date" value="${esc(bspCloudCfg.expires)}">
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin:6px 0">${secure ? '🔒 Le token est chiffré par Windows sur ce PC et n\'est jamais exporté.' : '⚠ Mode navigateur : le token est gardé dans ce navigateur uniquement.'}${days != null ? ' · ' + (days <= 0 ? '<b style="color:var(--danger)">Token expiré</b>' : 'Expire dans ' + days + ' j') : ''}</div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0"><input type="checkbox" id="bsp-cloud-auto" ${bspCloudCfg.auto ? 'checked' : ''}> Vérifier automatiquement les nouveautés (toutes les 3 min)</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          <button class="btn" id="bsp-cloud-save">Enregistrer & tester</button>
          <button class="btn" id="bsp-cloud-push" ${bspCloudConfigured() && !bspCloudBusy ? '' : 'disabled'}>↑ Mettre à jour sur le Cloud</button>
          <button class="btn" id="bsp-cloud-pull" ${bspCloudConfigured() && !bspCloudBusy ? '' : 'disabled'}>↓ Récupérer</button>
          ${bspCloudToken ? '<button class="btn" id="bsp-cloud-forget" style="background:var(--bg-dark)">Oublier le token</button>' : ''}
        </div>
        <div id="bsp-cloud-msg" style="font-size:12px;margin-top:8px;color:${bspCloudStatus.error ? 'var(--danger)' : 'var(--text-secondary)'}">${esc(bspCloudStatus.error || bspCloudStatus.message || '')}</div>`;
      const $ = (id) => document.getElementById(id);
      $('bsp-cloud-save').onclick = async () => {
        bspCloudCfg.repo = $('bsp-cloud-repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '') || BSP_CLOUD_DEFAULT_REPO;
        bspCloudCfg.station = $('bsp-cloud-station').value.trim();
        bspCloudCfg.expires = $('bsp-cloud-exp').value || '';
        bspCloudCfg.auto = $('bsp-cloud-auto').checked;
        bspCloudSaveCfg();
        const tokIn = $('bsp-cloud-token').value.trim();
        try {
          if (tokIn) await bspCloudSetToken(tokIn);
          $('bsp-cloud-token').value = '';
          await bspCloudLoadState();
          const repo = await bspCloudApi('');
          if (repo && repo.private === false) bspCloudStatus.message = '⚠ Connecté, mais le dépôt est PUBLIC : passez-le en privé (droits d\'auteur).';
          else bspCloudStatus.message = '✓ Connexion OK au dépôt privé ' + bspCloudCfg.repo + '.';
          if (repo && repo.permissions && repo.permissions.push === false) bspCloudStatus.message += ' ⚠ Le token n\'a que la lecture : l\'envoi sera refusé.';
          bspCloudStatus.error = '';
          bspCloudStartPolling();
          bspCloudCheckRemote({ silent: true });
        } catch (err) {
          bspCloudStatus.error = (err && err.message) || String(err); bspCloudStatus.message = '';
        }
        bspCloudRenderSettings(); bspCloudRenderButton();
      };
      $('bsp-cloud-push').onclick = () => bspCloudRun('push');
      $('bsp-cloud-pull').onclick = () => bspCloudRun('pull');
      const fg = $('bsp-cloud-forget');
      if (fg) fg.onclick = async () => { await bspCloudSetToken(''); bspCloudStatus.message = 'Token oublié sur ce PC.'; bspCloudStartPolling(); bspCloudRenderSettings(); bspCloudRenderButton(); };
    }

    function bspCloudInjectStyles() {
      if (document.getElementById('bsp-cloud-styles')) return;
      const st = document.createElement('style'); st.id = 'bsp-cloud-styles';
      st.textContent = `
        #btn-cloud{position:relative}
        #btn-cloud.is-busy svg{animation:bspCloudPulse 1s ease-in-out infinite}
        @keyframes bspCloudPulse{50%{opacity:.35}}
        #btn-cloud.is-error{color:var(--danger,#ff453a)}
        .bsp-cloud-badge{position:absolute;top:-6px;right:-8px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;font-size:9.5px;font-weight:800;line-height:16px;text-align:center;color:#fff;background:#64748b;box-shadow:0 0 0 2px var(--bg-dark,#0d1017)}
        .bsp-cloud-badge.down{background:#22c55e}.bsp-cloud-badge.up{background:var(--accent,#0a84ff)}.bsp-cloud-badge.warn{background:#f59e0b}
        .bsp-cloud-pop{position:fixed;z-index:10040;width:320px;background:var(--bg-panel,#1b2130);color:var(--text,#e8edf6);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.5);padding:14px;font-size:12px;display:flex;flex-direction:column;gap:8px}
        .bsp-cloud-pop .h{font-weight:800;font-size:13px}
        .bsp-cloud-pop p{margin:0;color:var(--text-secondary,#9fb0cc)}
        .bsp-cloud-pop .row{display:flex;justify-content:space-between;gap:10px}
        .bsp-cloud-pop .row span{color:var(--text-secondary,#9fb0cc)}
        .bsp-cloud-pop .warn{color:#f59e0b}.bsp-cloud-pop .err{color:var(--danger,#ff453a)}.bsp-cloud-pop .msg{color:#9be9a8}
        .bsp-cloud-pop .acts{display:flex;gap:6px}
        .bsp-cloud-pop .b{flex:1;background:var(--accent,#0a84ff);color:#fff;border:0;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer}
        .bsp-cloud-pop .b.ghost{background:rgba(255,255,255,.08);color:var(--text,#e8edf6)}
        .bsp-cloud-pop .b:disabled{opacity:.5;cursor:default}
        .bsp-cloud-pop .lnk{background:none;border:0;color:var(--text-secondary,#9fb0cc);text-align:left;padding:0;font-size:11px;cursor:pointer;text-decoration:underline}
        .bsp-cloud-grid{display:grid;grid-template-columns:110px 1fr;gap:6px 10px;align-items:center;font-size:12px}`;
      document.head.appendChild(st);
    }

    async function bspInitCloudLibrary() {
      bspCloudInjectStyles();
      bspCloudLoadCfg();
      await bspCloudLoadToken();
      await bspCloudLoadState();
      bspCloudRenderButton();
      bspCloudRenderSettings();
      if (bspCloudConfigured()) {
        setTimeout(() => bspCloudCheckRemote(), 4000); // au démarrage : nouveautés ?
        bspCloudStartPolling();
      }
      // Les changements locaux (édition, import…) passent par saveState : on recompte.
      setInterval(() => { if (bspCloudConfigured()) { bspCloudCountLocal(); bspCloudRenderButton(); } }, 20000);
    }
