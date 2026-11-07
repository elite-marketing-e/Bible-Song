    // ===== CLOUD : SETLISTS & PACKS DE SOUS-TITRES PARTAGÉS (publication volontaire) =====
    // Contrairement aux chants/Bibles (synchronisés), ces éléments sont PUBLIÉS par un PC et
    // RÉCUPÉRÉS à la main sur les autres : le bouton « Récupérer » général ne les touche pas,
    // seule la « Récupération de la sélection » (cases cochées) les applique.
    //
    // Sur le dépôt (même dépôt privé que les chants) : 2 fichiers par élément
    //   shared/<setlists|subtitles>/<cid>.meta.json  petit en-tête (nom, PC, date) → listé sans
    //                                                 télécharger le contenu (photos des sous-titres)
    //   shared/<setlists|subtitles>/<cid>.json        contenu complet
    // Seul le PC qui a publié (même identifiant de poste) peut le mettre à jour ou le supprimer
    // du cloud. C'est une règle de l'app (tous les PC partagent le même token), pas un verrou.
    // Supprimer du cloud ne touche JAMAIS les copies déjà récupérées par les autres PC.
    //
    // État local (bspCloudState, IndexedDB) :
    //   sharedRemote { head, items: { cid: { kind, metaSha, dataSha, meta } } }  dernier listing
    //   sharedGot    { cid: { dataSha, map } }  ce que CE PC a récupéré (map : id sous-titre du
    //                                           pack → id local, pour la MAJ sur place)
    //   sharedSeen   { cid: dataSha }           déjà vu (pastille) ;  sharedMine { cid: { subIds } }

    const BSP_CLOUD_STATION_ID_LS = 'bsp-cloud-station-id';
    const BSP_CSHARE_DIRS = { setlist: 'setlists', subtitles: 'subtitles' };
    let bspCshareSelected = new Set();
    let bspCshareForm = null; // { kind, cid|null } : formulaire de publication ouvert
    let bspCshareMsg = '';
    let bspCshareErr = '';

    function bspCloudStationId() {
      let id = '';
      try { id = localStorage.getItem(BSP_CLOUD_STATION_ID_LS) || ''; } catch (_) {}
      if (!id) {
        id = 'pc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        try { localStorage.setItem(BSP_CLOUD_STATION_ID_LS, id); } catch (_) {}
      }
      return id;
    }
    function bspCloudSharedState() {
      const S = bspCloudState;
      if (!S.sharedRemote || typeof S.sharedRemote !== 'object') S.sharedRemote = { head: '', items: {} };
      if (!S.sharedRemote.items) S.sharedRemote.items = {};
      if (!S.sharedGot || typeof S.sharedGot !== 'object') S.sharedGot = {};
      if (!S.sharedSeen || typeof S.sharedSeen !== 'object') S.sharedSeen = {};
      if (!S.sharedMine || typeof S.sharedMine !== 'object') S.sharedMine = {};
      return S;
    }
    function bspCloudSharedHead() { return bspCloudSharedState().sharedRemote.head || ''; }
    function bspCloudSharedIsMine(item) { return !!(item && item.meta && item.meta.stationId === bspCloudStationId()); }
    // 'mine' | 'new' | 'update' | 'ok'
    function bspCloudSharedStatusOf(item) {
      if (bspCloudSharedIsMine(item)) return 'mine';
      const got = bspCloudSharedState().sharedGot[item.cid];
      if (!got) return 'new';
      return got.dataSha === item.dataSha ? 'ok' : 'update';
    }
    function bspCloudSharedItems(kind) {
      const items = Object.values(bspCloudSharedState().sharedRemote.items || {}).filter((it) => it && it.dataSha && (!kind || it.kind === kind));
      return items.sort((a, b) => Number((b.meta && b.meta.publishedAt) || 0) - Number((a.meta && a.meta.publishedAt) || 0));
    }
    // Pastille : éléments d'AUTRES PC, nouveaux ou mis à jour, pas encore vus.
    function bspCloudSharedPending() {
      const S = bspCloudSharedState();
      const out = { setlist: 0, subtitles: 0 };
      bspCloudSharedItems().forEach((it) => {
        if (bspCloudSharedIsMine(it)) return;
        if (S.sharedSeen[it.cid] === it.dataSha) return;
        const st = bspCloudSharedStatusOf(it);
        if (st === 'new' || st === 'update') out[it.kind]++;
      });
      return out;
    }
    function bspCloudSharedSummary(p) {
      const parts = [];
      if (p.setlist) parts.push(p.setlist + ' setlist' + (p.setlist > 1 ? 's' : ''));
      if (p.subtitles) parts.push(p.subtitles + ' pack' + (p.subtitles > 1 ? 's' : '') + ' de sous-titres');
      return parts.join(' et ');
    }

    // Appelé par bspCloudFetchRemote à chaque lecture de l'arbre : met à jour le listing.
    // Seuls les en-têtes (.meta.json, petits) INCONNUS sont téléchargés.
    async function bspCloudSharedIngest(head, sharedFiles) {
      const S = bspCloudSharedState();
      const prev = S.sharedRemote.items || {};
      const byCid = {};
      Object.keys(sharedFiles || {}).forEach((p) => {
        const m = p.match(/^shared\/(setlists|subtitles)\/([^/]+?)(\.meta)?\.json$/);
        if (!m) return;
        const kind = m[1] === 'setlists' ? 'setlist' : 'subtitles';
        const cid = m[2];
        const it = byCid[cid] || (byCid[cid] = { cid, kind, metaSha: '', dataSha: '', meta: null });
        if (m[3]) it.metaSha = sharedFiles[p]; else it.dataSha = sharedFiles[p];
      });
      const items = {};
      for (const cid of Object.keys(byCid)) {
        const it = byCid[cid];
        if (!it.metaSha || !it.dataSha) continue;
        if (prev[cid] && prev[cid].metaSha === it.metaSha && prev[cid].meta) it.meta = prev[cid].meta;
        else {
          try { it.meta = await bspCloudGetBlobJson(it.metaSha); } catch (_) { it.meta = null; }
        }
        if (!it.meta || typeof it.meta !== 'object') continue;
        items[cid] = it;
      }
      S.sharedRemote = { head, items };
      // Mes publications supprimées ailleurs / réinstallation : on oublie ce qui n'existe plus.
      Object.keys(S.sharedMine).forEach((cid) => { if (!items[cid]) delete S.sharedMine[cid]; });
      bspCloudSaveState();
      if (document.getElementById('bsp-cshare')) bspCshareRender();
    }

    // ── Écriture : un commit avec des ajouts/remplacements/suppressions de fichiers ──
    // changes : [{ path, content }] (texte) | [{ path, sha }] (blob déjà envoyé) | [{ path, del: true }]
    async function bspCloudCommitChanges(changes, message, attempt) {
      const branch = encodeURIComponent(bspCloudCfg.branch || 'main');
      const ref = await bspCloudApi('/git/ref/heads/' + branch);
      const head = ref.object.sha;
      const commit = await bspCloudApi('/git/commits/' + head);
      const tree = await bspCloudApi('/git/trees', { method: 'POST', body: {
        base_tree: commit.tree.sha,
        tree: changes.map((c) => c.del ? { path: c.path, mode: '100644', type: 'blob', sha: null }
          : (c.sha ? { path: c.path, mode: '100644', type: 'blob', sha: c.sha } : { path: c.path, mode: '100644', type: 'blob', content: c.content }))
      } });
      const c = await bspCloudApi('/git/commits', { method: 'POST', body: { message, tree: tree.sha, parents: [head] } });
      try {
        await bspCloudApi('/git/refs/heads/' + branch, { method: 'PATCH', body: { sha: c.sha, force: false } });
      } catch (err) {
        if (err && err.status === 422 && !attempt) return bspCloudCommitChanges(changes, message, 1);
        throw err;
      }
      // Les chants/Bibles n'ont pas changé dans ce commit : si on était à jour, on le reste.
      if (bspCloudState.head === head) bspCloudState.head = c.sha;
      bspCloudSaveState();
      return c.sha;
    }

    // ── Contenus ───────────────────────────────────────────────────────────────
    function bspCloudSharedSubtitlePayload(subIds) {
      const want = new Set(subIds || []);
      const subs = ((typeof bspSubtitlesExport === 'function') ? bspSubtitlesExport() : []).filter((s) => s && want.has(s.id));
      const media = [];
      if (typeof bspSubtitlesMediaRefs === 'function') {
        bspSubtitlesMediaRefs(subs).forEach((id) => {
          const m = (typeof bspMediaGet === 'function') ? bspMediaGet(id) : null;
          if (m && m.dataUrl) media.push({ id: m.id, name: m.name, type: m.type, dataUrl: m.dataUrl });
        });
      }
      return { subtitles: subs, media };
    }
    function bspCloudSharedSetlistPayload() {
      return {
        setlist: (typeof bspBuildSetlistData === 'function') ? bspBuildSetlistData() : [],
        meta: (typeof bspSetlistMetaData === 'function') ? bspSetlistMetaData() : { title: '', comment: '' }
      };
    }

    // Publier (cid absent) ou mettre à jour (cid = une de MES publications).
    async function bspCloudSharedPublish(kind, cid, name, subIds) {
      const dir = BSP_CSHARE_DIRS[kind];
      if (!dir) throw new Error('type inconnu');
      if (cid) {
        const it = bspCloudSharedState().sharedRemote.items[cid];
        if (it && !bspCloudSharedIsMine(it)) throw new Error('Seul le PC qui l\'a publié peut le mettre à jour.');
      }
      cid = cid || ((kind === 'setlist' ? 'sl_' : 'st_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      const payload = kind === 'setlist' ? bspCloudSharedSetlistPayload() : bspCloudSharedSubtitlePayload(subIds);
      const count = kind === 'setlist' ? payload.setlist.length : payload.subtitles.length;
      if (!count) throw new Error(kind === 'setlist' ? 'La setlist est vide.' : 'Aucun sous-titre sélectionné.');
      const station = String(bspCloudCfg.station || '').trim() || 'un PC';
      const meta = { app: 'Bible Song Pro', kind, id: cid, name: String(name || '').trim() || (kind === 'setlist' ? 'Setlist' : 'Sous-titres'), station, stationId: bspCloudStationId(), publishedAt: Date.now(), count };
      const data = { app: 'Bible Song Pro', kind, id: cid, name: meta.name, payload };
      // Le contenu (photos des sous-titres possibles) passe par un blob ; l'en-tête est en ligne.
      const blob = await bspCloudApi('/git/blobs', { method: 'POST', body: { content: bspCloudUtf8ToB64(JSON.stringify(data)), encoding: 'base64' } });
      await bspCloudCommitChanges([
        { path: 'shared/' + dir + '/' + cid + '.json', sha: blob.sha },
        { path: 'shared/' + dir + '/' + cid + '.meta.json', content: JSON.stringify(meta, null, 1) }
      ], (kind === 'setlist' ? 'Setlist' : 'Sous-titres') + ' « ' + meta.name + ' » publié(e) depuis ' + station);
      const S = bspCloudSharedState();
      S.sharedMine[cid] = { subIds: kind === 'subtitles' ? (subIds || []).slice() : [] };
      bspCloudSaveState();
      await bspCloudFetchRemote(); // relit le listing (ingest)
      return cid;
    }

    async function bspCloudSharedDelete(cid) {
      const it = bspCloudSharedState().sharedRemote.items[cid];
      if (!it) return;
      if (!bspCloudSharedIsMine(it)) throw new Error('Seul le PC qui l\'a publié peut le supprimer du cloud.');
      const dir = BSP_CSHARE_DIRS[it.kind];
      await bspCloudCommitChanges([
        { path: 'shared/' + dir + '/' + cid + '.json', del: true },
        { path: 'shared/' + dir + '/' + cid + '.meta.json', del: true }
      ], 'Suppression du cloud : « ' + ((it.meta && it.meta.name) || cid) + ' »');
      delete bspCloudSharedState().sharedMine[cid];
      await bspCloudFetchRemote();
    }

    // ── Récupération (sélection manuelle) ──────────────────────────────────────
    async function bspCloudSharedRestoreMedia(media) {
      if (!Array.isArray(media) || typeof bspMediaBank === 'undefined') return;
      for (const m of media) {
        if (!m || !m.id || !m.dataUrl || bspMediaBank[m.id]) continue;
        const rec = { id: m.id, name: m.name || 'media', type: m.type === 'video' ? 'video' : 'image', dataUrl: m.dataUrl, size: (m.dataUrl || '').length, createdAt: Date.now() };
        bspMediaBank[m.id] = rec;
        try { if (typeof openDb === 'function') await openDb(); if (typeof idbPut === 'function') await idbPut(STORE_MEDIA, rec); } catch (_) {}
      }
    }
    // MAJ SUR PLACE : les sous-titres venant de ce pack sont remplacés (même id local, même place),
    // les nouveaux ajoutés, ceux retirés du pack supprimés (sauf s'ils sont à l'antenne). Les
    // sous-titres créés localement ne sont jamais touchés.
    async function bspCloudSharedApplySubtitles(cid, payload) {
      if (!payload || !Array.isArray(payload.subtitles)) throw new Error('pack de sous-titres invalide');
      await bspCloudSharedRestoreMedia(payload.media);
      if (!Array.isArray(bspSubtitles)) bspSubtitles = [];
      const prev = (bspCloudSharedState().sharedGot[cid] || {}).map || {};
      const live = new Set();
      try { bspSubtitleLiveEntries().forEach((e) => live.add(e.id)); } catch (_) {}
      const map = {};
      let added = 0, updated = 0;
      payload.subtitles.forEach((raw) => {
        const s = (typeof bspNormalizeSubtitle === 'function') ? bspNormalizeSubtitle(raw) : raw;
        if (!s) return;
        const rid = String(raw.id || s.id);
        const lid = prev[rid];
        const idx = lid ? bspSubtitles.findIndex((x) => x && x.id === lid) : -1;
        if (idx > -1) { s.id = lid; bspSubtitles[idx] = s; updated++; }
        else { s.id = (typeof bspSubtitleUid === 'function') ? bspSubtitleUid() : ('sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)); bspSubtitles.push(s); added++; }
        map[rid] = s.id;
      });
      Object.keys(prev).forEach((rid) => {
        if (map[rid]) return;
        const lid = prev[rid];
        if (live.has(lid)) { map[rid] = lid; return; }
        const i = bspSubtitles.findIndex((x) => x && x.id === lid);
        if (i > -1) bspSubtitles.splice(i, 1);
      });
      if (typeof bspSubtitleWork !== 'undefined') bspSubtitleWork = null;
      if (typeof bspSubtitlesPersist === 'function') bspSubtitlesPersist();
      if (typeof bspRenderSubtitleLibrary === 'function') bspRenderSubtitleLibrary();
      if (typeof bspPhoneScheduleSyncBroadcast === 'function') bspPhoneScheduleSyncBroadcast();
      return { map, added, updated };
    }
    function bspCloudSharedApplySetlist(payload) {
      if (!payload || !Array.isArray(payload.setlist)) throw new Error('setlist invalide');
      const n = (typeof bspApplySetlistData === 'function') ? bspApplySetlistData(payload.setlist, { replace: true }) : 0;
      const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
      if (typeof setlistMeta !== 'undefined') {
        setlistMeta = { title: String(meta.title || ''), comment: String(meta.comment || '') };
        if (typeof bspRenderSetlistHeader === 'function') bspRenderSetlistHeader();
      }
      if (typeof renderSongs === 'function') renderSongs();
      return n;
    }
    async function bspCloudSharedRetrieve(cids) {
      const S = bspCloudSharedState();
      const items = cids.map((c) => S.sharedRemote.items[c]).filter(Boolean);
      // Sous-titres d'abord, la setlist (une seule : elle REMPLACE la setlist en cours) ensuite.
      items.sort((a, b) => (a.kind === 'setlist') - (b.kind === 'setlist'));
      const res = { setlist: '', packs: 0, subs: 0 };
      for (const it of items) {
        const doc = await bspCloudGetBlobJson(it.dataSha);
        if (!doc || doc.kind !== it.kind) throw new Error('Contenu invalide : ' + ((it.meta && it.meta.name) || it.cid));
        if (it.kind === 'subtitles') {
          const r = await bspCloudSharedApplySubtitles(it.cid, doc.payload);
          S.sharedGot[it.cid] = { dataSha: it.dataSha, map: r.map };
          res.packs++; res.subs += r.added + r.updated;
        } else {
          bspCloudSharedApplySetlist(doc.payload);
          S.sharedGot[it.cid] = { dataSha: it.dataSha, map: {} };
          res.setlist = (it.meta && it.meta.name) || 'Setlist';
        }
        S.sharedSeen[it.cid] = it.dataSha;
        bspCloudSaveState();
      }
      return res;
    }

    // ── Fenêtre « Setlists & sous-titres partagés » ────────────────────────────
    function bspCloudOpenShared(focusKind) {
      bspCloudTogglePopover(false);
      if (!bspCloudConfigured()) { bspCloudOpenSettings(); if (typeof showToast === 'function') showToast('Configurez d\'abord le cloud (token) dans les Réglages.'); return; }
      if (typeof bspOutputPresetsInjectStyles === 'function') bspOutputPresetsInjectStyles(); // confirmations
      let ov = document.getElementById('bsp-cshare');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'bsp-cshare'; ov.className = 'bsp-cshare';
        ov.addEventListener('mousedown', (e) => { if (e.target === ov) bspCloudCloseShared(); });
        document.body.appendChild(ov);
        document.addEventListener('keydown', bspCshareEsc, true);
      }
      bspCshareForm = null; bspCshareMsg = ''; bspCshareErr = '';
      bspCshareSelected = new Set();
      bspCshareFocus = focusKind || '';
      bspCshareRender();
      // Listing frais (1 requête si rien n'a changé).
      bspCloudCheckRemote({ silent: true }).then(() => bspCshareRender());
    }
    let bspCshareFocus = '';
    function bspCshareEsc(e) {
      if (e.key !== 'Escape' || !document.getElementById('bsp-cshare')) return;
      if (document.querySelector('.bsp-fx-confirm')) return; // la confirmation se ferme d'abord
      e.stopPropagation(); e.preventDefault();
      bspCloudCloseShared();
    }
    function bspCloudCloseShared() {
      const ov = document.getElementById('bsp-cshare');
      if (ov) ov.remove();
      document.removeEventListener('keydown', bspCshareEsc, true);
      bspCloudRenderButton();
    }
    function bspCshareAgo(ts) {
      const d = (Date.now() - Number(ts || 0)) / 1000;
      if (!ts || d < 0) return '';
      if (d < 90) return 'à l\'instant';
      if (d < 3600) return 'il y a ' + Math.round(d / 60) + ' min';
      if (d < 86400) return 'il y a ' + Math.round(d / 3600) + ' h';
      const j = Math.round(d / 86400);
      return j === 1 ? 'hier' : 'il y a ' + j + ' j';
    }
    function bspCshareRender() {
      const ov = document.getElementById('bsp-cshare');
      if (!ov) return;
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const S = bspCloudSharedState();
      // Tout ce qui est affiché est « vu » (la pastille s'éteint) ; NOUVEAU / MAJ restent affichés.
      let seenChanged = false;
      bspCloudSharedItems().forEach((it) => { if (S.sharedSeen[it.cid] !== it.dataSha && !bspCloudSharedIsMine(it)) { S.sharedSeen[it.cid] = it.dataSha; seenChanged = true; } });
      if (seenChanged) bspCloudSaveState();
      // Sélection : on retire ce qui n'existe plus.
      bspCshareSelected.forEach((c) => { if (!S.sharedRemote.items[c]) bspCshareSelected.delete(c); });

      const tag = { new: '<span class="tg new">Nouveau</span>', update: '<span class="tg upd">MAJ dispo</span>', ok: '<span class="tg ok">À jour</span>', mine: '<span class="tg mine">Publié par ce PC</span>' };
      const row = (it) => {
        const st = bspCloudSharedStatusOf(it);
        const m = it.meta || {};
        const unit = it.kind === 'setlist' ? 'élément' : 'sous-titre';
        const sub = [st === 'mine' ? 'ce PC' : ('par ' + (m.station || 'un PC')), bspCshareAgo(m.publishedAt), (m.count || 0) + ' ' + unit + ((m.count || 0) > 1 ? 's' : '')].filter(Boolean).join(' · ');
        const chk = st === 'mine' ? '<span class="ck-sp"></span>'
          : `<input type="checkbox" data-sel="${esc(it.cid)}" ${bspCshareSelected.has(it.cid) ? 'checked' : ''} ${bspCloudBusy ? 'disabled' : ''}>`;
        const acts = st === 'mine' ? `<button class="ib" data-upd="${esc(it.cid)}" title="Mettre à jour sur le cloud avec le contenu actuel de ce PC" ${bspCloudBusy ? 'disabled' : ''}>↻</button><button class="ib del" data-del="${esc(it.cid)}" title="Supprimer du cloud (les PC qui l'ont déjà récupéré le gardent)" ${bspCloudBusy ? 'disabled' : ''}>🗑</button>` : '';
        return `<label class="it st-${st}">${chk}<div class="mt"><div class="nm">${esc(m.name || it.cid)}</div><div class="sb">${esc(sub)}</div></div>${tag[st]}${acts}</label>`;
      };
      const section = (kind, title, pubLabel) => {
        const items = bspCloudSharedItems(kind);
        const form = (bspCshareForm && bspCshareForm.kind === kind) ? bspCshareFormHtml(kind, esc) : '';
        return `<section class="sec${bspCshareFocus === kind ? ' focus' : ''}">
          <div class="sh"><span>${title}</span><button class="pb" data-pub="${kind}" ${bspCloudBusy ? 'disabled' : ''}>↑ ${pubLabel}</button></div>
          ${form}
          ${items.length ? items.map(row).join('') : '<div class="empty">Rien de publié pour l\'instant.</div>'}
        </section>`;
      };
      const nSel = bspCshareSelected.size;
      ov.innerHTML = `<div class="card" role="dialog" aria-modal="true">
        <div class="hd"><b>☁ Setlists & sous-titres partagés</b><button class="x" data-act="close" title="Fermer">✕</button></div>
        <div class="st">Ce PC : <input id="bsp-cshare-station" value="${esc(bspCloudCfg.station || '')}" placeholder="Nom du poste (ex. Régie)" maxlength="40"> <span class="hint">affiché aux autres PC</span></div>
        <div class="bd">
          ${section('setlist', 'Setlists', 'Publier la setlist actuelle')}
          ${section('subtitles', 'Packs de sous-titres', 'Publier des sous-titres')}
        </div>
        ${bspCshareErr ? `<div class="err">${esc(bspCshareErr)}</div>` : ''}
        ${bspCshareMsg ? `<div class="msg">${esc(bspCshareMsg)}</div>` : ''}
        <div class="ft">
          <span class="note">Cochez ce qu'il faut récupérer. Une setlist récupérée <b>remplace</b> la setlist en cours ; un pack de sous-titres est mis à jour sur place.</span>
          <button class="go" data-act="get" ${nSel && !bspCloudBusy ? '' : 'disabled'}>↓ Récupérer la sélection${nSel ? ' (' + nSel + ')' : ''}</button>
        </div>
      </div>`;
      bspCshareWire(ov);
    }
    function bspCshareFormHtml(kind, esc) {
      const f = bspCshareForm;
      const it = f.cid ? bspCloudSharedState().sharedRemote.items[f.cid] : null;
      const verb = f.cid ? 'Mettre à jour' : 'Publier';
      if (kind === 'setlist') {
        const n = Array.isArray(schedule) ? schedule.length : 0;
        const def = (it && it.meta && it.meta.name) || ((typeof setlistMeta !== 'undefined' && setlistMeta && setlistMeta.title) || ('Setlist du ' + new Date().toLocaleDateString('fr-FR')));
        return `<div class="fm"><div class="fr"><span>Nom</span><input id="bsp-cshare-name" value="${esc(def)}" maxlength="80"></div>
          <div class="fi">${f.cid ? 'Remplace le contenu publié par' : 'Publie'} la setlist actuelle de ce PC (${n} élément${n > 1 ? 's' : ''}).</div>
          <div class="fb"><button class="pb ghost" data-act="cancel">Annuler</button><button class="pb" data-act="submit" ${n ? '' : 'disabled'}>${verb}</button></div></div>`;
      }
      const subs = Array.isArray(bspSubtitles) ? bspSubtitles : [];
      const mine = f.cid ? ((bspCloudSharedState().sharedMine[f.cid] || {}).subIds || []) : null;
      const checked = (id) => (mine ? mine.indexOf(id) !== -1 : true);
      const def = (it && it.meta && it.meta.name) || 'Sous-titres du ' + new Date().toLocaleDateString('fr-FR');
      const label = (s) => ((typeof bspSubtitleTypeLabel === 'function') ? bspSubtitleTypeLabel(s.type) : s.type) + ' — ' + (s.value || s.label || '—');
      return `<div class="fm"><div class="fr"><span>Nom du pack</span><input id="bsp-cshare-name" value="${esc(def)}" maxlength="80"></div>
        <div class="fi">Sous-titres à inclure (avec leurs photos) : <button class="lk" data-act="all">tous</button> · <button class="lk" data-act="none">aucun</button></div>
        <div class="sl">${subs.length ? subs.map((s) => `<label><input type="checkbox" data-sub="${esc(s.id)}" ${checked(s.id) ? 'checked' : ''}> ${esc(label(s))}</label>`).join('') : '<div class="empty">Aucun sous-titre sur ce PC.</div>'}</div>
        <div class="fb"><button class="pb ghost" data-act="cancel">Annuler</button><button class="pb" data-act="submit" ${subs.length ? '' : 'disabled'}>${verb}</button></div></div>`;
    }
    async function bspCshareDo(label, fn) {
      if (bspCloudBusy) return;
      bspCloudBusy = true; bspCshareErr = ''; bspCshareMsg = label + '…';
      bspCshareRender(); bspCloudRenderButton();
      try { bspCshareMsg = (await fn()) || ''; }
      catch (err) { bspCshareErr = (err && err.message) || String(err); bspCshareMsg = ''; }
      finally {
        bspCloudBusy = false;
        bspCshareRender(); bspCloudRenderButton();
        if (typeof showToast === 'function') showToast('☁ ' + (bspCshareErr || bspCshareMsg));
      }
    }
    function bspCshareWire(ov) {
      const q = (s) => ov.querySelector(s);
      const st = q('#bsp-cshare-station');
      if (st) st.onchange = () => { bspCloudCfg.station = st.value.trim(); bspCloudSaveCfg(); bspCloudRenderSettings(); };
      ov.querySelectorAll('[data-sel]').forEach((cb) => cb.onchange = () => {
        const cid = cb.getAttribute('data-sel');
        const it = bspCloudSharedState().sharedRemote.items[cid];
        if (cb.checked) {
          // Une seule setlist : elle remplace la setlist en cours.
          if (it && it.kind === 'setlist') bspCloudSharedItems('setlist').forEach((x) => bspCshareSelected.delete(x.cid));
          bspCshareSelected.add(cid);
        } else bspCshareSelected.delete(cid);
        bspCshareRender();
      });
      ov.querySelectorAll('[data-pub]').forEach((b) => b.onclick = () => { bspCshareForm = { kind: b.getAttribute('data-pub'), cid: null }; bspCshareFocus = bspCshareForm.kind; bspCshareRender(); });
      ov.querySelectorAll('[data-upd]').forEach((b) => b.onclick = (e) => {
        e.preventDefault();
        const it = bspCloudSharedState().sharedRemote.items[b.getAttribute('data-upd')];
        if (!it) return;
        bspCshareForm = { kind: it.kind, cid: it.cid }; bspCshareFocus = it.kind; bspCshareRender();
      });
      ov.querySelectorAll('[data-del]').forEach((b) => b.onclick = (e) => {
        e.preventDefault();
        const cid = b.getAttribute('data-del');
        const it = bspCloudSharedState().sharedRemote.items[cid];
        const name = (it && it.meta && it.meta.name) || cid;
        const go = () => bspCshareDo('Suppression', async () => { await bspCloudSharedDelete(cid); return '« ' + name + ' » supprimé du cloud. Les PC qui l\'ont déjà récupéré le gardent.'; });
        if (typeof bspFxConfirm === 'function') bspFxConfirm('Supprimer du cloud', 'Retirer « ' + name + ' » du cloud ? Les autres PC ne le verront plus ; ceux qui l\'ont déjà récupéré gardent leur copie.', go, 'Supprimer du cloud');
        else if (confirm('Retirer « ' + name + ' » du cloud ?')) go();
      });
      ov.querySelectorAll('[data-act]').forEach((b) => b.onclick = (e) => {
        const a = b.getAttribute('data-act');
        if (a === 'close') return bspCloudCloseShared();
        if (a === 'cancel') { bspCshareForm = null; return bspCshareRender(); }
        if (a === 'all' || a === 'none') { e.preventDefault(); ov.querySelectorAll('[data-sub]').forEach((c) => { c.checked = (a === 'all'); }); return; }
        if (a === 'submit') {
          const f = bspCshareForm; if (!f) return;
          const name = (q('#bsp-cshare-name') || {}).value || '';
          const subIds = [...ov.querySelectorAll('[data-sub]')].filter((c) => c.checked).map((c) => c.getAttribute('data-sub'));
          const verb = f.cid ? 'mis à jour' : 'publié';
          return bspCshareDo(f.cid ? 'Mise à jour' : 'Publication', async () => {
            await bspCloudSharedPublish(f.kind, f.cid, name, subIds);
            bspCshareForm = null;
            return (f.kind === 'setlist' ? 'Setlist' : 'Pack de sous-titres') + ' « ' + name.trim() + ' » ' + verb + ' sur le cloud.';
          });
        }
        if (a === 'get') {
          const cids = [...bspCshareSelected];
          const sl = cids.map((c) => bspCloudSharedState().sharedRemote.items[c]).find((it) => it && it.kind === 'setlist');
          const go = () => bspCshareDo('Récupération', async () => {
            const r = await bspCloudSharedRetrieve(cids);
            bspCshareSelected = new Set();
            const parts = [];
            if (r.setlist) parts.push('setlist « ' + r.setlist + ' » chargée');
            if (r.packs) parts.push(r.packs + ' pack' + (r.packs > 1 ? 's' : '') + ' de sous-titres (' + r.subs + ' sous-titre' + (r.subs > 1 ? 's' : '') + ')');
            return 'Récupéré : ' + (parts.join(', ') || 'rien') + '.';
          });
          const n = Array.isArray(schedule) ? schedule.length : 0;
          if (sl && n && typeof bspFxConfirm === 'function') {
            bspFxConfirm('Remplacer la setlist', 'La setlist en cours (' + n + ' élément' + (n > 1 ? 's' : '') + ') sera remplacée par « ' + ((sl.meta && sl.meta.name) || 'Setlist') + ' ». Continuer ?', go, 'Remplacer', 'primary');
          } else go();
        }
      });
    }

    function bspCloudSharedInjectStyles() {
      if (document.getElementById('bsp-cshare-styles')) return;
      const st = document.createElement('style'); st.id = 'bsp-cshare-styles';
      st.textContent = `
        .bsp-cshare{position:fixed;inset:0;z-index:10055;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px}
        .bsp-cshare .card{width:min(640px,96vw);max-height:90vh;display:flex;flex-direction:column;background:var(--bg-panel,#1b2130);color:var(--text,#e8edf6);border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.55);font-size:12.5px}
        .bsp-cshare .hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px;font-size:14px}
        .bsp-cshare .x{background:none;border:0;color:var(--text-secondary,#9fb0cc);font-size:16px;cursor:pointer;border-radius:6px;padding:2px 8px}
        .bsp-cshare .x:hover{background:rgba(255,255,255,.08);color:#fff}
        .bsp-cshare .st{padding:0 16px 10px;color:var(--text-secondary,#9fb0cc);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .bsp-cshare input[type=text],.bsp-cshare .st input,.bsp-cshare .fr input{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.14);color:var(--text,#e8edf6);border-radius:7px;padding:6px 9px;font-size:12.5px;min-width:0}
        .bsp-cshare .hint{font-size:11px;opacity:.7}
        .bsp-cshare .bd{overflow:auto;padding:0 16px;display:flex;flex-direction:column;gap:12px}
        .bsp-cshare .sec{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px}
        .bsp-cshare .sec.focus{border-color:rgba(10,132,255,.55)}
        .bsp-cshare .sh{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:.6px;color:var(--text-secondary,#9fb0cc)}
        .bsp-cshare .pb{background:var(--accent,#0a84ff);color:#fff;border:0;border-radius:8px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;text-transform:none;letter-spacing:0}
        .bsp-cshare .pb.ghost{background:rgba(255,255,255,.08);color:var(--text,#e8edf6)}
        .bsp-cshare button:disabled{opacity:.5;cursor:default}
        .bsp-cshare .it{display:flex;align-items:center;gap:10px;padding:8px 9px;border-radius:9px;background:rgba(255,255,255,.03);cursor:pointer}
        .bsp-cshare .it:hover{background:rgba(255,255,255,.07)}
        .bsp-cshare .it.st-mine{cursor:default}
        .bsp-cshare .it input{width:16px;height:16px;flex:none}
        .bsp-cshare .ck-sp{width:16px;flex:none}
        .bsp-cshare .mt{flex:1;min-width:0}
        .bsp-cshare .nm{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .bsp-cshare .sb{font-size:11px;color:var(--text-secondary,#9fb0cc)}
        .bsp-cshare .tg{flex:none;font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px;text-transform:uppercase;letter-spacing:.4px}
        .bsp-cshare .tg.new{background:#16a34a;color:#fff}.bsp-cshare .tg.upd{background:#f59e0b;color:#1f1300}
        .bsp-cshare .tg.ok{background:rgba(255,255,255,.08);color:var(--text-secondary,#9fb0cc)}.bsp-cshare .tg.mine{background:rgba(10,132,255,.18);color:#8cc4ff}
        .bsp-cshare .ib{flex:none;background:rgba(255,255,255,.07);border:0;color:var(--text,#e8edf6);border-radius:7px;width:30px;height:28px;cursor:pointer;font-size:14px}
        .bsp-cshare .ib:hover{background:rgba(255,255,255,.14)}.bsp-cshare .ib.del:hover{background:rgba(255,60,60,.25)}
        .bsp-cshare .empty{color:var(--text-secondary,#9fb0cc);font-size:12px;padding:4px 2px}
        .bsp-cshare .fm{border:1px dashed rgba(10,132,255,.5);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;background:rgba(10,132,255,.06)}
        .bsp-cshare .fr{display:flex;align-items:center;gap:8px}.bsp-cshare .fr span{flex:none;color:var(--text-secondary,#9fb0cc)}.bsp-cshare .fr input{flex:1}
        .bsp-cshare .fi{font-size:11.5px;color:var(--text-secondary,#9fb0cc)}
        .bsp-cshare .lk{background:none;border:0;color:#8cc4ff;cursor:pointer;padding:0;font-size:11.5px;text-decoration:underline}
        .bsp-cshare .sl{max-height:170px;overflow:auto;display:flex;flex-direction:column;gap:3px}
        .bsp-cshare .sl label{display:flex;align-items:center;gap:7px;cursor:pointer}
        .bsp-cshare .fb{display:flex;gap:6px;justify-content:flex-end}
        .bsp-cshare .err{margin:10px 16px 0;color:var(--danger,#ff453a)}
        .bsp-cshare .msg{margin:10px 16px 0;color:#9be9a8}
        .bsp-cshare .ft{display:flex;align-items:center;gap:12px;padding:12px 16px 14px;border-top:1px solid rgba(255,255,255,.08);margin-top:12px}
        .bsp-cshare .note{flex:1;font-size:11px;color:var(--text-secondary,#9fb0cc)}
        .bsp-cshare .go{flex:none;background:#16a34a;color:#fff;border:0;border-radius:9px;padding:9px 14px;font-weight:800;cursor:pointer}`;
      document.head.appendChild(st);
    }
    bspCloudSharedInjectStyles();
    window.bspCloudOpenShared = bspCloudOpenShared;
