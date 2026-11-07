    // ===== LANGUES DES BIBLES =====
    // Chaque version de Bible peut porter une LANGUE (libellé libre : « Français », « Lingala »…).
    // Elle est choisie à l'import (pré-remplie avec la langue détectée dans le fichier) et sert à
    // organiser le sélecteur de versions : Langue → Version, avec recherche directe par nom.
    // Stockage : STORE_STATE { key: 'bibleLanguages', value: { version: langue } }. Voyage avec
    // l'export de configuration et la synchro téléphone.

    let bspBibleLangs = {};
    const BSP_BIBLE_LANGS_IDB_KEY = 'bibleLanguages';

    // Libellés lisibles pour les clés de detectBibleLanguage() (les autres : majuscule initiale).
    const BSP_DETECTED_LANG_LABELS = {
      fr: 'Français', hi: 'हिन्दी (Hindi)', german: 'Deutsch', spanish: 'Español', portuguese: 'Português',
      italian: 'Italiano', dutch: 'Nederlands', lingala: 'Lingala', swahili: 'Swahili', kituba: 'Kikongo (Kituba)',
      kikwango: 'Kikongo (Kikwango)', kinyarwanda: 'Kinyarwanda', kirundi: 'Kirundi', sango: 'Sango',
      russian: 'Русский', arabic: 'العربية', chinese: '中文', chinese_traditional: '中文 (繁體)', japanese: '日本語',
      korean: '한국어', greek: 'Ελληνικά', hebrew: 'עברית', polish: 'Polski', romanian: 'Română', ukrainian: 'Українська',
      haitian: 'Kreyòl ayisyen', latin: 'Latina', malagasy: 'Malagasy', yoruba: 'Yorùbá', igbo: 'Igbo', hausa: 'Hausa',
      zulu: 'isiZulu', xhosa: 'isiXhosa', amharic: 'አማርኛ', turkish: 'Türkçe', vietnamese: 'Tiếng Việt', indonesian: 'Bahasa Indonesia'
    };
    // Proposées en plus des langues déjà utilisées.
    const BSP_BIBLE_LANG_SUGGEST = ['Français', 'English', 'Lingala', 'Swahili', 'Kikongo', 'Tshiluba', 'Español', 'Português'];

    function bspBibleLangLabelFromDetected(key) {
      if (!key) return '';
      if (BSP_DETECTED_LANG_LABELS[key]) return BSP_DETECTED_LANG_LABELS[key];
      const s = String(key).replace(/_/g, ' ');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function bspBibleLangOf(ver) {
      return (ver && bspBibleLangs[ver]) ? String(bspBibleLangs[ver]) : '';
    }

    // Langues effectivement utilisées par les versions présentes, triées (+ nombre de versions).
    function bspBibleLangsInUse() {
      const counts = {};
      Object.keys(bibles || {}).forEach((v) => {
        const l = bspBibleLangOf(v);
        if (l) counts[l] = (counts[l] || 0) + 1;
      });
      return Object.keys(counts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .map((l) => ({ lang: l, count: counts[l] }));
    }

    function bspBibleLangsPersist() {
      try { idbPut(STORE_STATE, { key: BSP_BIBLE_LANGS_IDB_KEY, value: bspBibleLangs, updatedAt: Date.now() }).catch(() => {}); } catch (_) {}
    }
    async function bspBibleLangsRestore() {
      try {
        const rec = await idbGet(STORE_STATE, BSP_BIBLE_LANGS_IDB_KEY);
        bspBibleLangs = (rec && rec.value && typeof rec.value === 'object') ? rec.value : {};
      } catch (_) { bspBibleLangs = {}; }
      if (typeof bspSyncBibleVersionDropdown === 'function') bspSyncBibleVersionDropdown();
    }
    // Remplace/fusionne la carte (import de configuration).
    function bspBibleLangsMerge(map) {
      if (!map || typeof map !== 'object') return;
      Object.keys(map).forEach((v) => { if (map[v]) bspBibleLangs[v] = String(map[v]); });
      bspBibleLangsPersist();
      if (typeof bspSyncBibleVersionDropdown === 'function') bspSyncBibleVersionDropdown();
    }

    function bspSetBibleLang(ver, label) {
      if (!ver) return;
      const l = String(label || '').trim().slice(0, 60);
      if (l) bspBibleLangs[ver] = l; else delete bspBibleLangs[ver];
      bspBibleLangsPersist();
      if (typeof bspCloudMarkBibleDirty === 'function') bspCloudMarkBibleDirty(ver);
      if (typeof bspSyncBibleVersionDropdown === 'function') bspSyncBibleVersionDropdown();
      if (typeof bspPhoneScheduleSyncBroadcast === 'function') bspPhoneScheduleSyncBroadcast();
    }
    function bspForgetBibleLang(ver) {
      if (ver && bspBibleLangs[ver]) { delete bspBibleLangs[ver]; bspBibleLangsPersist(); }
    }

    // ── Fenêtre « Langue de cette Bible » ──
    // Résout la langue choisie (chaîne, éventuellement vide) ou null si annulé.
    function bspAskBibleLanguage(verName, suggested) {
      return new Promise((resolve) => {
        bspBibleLangInjectStyles();
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const used = bspBibleLangsInUse().map((x) => x.lang);
        const chips = Array.from(new Set(used.concat(BSP_BIBLE_LANG_SUGGEST))).slice(0, 14);
        const layer = document.createElement('div');
        layer.className = 'bsp-blang';
        layer.innerHTML = `
          <div class="bsp-blang__card" role="dialog" aria-modal="true">
            <h4 class="bsp-blang__title">Langue de cette Bible</h4>
            <p class="bsp-blang__ver">${esc(verName)}</p>
            <input class="bsp-blang__input" type="text" maxlength="60" placeholder="Ex. Français, Lingala, English…" value="${esc(suggested || '')}" list="bsp-blang-list">
            <datalist id="bsp-blang-list">${chips.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
            <div class="bsp-blang__chips">${chips.map((c) => `<button type="button" class="bsp-blang__chip${c === suggested ? ' on' : ''}" data-lang="${esc(c)}">${esc(c)}</button>`).join('')}</div>
            ${suggested ? '<p class="bsp-blang__hint">Langue détectée dans le fichier — modifiez-la si besoin.</p>' : ''}
            <div class="bsp-blang__row">
              <button type="button" class="bsp-blang__btn ghost" data-act="skip">Sans langue</button>
              <button type="button" class="bsp-blang__btn" data-act="ok">Enregistrer</button>
            </div>
          </div>`;
        const input = layer.querySelector('.bsp-blang__input');
        const done = (val) => { layer.remove(); document.removeEventListener('keydown', onKey, true); resolve(val); };
        const onKey = (e) => {
          if (e.key === 'Escape') { e.stopPropagation(); done(null); }
          else if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); done(input.value.trim()); }
        };
        layer.querySelectorAll('.bsp-blang__chip').forEach((b) => {
          b.addEventListener('click', () => {
            input.value = b.getAttribute('data-lang') || '';
            layer.querySelectorAll('.bsp-blang__chip').forEach((x) => x.classList.toggle('on', x === b));
            input.focus();
          });
        });
        layer.querySelector('[data-act="ok"]').addEventListener('click', () => done(input.value.trim()));
        layer.querySelector('[data-act="skip"]').addEventListener('click', () => done(''));
        layer.addEventListener('mousedown', (e) => { if (e.target === layer) done(null); });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(layer);
        setTimeout(() => { input.focus(); input.select(); }, 30);
      });
    }

    function bspBibleLangInjectStyles() {
      if (document.getElementById('bsp-blang-styles')) return;
      const st = document.createElement('style');
      st.id = 'bsp-blang-styles';
      st.textContent = `
        .bsp-blang{position:fixed;inset:0;z-index:10070;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px}
        .bsp-blang__card{width:min(420px,94vw);background:var(--bg-panel,#1b2130);color:var(--text,#e8edf6);border:1px solid var(--border,rgba(255,255,255,.14));border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:18px;display:flex;flex-direction:column;gap:10px}
        .bsp-blang__title{margin:0;font-size:15px;font-weight:800}
        .bsp-blang__ver{margin:0;font-size:12px;color:var(--text-secondary,#9fb0cc);word-break:break-word}
        .bsp-blang__input{width:100%;box-sizing:border-box;background:var(--bg-dark,#121722);color:var(--text,#e8edf6);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:8px;padding:9px 10px;font-size:13px;outline:none}
        .bsp-blang__input:focus{border-color:var(--accent,#3b82f6)}
        .bsp-blang__chips{display:flex;flex-wrap:wrap;gap:6px}
        .bsp-blang__chip{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--text,#e8edf6);border-radius:999px;padding:5px 10px;font-size:11.5px;cursor:pointer}
        .bsp-blang__chip:hover{background:rgba(255,255,255,.12)}
        .bsp-blang__chip.on{background:rgba(10,132,255,.2);border-color:var(--accent,#3b82f6);color:var(--accent,#3b82f6);font-weight:700}
        .bsp-blang__hint{margin:0;font-size:11px;color:var(--text-tertiary,#8a9bb8)}
        .bsp-blang__row{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
        .bsp-blang__btn{background:var(--accent,#3b82f6);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer}
        .bsp-blang__btn.ghost{background:rgba(255,255,255,.08);color:var(--text,#e8edf6)}`;
      document.head.appendChild(st);
    }
