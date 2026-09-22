    // ===== MEDIA BANK =====
    // A library of background images/videos, stored as data URLs in IndexedDB. Screens
    // reference an item by id ("bank:<id>"), never by copying the bytes into the design
    // override — a video data URL would blow the localStorage the overrides live in. The
    // reference is resolved to the real data URL just before it goes into a payload, from
    // an in-memory mirror kept in sync with the store.

    let bspMediaBank = {};   // id -> { id, name, type, dataUrl, size, createdAt }
    const BSP_MEDIA_REF_PREFIX = 'bank:';

    function bspMediaId() {
      return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    async function bspLoadMediaBank() {
      try {
        await openDb();
        const rows = await dbGetAll(STORE_MEDIA);
        bspMediaBank = {};
        (rows || []).forEach((r) => { if (r && r.id) bspMediaBank[r.id] = r; });
      } catch (err) {
        console.warn('[BSP] media bank load failed', err);
        bspMediaBank = {};
      }
    }

    function bspMediaList() {
      // Newest first.
      return Object.values(bspMediaBank).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    function bspMediaGet(id) {
      return bspMediaBank[id] || null;
    }

    // ── Diffusion par URL (étape ④ réseau) ─────────────────────────────────────
    // Quand le serveur BSP est joignable, la banque y est téléversée et les payloads
    // référencent http://<serveur>/media/<id> : quelques octets au lieu de plusieurs Mo,
    // et chaque affichage met le fichier en cache. Sans serveur, repli sur le data URL.
    let bspMediaUploaded = {};   // id -> true (présent sur le serveur)

    function bspMediaServerBase() {
      try {
        // La socket elle-même fait foi — les libellés d'état (connecting/resolving)
        // fluctuent pendant la détection d'IP alors que la connexion est déjà ouverte.
        if (typeof relaySocket === 'undefined' || !relaySocket || relaySocket.readyState !== WebSocket.OPEN) return '';
        const host = (typeof resolveRelayHost === 'function' && resolveRelayHost()) || '';
        const port = (typeof getHttpPort === 'function' && getHttpPort()) || '';
        if (!host || !port) return '';
        return `http://${host}:${port}`;
      } catch (_) { return ''; }
    }

    // Téléverse au serveur les éléments qu'il n'a pas encore. Appelé à la connexion du
    // relais et après chaque import ; sans serveur joignable, silencieux.
    async function bspSyncMediaBankToServer() {
      const base = bspMediaServerBase();
      if (!base) return { uploaded: 0 };
      const pair = (typeof getRemoteShowPairCode === 'function') ? getRemoteShowPairCode() : '';
      let have = [];
      try {
        const r = await fetch(`${base}/api/media?pair=${encodeURIComponent(pair)}`, { cache: 'no-store' });
        if (!r.ok) return { uploaded: 0 };
        have = (await r.json()).ids || [];
      } catch (_) { return { uploaded: 0 }; }
      have.forEach((id) => { bspMediaUploaded[id] = true; });

      let uploaded = 0;
      for (const item of Object.values(bspMediaBank)) {
        if (bspMediaUploaded[item.id]) continue;
        try {
          const r = await fetch(`${base}/media/${encodeURIComponent(item.id)}?pair=${encodeURIComponent(pair)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: item.dataUrl })
          });
          if (r.ok) { bspMediaUploaded[item.id] = true; uploaded++; }
        } catch (_) { /* le prochain passage réessaiera */ }
      }
      if (uploaded && typeof scheduleLiveUpdate === 'function' && typeof isLive !== 'undefined' && isLive) {
        scheduleLiveUpdate(); // les payloads peuvent maintenant porter des URLs légères
      }
      return { uploaded };
    }

    // "bank:<id>" -> URL du serveur si l'élément y est, sinon data URL local ; toute
    // autre valeur (http/data URL) passe inchangée. Le pipeline de fond appelle ceci
    // juste avant l'envoi, donc l'affichage ne voit jamais la référence brute.
    function bspResolveMediaRef(value) {
      const s = String(value == null ? '' : value);
      if (!s.startsWith(BSP_MEDIA_REF_PREFIX)) return value;
      const id = s.slice(BSP_MEDIA_REF_PREFIX.length);
      const item = bspMediaBank[id];
      if (!item) return '';
      // Always resolve to the data URL. It travels in the payload and renders on EVERY
      // display no matter how it was reached (server-served over http, BroadcastChannel,
      // or a local file). The earlier server-URL optimisation broke images whenever the
      // resolved URL was not fetchable by the display — the classic case being control via
      // the HTTPS panel (port 5443), where http://host:5443/media/<id> hits the TLS-only
      // port and fails, with no data-URL fallback. Storage stays light (bank refs live in
      // IndexedDB / config); only the live payload carries the bytes. Correctness first.
      return item.dataUrl;
    }

    function bspIsMediaRef(value) {
      return String(value == null ? '' : value).startsWith(BSP_MEDIA_REF_PREFIX);
    }

    // Adds a data URL to the bank and persists it. Returns the new record.
    async function bspMediaAdd({ name, type, dataUrl }) {
      if (!dataUrl) return null;
      const rec = {
        id: bspMediaId(),
        name: String(name || 'media').slice(0, 120),
        type: type === 'video' ? 'video' : 'image',
        dataUrl,
        size: dataUrl.length,
        createdAt: Date.now()
      };
      bspMediaBank[rec.id] = rec;
      try { await openDb(); await idbPut(STORE_MEDIA, rec); }
      catch (err) { console.warn('[BSP] media add persist failed', err); }
      // Chaque ajout pousse vers le serveur réseau (débouncé) : la synchro d'ouverture
      // de connexion ne voit que ce qui existait à ce moment-là.
      bspScheduleMediaSync();
      return rec;
    }

    let bspMediaSyncTimer = 0;
    function bspScheduleMediaSync() {
      if (bspMediaSyncTimer) clearTimeout(bspMediaSyncTimer);
      bspMediaSyncTimer = setTimeout(() => {
        bspMediaSyncTimer = 0;
        bspSyncMediaBankToServer();
      }, 500);
    }

    async function bspMediaDelete(id) {
      if (!bspMediaBank[id]) return;
      delete bspMediaBank[id];
      try { await idbDelete(STORE_MEDIA, id); }
      catch (err) { console.warn('[BSP] media delete failed', err); }
    }

    function bspReadFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('read failed'));
        reader.readAsDataURL(file);
      });
    }

    // Imports files (from an <input> or a drop), keeping only images/videos. Oversized
    // videos are refused up front — a data URL that big is impractical everywhere it goes.
    async function bspMediaImportFiles(fileList) {
      const files = Array.from(fileList || []);
      let added = 0, skipped = 0;
      for (const file of files) {
        const isImage = /^image\//.test(file.type);
        const isVideo = /^video\//.test(file.type);
        if (!isImage && !isVideo) { skipped++; continue; }
        const cap = isVideo ? 60 * 1024 * 1024 : 25 * 1024 * 1024;
        if (file.size > cap) { skipped++; continue; }
        try {
          const dataUrl = await bspReadFileAsDataUrl(file);
          await bspMediaAdd({ name: file.name, type: isVideo ? 'video' : 'image', dataUrl });
          added++;
        } catch (_) { skipped++; }
      }
      // Pousse les nouveaux fichiers vers le serveur réseau s'il est connecté.
      if (added) bspSyncMediaBankToServer();
      return { added, skipped };
    }
