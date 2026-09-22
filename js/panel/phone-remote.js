    // ===== PHONE REMOTE (panel side) =====
    // The phone page (BSP_phone.html, served by the network server) holds no data of its
    // own: it asks the panel over the relay and the panel answers. All messages are
    // PHONE_* payloads inside the ordinary RS_ENVELOPE flow — the server relays them like
    // anything else, and enforces that only the slot-holding phone can send commands.
    //
    // Slides sent to the phone are built with getPagesFromItem() using the CURRENT
    // panel settings (no override), so the page index the phone taps is exactly the
    // page index the panel projects — what you tap is what appears.

    function bspPhoneStripHtml(s) {
      const div = document.createElement('div');
      div.innerHTML = String(s == null ? '' : s);
      return (div.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function bspPhoneSlidesFor(item, isBible) {
      try {
        return getPagesFromItem(item, isBible).map(p => bspPhoneStripHtml(p.raw || p.text || ''));
      } catch (_) {
        return [];
      }
    }

    // Books of a version, in canon order of appearance: [{name, chapters}].
    function bspPhoneBooksIndex(version) {
      const chapters = bibles[version] || [];
      const books = [];
      const byName = {};
      chapters.forEach((ch) => {
        const name = ch.book || '';
        if (!name) return;
        if (!byName[name]) {
          byName[name] = { name, chapters: 0 };
          books.push(byName[name]);
        }
        byName[name].chapters++;
      });
      return books;
    }

    function bspPhoneChapterIndex(version, book, chapterNo) {
      const chapters = bibles[version] || [];
      for (let i = 0; i < chapters.length; i++) {
        if ((chapters[i].book || '') === book && String(chapters[i].chapter) === String(chapterNo)) return i;
      }
      return -1;
    }

    function bspPhoneReply(msg) {
      if (typeof relaySend === 'function') relaySend(msg);
    }

    function bspPhoneBuildSync() {
      return {
        type: 'PHONE_SYNC',
        ts: Date.now(),
        bibleVersions: Object.keys(bibles),
        songs: songs.map((s, i) => ({ i, title: s.title || ('Chant ' + (i + 1)) })),
        setlist: schedule.map((e, i) => ({
          i,
          title: e.title || ('Élément ' + (i + 1)),
          kind: (e._metaKind === 'bible_verse' || e.version) ? 'bible' : 'song'
        })),
        setlistMeta: {
          title: (typeof setlistMeta !== 'undefined' && setlistMeta.title) || '',
          comment: (typeof setlistMeta !== 'undefined' && setlistMeta.comment) || ''
        },
        // Sous-titres : contrôle depuis le téléphone (afficher/masquer + éditer Libellé/Texte).
        // On n'envoie que l'essentiel (le design/anim reste piloté par le PC).
        subtitles: (Array.isArray(bspSubtitles) ? bspSubtitles : []).map((s) => ({
          id: s.id, type: s.type, label: s.label || '', value: s.value || ''
        })),
        subtitleLiveId: (typeof bspSubtitleLiveId !== 'undefined') ? bspSubtitleLiveId : null,
        subtitleLiveByOutput: (typeof bspSubtitleLiveByOutput !== 'undefined') ? bspSubtitleLiveByOutput : {},
        // Sorties disponibles (Live + écrans) : pour le play isolé depuis le téléphone.
        subtitleOutputs: [{ id: 'all', name: (typeof t === 'function' ? t('subtitle_target_all') : 'Tous les écrans') }, { id: 'obs', name: (typeof t === 'function' ? t('subtitle_output_live') : 'Live') }]
          .concat((typeof bspScreensAdded !== 'undefined' && Array.isArray(bspScreensAdded) ? bspScreensAdded : []).map((s) => ({ id: s.id, name: (typeof bspDesignTargetLabel === 'function' ? bspDesignTargetLabel(s.id) : (s.name || s.id)) })))
      };
    }

    // The phone must FOLLOW the panel: whenever the library or the setlist changes on
    // the PC, an updated sync is pushed — the phone never has to ask again. Debounced,
    // and skipped when nothing visible to the phone actually changed (saveState fires
    // on many mutations that don't concern it).
    let bspPhoneSyncTimer = 0;
    let bspPhoneSyncLastHash = '';

    function bspPhoneScheduleSyncBroadcast() {
      if (bspPhoneSyncTimer) return;
      bspPhoneSyncTimer = setTimeout(() => {
        bspPhoneSyncTimer = 0;
        try {
          const msg = bspPhoneBuildSync();
          const hash = JSON.stringify([msg.bibleVersions, msg.songs, msg.setlist, msg.setlistMeta, msg.subtitles, msg.subtitleLiveId, msg.subtitleLiveByOutput, msg.subtitleOutputs]);
          if (hash === bspPhoneSyncLastHash) return;
          bspPhoneSyncLastHash = hash;
          bspPhoneReply(msg);
        } catch (_) {}
      }, 800);
    }

    async function bspHandlePhoneMessage(payload) {
      const type = payload && payload.type;
      try {
        if (type === 'PHONE_SYNC_REQUEST') {
          bspPhoneReply(bspPhoneBuildSync());
          return;
        }

        if (type === 'PHONE_BOOKS_GET') {
          const version = String(payload.version || '');
          if (!(version in bibles)) { bspPhoneReply({ type: 'PHONE_BOOKS', version, books: [] }); return; }
          if (typeof ensureBibleLoaded === 'function') await ensureBibleLoaded(version);
          bspPhoneReply({ type: 'PHONE_BOOKS', version, books: bspPhoneBooksIndex(version) });
          return;
        }

        if (type === 'PHONE_BIBLE_GET') {
          const version = String(payload.version || '');
          if (typeof ensureBibleLoaded === 'function' && (version in bibles)) await ensureBibleLoaded(version);
          const idx = bspPhoneChapterIndex(version, String(payload.book || ''), payload.chapter);
          const item = idx >= 0 ? (bibles[version] || [])[idx] : null;
          bspPhoneReply({
            type: 'PHONE_BIBLE',
            version, book: payload.book, chapter: payload.chapter, chapterIndex: idx,
            slides: item ? bspPhoneSlidesFor(item, true) : []
          });
          return;
        }

        if (type === 'PHONE_SONG_GET') {
          const i = Number(payload.i);
          const song = songs[i];
          bspPhoneReply({
            type: 'PHONE_SONG', i,
            title: song ? (song.title || '') : '',
            slides: song ? bspPhoneSlidesFor(song, false) : []
          });
          return;
        }

        if (type === 'PHONE_SETLIST_GET') {
          const i = Number(payload.i);
          const entry = schedule[i];
          const isBible = !!(entry && (entry._metaKind === 'bible_verse' || entry.version));
          bspPhoneReply({
            type: 'PHONE_SETLIST_ITEM', i,
            title: entry ? (entry.title || '') : '',
            slides: entry ? bspPhoneSlidesFor(entry, isBible) : []
          });
          return;
        }

        if (type === 'PHONE_PROJECT') {
          const kind = payload.kind;
          const pageIndex = Math.max(0, Number(payload.pageIndex) || 0);
          if (kind === 'bible') {
            const version = String(payload.version || '');
            if (!(version in bibles)) return;
            if (typeof ensureBibleLoaded === 'function') await ensureBibleLoaded(version);
            activeBibleVersion = version;
            if (typeof evictInactiveBibles === 'function') evictInactiveBibles();
            const idx = Number(payload.chapterIndex);
            if (!Number.isInteger(idx) || idx < 0 || idx >= (bibles[version] || []).length) return;
            buttonContextTab = 'bible';
            selectItem(idx, { skipButtonView: false });
          } else if (kind === 'song') {
            const i = Number(payload.i);
            if (!songs[i]) return;
            buttonContextTab = 'songs';
            selectItem(i);
          } else if (kind === 'setlist') {
            const i = Number(payload.i);
            if (!schedule[i]) return;
            buttonContextTab = 'schedule';
            selectItem(i);
          } else return;
          lineCursor = pageIndex;
          // Picking a slide from the phone behaves like clicking it in the workspace:
          // it never yanks the setlist selection forward.
          projectLive(true, { advanceSetlist: false });
          if (typeof updateButtonView === 'function') updateButtonView({ preserveScroll: true });
          return;
        }

        if (type === 'PHONE_ADD_TO_SETLIST') {
          // Reuses the panel's own add paths, so a phone add behaves exactly like the
          // context-menu add: dedup (moved to top), snapshots for verses, persistence —
          // and the saveState() inside triggers the auto-sync back to the phone.
          if (payload.kind === 'song') {
            const i = Number(payload.i);
            if (!songs[i]) { bspPhoneReply({ type: 'PHONE_ADDED', ok: false }); return; }
            insertIntoSchedule({ ...songs[i] }, {
              successMessage: t('setlist_added'),
              duplicateMessage: t('setlist_duplicate_moved_top')
            });
            bspPhoneReply({ type: 'PHONE_ADDED', ok: true, what: songs[i].title || '' });
          } else if (payload.kind === 'bible') {
            const version = String(payload.version || '');
            const idx = Number(payload.chapterIndex);
            if (!bibles[version] || !Number.isInteger(idx) || idx < 0 || idx >= bibles[version].length) {
              bspPhoneReply({ type: 'PHONE_ADDED', ok: false });
              return;
            }
            // quickAddVerseToSetlist reads the current bible selection; point it at the
            // requested chapter first (same move PHONE_PROJECT makes, minus projecting).
            activeBibleVersion = version;
            buttonContextTab = 'bible';
            selectItem(idx, { skipButtonView: true });
            quickAddVerseToSetlist(Math.max(0, Number(payload.pageIndex) || 0));
            bspPhoneReply({ type: 'PHONE_ADDED', ok: true, what: (bibles[version][idx] || {}).title || '' });
          } else {
            bspPhoneReply({ type: 'PHONE_ADDED', ok: false });
          }
          return;
        }

        if (type === 'PHONE_CLEAR') {
          if (typeof clearOutput === 'function') clearOutput({ fade: true });
          return;
        }

        // ── Sous-titres pilotés depuis le téléphone ──
        if (type === 'PHONE_SUB_SHOW') {
          const id = String(payload.id || '');
          const target = payload.target ? String(payload.target) : 'all';
          if (typeof bspSubtitleGoLive === 'function') bspSubtitleGoLive(id, target);
          bspPhoneScheduleSyncBroadcast();
          return;
        }
        if (type === 'PHONE_SUB_HIDE') {
          const target = payload.target ? String(payload.target) : 'all';
          if (typeof bspSubtitleHideLive === 'function') bspSubtitleHideLive(target);
          bspPhoneScheduleSyncBroadcast();
          return;
        }
        if (type === 'PHONE_SUB_EDIT') {
          const id = String(payload.id || '');
          const sub = (Array.isArray(bspSubtitles) ? bspSubtitles : []).find((s) => s && s.id === id);
          if (!sub) return;
          if (typeof payload.label === 'string') sub.label = payload.label.slice(0, 400);
          if (typeof payload.value === 'string') sub.value = payload.value.slice(0, 4000);
          if (typeof bspSubtitlesPersist === 'function') bspSubtitlesPersist(); // → saveState → resync téléphone
          // Si le sous-titre édité est CELUI diffusé, on relance la diffusion pour refléter en direct.
          if (typeof bspSubtitleLiveId !== 'undefined' && bspSubtitleLiveId === id && typeof bspSubtitleGoLive === 'function') {
            bspSubtitleGoLive(id);
          }
          // Rafraîchit le modal du panneau s'il est ouvert.
          if (typeof bspRenderSubtitleLibrary === 'function') bspRenderSubtitleLibrary();
          bspPhoneScheduleSyncBroadcast();
          return;
        }

        if (type === 'PHONE_ADD_SONG') {
          const title = String(payload.title || '').trim().slice(0, 200);
          const content = String(payload.content || '').trim().slice(0, 20000);
          if (!title || !content) { bspPhoneReply({ type: 'PHONE_ADD_SONG_RESULT', ok: false }); return; }
          // By decision: a song added from the phone lands in BOTH the permanent
          // library and the running setlist.
          const song = { id: 'phone_' + Date.now().toString(36), title, content };
          songs.push(song);
          schedule.push({ title, content });
          if (typeof saveState === 'function') saveState();
          if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
          if (typeof renderSongs === 'function') renderSongs();
          bspPhoneReply({ type: 'PHONE_ADD_SONG_RESULT', ok: true, i: songs.length - 1 });
          return;
        }
      } catch (err) {
        console.error('[BSP] phone message failed', type, err);
      }
    }
