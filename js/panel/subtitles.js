    // ===== SOUS-TITRES (couche lower-third) — Étape 1 : bibliothèque + couleurs =====
    // Bibliothèque réutilisable de sous-titres façon « lower third » (After Effects). Chaque
    // sous-titre : { id, type, label, value, style, position, colors:{label,value,accent,bg} }.
    //   - type   : theme | speaker | officiant | note
    //   - style  : bar | box | underline | plain (habillage visuel)
    //   - position : coin/zone d'affichage à l'écran (9 zones)
    //   - colors : couleur PAR ÉLÉMENT (libellé, texte, accent barre/boîte, fond)
    // L'affichage animé sur la projection + l'enchaînement avec verset/chant = étape 2.
    // `bspSubtitles` est déclaré dans panel-app-core.js et sauvegardé (état + export config).

    const BSP_SUBTITLE_TYPES = ['theme', 'speaker', 'officiant', 'note'];
    const BSP_SUBTITLE_STYLES = ['bar', 'box', 'underline', 'plain'];
    const BSP_SUBTITLE_POSITIONS = ['top-left','top-center','top-right','mid-left','mid-center','mid-right','bot-left','bot-center','bot-right'];
    // ROUTAGE PAR SORTIE : champs « design/anim » personnalisables par sortie (écran). Le CONTENU
    // (id, type, Libellé, Texte) reste COMMUN à toutes les sorties. Chaque sortie garde sa
    // surcharge dans sub.outputs[outputId] = { ...ces champs... } ; fusion = contenu de base +
    // design de la surcharge.
    const BSP_SUB_DESIGN_KEYS = ['style', 'position', 'fontFamily', 'fontSize', 'bold', 'italic', 'align', 'wrap', 'fmt', 'scale', 'pad', 'shadow', 'radius', 'anim', 'animMode', 'seg', 'colors', 'image', 'scene'];

    // ── 10 templates d'animation (Web Animations API) ──
    // Chaque template décrit l'état CACHÉ ; l'état MONTRÉ = {opacity:1, transform:none, ...}.
    // ENTRÉE = caché→montré (ease-out) ; SORTIE = montré→caché (ease-in) → l'anim « se joue puis
    // disparaît ». Durées d'entrée/sortie réglables par sous-titre.
    const BSP_SUB_EASE_OUT = 'cubic-bezier(0.16,1,0.3,1)';
    const BSP_SUB_EASE_IN = 'cubic-bezier(0.7,0,0.84,0)';
    // La SORTIE utilise le MÊME easing que l'ENTRÉE (demande utilisateur : « le out se fait sur
    // le même timing que le In »). L'ancien ease-in donnait une sortie sèche/quasi linéaire.
    const BSP_SUB_ANIMS = {
      'fade':        { hidden: { opacity: 0 }, inEase: 'ease', outEase: 'ease' },
      'slide-up':    { hidden: { opacity: 0, transform: 'translateY(60px)' }, inEase: BSP_SUB_EASE_OUT, outEase: BSP_SUB_EASE_OUT },
      'slide-down':  { hidden: { opacity: 0, transform: 'translateY(-60px)' }, inEase: BSP_SUB_EASE_OUT, outEase: BSP_SUB_EASE_OUT },
      'slide-left':  { hidden: { opacity: 0, transform: 'translateX(90px)' }, inEase: BSP_SUB_EASE_OUT, outEase: BSP_SUB_EASE_OUT },
      'slide-right': { hidden: { opacity: 0, transform: 'translateX(-90px)' }, inEase: BSP_SUB_EASE_OUT, outEase: BSP_SUB_EASE_OUT },
      'zoom-in':     { hidden: { opacity: 0, transform: 'scale(0.82)' }, inEase: BSP_SUB_EASE_OUT, outEase: BSP_SUB_EASE_OUT },
      'zoom-out':    { hidden: { opacity: 0, transform: 'scale(1.18)' }, inEase: BSP_SUB_EASE_OUT, outEase: BSP_SUB_EASE_OUT },
      'slide-blur':  { hidden: { opacity: 0, transform: 'translateY(44px)', filter: 'blur(12px)' }, inEase: BSP_SUB_EASE_OUT, outEase: BSP_SUB_EASE_OUT },
      'flip-x':      { hidden: { opacity: 0, transform: 'perspective(700px) rotateX(-80deg)' }, inEase: BSP_SUB_EASE_OUT, outEase: BSP_SUB_EASE_OUT },
      'linear':      { hidden: { opacity: 0, transform: 'translateY(40px)' }, inEase: 'linear', outEase: 'linear' }
    };
    const BSP_SUB_ANIM_LIST = ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'zoom-out', 'slide-blur', 'flip-x', 'linear'];

    let bspSubtitleSelectedId = null;
    let bspSubtitlePreviewTimer = 0;
    let bspSubtitlePreviewOn = false; // aperçu (dans le pop-up) : true = entrée jouée/affichée
    let bspSubtitleLiveId = null; // sous-titre diffusé PARTOUT ('all')
    let bspSubtitleLiveByOutput = {}; // plays ISOLÉS : outputId ('obs'|'remote_N') -> subId
    let bspLocalFonts = []; // polices installées sur le PC (via queryLocalFonts, sur demande)
    let bspSubtitleDesignOutput = 'obs'; // sortie éditée dans le pop-up ('obs'=Live/base, sinon écran)
    let bspSubtitleWork = null;          // objet de travail persistant { id, outId, obj } (voir getWork)

    // Objet de sous-titre ÉDITÉ pour la sortie courante : pour 'obs' c'est la base elle-même ;
    // pour un écran, un objet fusionné (contenu de base + design de la surcharge) PERSISTANT entre
    // deux rendus (les éditions s'y accumulent), synchronisé vers la base à chaque commit. Réutilisé
    // tant que (id, sortie) ne changent pas — sinon re-fusionné depuis la base.
    function bspSubtitleGetWork(baseSub, outId) {
      if (!outId || outId === 'obs') return baseSub;
      if (bspSubtitleWork && bspSubtitleWork.id === baseSub.id && bspSubtitleWork.outId === outId) return bspSubtitleWork.obj;
      // TOUJOURS un CLONE pour un écran (jamais la base — sinon l'édition modifierait le Live).
      const merged = bspSubtitleMergeForOutput(baseSub, outId);
      let obj;
      if (merged !== baseSub) { obj = merged; } // déjà un clone normalisé (surcharge existante)
      else { let c; try { c = JSON.parse(JSON.stringify(baseSub)); } catch (_) { c = Object.assign({}, baseSub); } delete c.outputs; obj = bspNormalizeSubtitle(c); }
      bspSubtitleWork = { id: baseSub.id, outId: outId, obj: obj };
      return obj;
    }
    // Liste des sorties disponibles pour le routage : Live + écrans ajoutés.
    function bspSubtitleOutputList() {
      const list = [['obs', bspSubtitleT('subtitle_output_live', 'Live')]];
      if (typeof bspScreensAdded !== 'undefined' && Array.isArray(bspScreensAdded)) {
        bspScreensAdded.forEach((s) => { if (s && s.id) list.push([s.id, (typeof bspDesignTargetLabel === 'function' ? bspDesignTargetLabel(s.id) : (s.name || s.id))]); });
      }
      return list;
    }

    // Récupère les polices INSTALLÉES sur le PC (Local Font Access API — nécessite un geste
    // utilisateur + permission ; dispo dans l'app Electron). Les familles sont ajoutées à la liste
    // des polices proposées pour les sous-titres. Une famille installée s'utilise directement en
    // CSS `font-family:<nom>` (l'affichage doit avoir la police pour la rendre).
    async function bspLoadLocalFonts() {
      if (typeof window === 'undefined' || typeof window.queryLocalFonts !== 'function') {
        if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_fonts_pc_na', 'Polices du PC indisponibles ici (ouvrez l’app).'));
        return false;
      }
      try {
        const fonts = await window.queryLocalFonts();
        const set = new Set(bspLocalFonts);
        (fonts || []).forEach((f) => { if (f && f.family) set.add(f.family); });
        bspLocalFonts = Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
        if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_fonts_pc_ok', 'Polices du PC chargées') + ' (' + bspLocalFonts.length + ')');
        return true;
      } catch (e) {
        if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_fonts_pc_fail', 'Chargement des polices du PC refusé'));
        return false;
      }
    }
    if (typeof window !== 'undefined') window.bspLoadLocalFonts = bspLoadLocalFonts;

    function bspSubtitleUid() { return 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function bspSubtitleT(key, fallback) {
      const v = (typeof t === 'function') ? t(key) : null;
      return (v && v !== key) ? v : fallback;
    }
    function bspSubtitleTypeLabel(type) {
      return bspSubtitleT('subtitle_type_' + type, ({ theme: 'Thème', speaker: 'Orateur', officiant: 'Officiant', note: 'Note' })[type] || type);
    }
    function bspSubtitleDefaultColors() { return { label: '#FF2D55', value: '#FFFFFF', accent: '#FF2D55', bg: '#000000B3' }; }
    // Couleur SIGNATURE par catégorie (chaque type a sa couleur). Utilisée à la création et quand
    // on change la catégorie d'un sous-titre.
    function bspSubtitleTypeColors(type) {
      const map = {
        theme: '#0AA2FF',      // bleu
        speaker: '#FF2D55',    // rouge/rose
        officiant: '#FFD24A',  // ambre
        note: '#34C759'        // vert
      };
      const accent = map[type] || '#FF2D55';
      return { label: accent, value: '#FFFFFF', accent: accent, bg: '#000000B3' };
    }
    function bspSubNum(v, lo, hi, d) { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; }

    function bspNormalizeSubtitle(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const type = BSP_SUBTITLE_TYPES.indexOf(raw.type) !== -1 ? raw.type : 'note';
      const dc = bspSubtitleDefaultColors();
      const c = (raw.colors && typeof raw.colors === 'object') ? raw.colors : {};
      const p = (raw.pad && typeof raw.pad === 'object') ? raw.pad : {};
      return {
        id: raw.id || bspSubtitleUid(),
        type,
        label: (raw.label != null) ? String(raw.label) : bspSubtitleTypeLabel(type),
        value: (raw.value != null) ? String(raw.value) : '',
        style: BSP_SUBTITLE_STYLES.indexOf(raw.style) !== -1 ? raw.style : 'bar',
        position: BSP_SUBTITLE_POSITIONS.indexOf(raw.position) !== -1 ? raw.position : 'bot-left',
        // Typographie (échelle « canvas » 1920×1080 ; l'aperçu et l'affichage réel s'y calent).
        // fontFamily / wrap restent COMMUNS ; taille/gras/italique/casse/alignement sont SÉPARÉS
        // pour le Libellé et le Texte (voir `fmt`). fontSize/bold/italic/align conservés pour
        // compat/migration.
        fontFamily: (raw.fontFamily != null) ? String(raw.fontFamily) : '',
        fontSize: bspSubNum(raw.fontSize, 8, 400, 48),
        bold: (raw.bold != null) ? !!raw.bold : true,
        italic: !!raw.italic,
        align: ['left', 'center', 'right'].indexOf(raw.align) !== -1 ? raw.align : 'left',
        wrap: !!raw.wrap,
        // Formatage SÉPARÉ Libellé / Texte : taille, gras, italique, casse (none/upper/lower),
        // alignement — chacun le sien. Migré depuis les anciens champs communs si `fmt` absent.
        fmt: (function () {
          const f = (raw.fmt && typeof raw.fmt === 'object') ? raw.fmt : {};
          const baseSize = bspSubNum(raw.fontSize, 8, 400, 48);
          const baseBold = (raw.bold != null) ? !!raw.bold : true;
          const baseItalic = !!raw.italic;
          const baseAlign = ['left', 'center', 'right'].indexOf(raw.align) !== -1 ? raw.align : 'left';
          const one = (src, defs) => {
            const s = (src && typeof src === 'object') ? src : {};
            return {
              size: bspSubNum(s.size, 6, 400, defs.size),
              bold: (s.bold != null) ? !!s.bold : defs.bold,
              italic: (s.italic != null) ? !!s.italic : defs.italic,
              transform: ['none', 'upper', 'lower'].indexOf(s.transform) !== -1 ? s.transform : defs.transform,
              align: ['left', 'center', 'right'].indexOf(s.align) !== -1 ? s.align : defs.align
            };
          };
          return {
            label: one(f.label, { size: Math.max(8, Math.round(baseSize * 0.42)), bold: true, italic: false, transform: 'upper', align: baseAlign }),
            value: one(f.value, { size: baseSize, bold: baseBold, italic: baseItalic, transform: 'none', align: baseAlign })
          };
        })(),
        scale: bspSubNum(raw.scale, 0.3, 3, 1),                 // taille GLOBALE (multiplicateur)
        pad: {                                                   // padding INTERNE (px canvas)
          top: bspSubNum(p.top, 0, 400, 14), right: bspSubNum(p.right, 0, 400, 26),
          bottom: bspSubNum(p.bottom, 0, 400, 14), left: bspSubNum(p.left, 0, 400, 26)
        },
        shadow: (function () { const s = (raw.shadow && typeof raw.shadow === 'object') ? raw.shadow : {};
          return { on: (s.on != null) ? !!s.on : true, color: String(s.color || '#000000CC'),
                   blur: bspSubNum(s.blur, 0, 100, 10), x: bspSubNum(s.x, -60, 60, 0), y: bspSubNum(s.y, -60, 60, 4) }; })(),
        // Coins arrondis du fond (plaque) : uniforme (all) OU par coin (tl/tr/br/bl). px canvas.
        radius: (function () { const r = (raw.radius && typeof raw.radius === 'object') ? raw.radius : {};
          return { uniform: (r.uniform != null) ? !!r.uniform : true, all: bspSubNum(r.all, 0, 300, 0),
                   tl: bspSubNum(r.tl, 0, 300, 0), tr: bspSubNum(r.tr, 0, 300, 0), br: bspSubNum(r.br, 0, 300, 0), bl: bspSubNum(r.bl, 0, 300, 0) }; })(),
        anim: (function () { const a = (raw.anim && typeof raw.anim === 'object') ? raw.anim : {};
          return { template: BSP_SUB_ANIM_LIST.indexOf(a.template) !== -1 ? a.template : 'slide-up',
                   inMs: bspSubNum(a.inMs, 0, 5000, 500), outMs: bspSubNum(a.outMs, 0, 5000, 450) }; })(),
        // Module d'animation : 'global' (tout ensemble) OU 'segmented' (chaque élément — accent,
        // libellé, texte — a SA propre animation, jouée en séquence).
        animMode: (raw.animMode === 'segmented') ? 'segmented' : 'global',
        seg: (function () {
          // bg (plaque de fond) et image (photo) utilisent par défaut un révélé NON translatant
          // (zoom) pour éviter d'emporter le texte qu'ils contiennent/accompagnent.
          const segDef = {
            bg: { template: 'zoom-in', inMs: 350, outMs: 300 },
            image: { template: 'zoom-in', inMs: 350, outMs: 300 },
            accent: { template: 'slide-right', inMs: 350, outMs: 300 },
            label: { template: 'slide-up', inMs: 400, outMs: 300 },
            value: { template: 'slide-up', inMs: 450, outMs: 350 }
          };
          const sr = (raw.seg && typeof raw.seg === 'object') ? raw.seg : {};
          const one = (k) => { const s = (sr[k] && typeof sr[k] === 'object') ? sr[k] : {}; const d = segDef[k];
            return { template: BSP_SUB_ANIM_LIST.indexOf(s.template) !== -1 ? s.template : d.template, inMs: bspSubNum(s.inMs, 0, 5000, d.inMs), outMs: bspSubNum(s.outMs, 0, 5000, d.outMs) }; };
          // Ordre d'apparition CHOISI par l'utilisateur : permutation des éléments connus (les
          // manquants sont complétés dans l'ordre par défaut, doublons/inconnus retirés).
          const KEYS = ['bg', 'image', 'accent', 'label', 'value'];
          let order = Array.isArray(sr.order) ? sr.order.filter((k) => KEYS.indexOf(k) !== -1) : [];
          order = order.filter((k, i) => order.indexOf(k) === i);
          KEYS.forEach((k) => { if (order.indexOf(k) === -1) order.push(k); });
          return { bg: one('bg'), image: one('image'), accent: one('accent'), label: one('label'), value: one('value'), order: order };
        })(),
        colors: {
          label: String(c.label || dc.label),
          value: String(c.value || dc.value),
          accent: String(c.accent || dc.accent),
          bg: String(c.bg || dc.bg)
        },
        // Photo (Orateur/Officiant… — tous types). Réf. légère vers la banque média
        // (`bank:<id>`) : les octets vivent dans IndexedDB, l'export config ne garde que la
        // réf. La vignette est un CERCLE placé au-dessus / à gauche / à droite du texte ; le
        // fond derrière la photo peut être VIDE (transparent) pour les PNG détourés.
        image: (function () {
          const im = (raw.image && typeof raw.image === 'object') ? raw.image : {};
          const o = {
            on: !!im.on,
            ref: (typeof im.ref === 'string' && im.ref) ? im.ref : '',
            shape: 'circle',
            position: ['above', 'left', 'right'].indexOf(im.position) !== -1 ? im.position : 'left',
            size: bspSubNum(im.size, 40, 480, 120),
            bg: (typeof im.bg === 'string') ? im.bg : '' // '' = transparent
          };
          // `_src` = data URL EMBARQUÉE par la diffusion (l'affichage re-normalise et n'a pas
          // accès à la banque média). Transitoire : jamais présent dans les modèles du panneau,
          // donc jamais persisté/exporté ; on le préserve seulement s'il arrive dans `raw`.
          if (typeof im._src === 'string' && im._src) o._src = im._src;
          return o;
        })(),
        // Fond de SCÈNE plein cadre (16:9), DERRIÈRE tout le sous-titre. Couleur unie, dégradé,
        // ou image (banque média, réf. légère + data URL embarquée en diffusion). `opacity` = tout
        // le calque (transparence : là où c'est transparent, la projection passe à travers).
        scene: (function () {
          const sc = (raw.scene && typeof raw.scene === 'object') ? raw.scene : {};
          const o = {
            type: ['none', 'solid', 'gradient', 'image'].indexOf(sc.type) !== -1 ? sc.type : 'none',
            color: String(sc.color || '#000000FF'),
            gradFrom: String(sc.gradFrom || '#000000FF'),
            gradTo: String(sc.gradTo || '#00000000'),
            gradAngle: bspSubNum(sc.gradAngle, 0, 360, 180),
            ref: (typeof sc.ref === 'string' && sc.ref) ? sc.ref : '',
            fit: ['cover', 'contain'].indexOf(sc.fit) !== -1 ? sc.fit : 'cover',
            opacity: bspSubNum(sc.opacity, 0, 100, 100),
            // Fondu du fond de scène (entrée/sortie), durées réglables dans les paramètres d'animation.
            fadeInMs: bspSubNum(sc.fadeInMs, 0, 5000, 400),
            fadeOutMs: bspSubNum(sc.fadeOutMs, 0, 5000, 400)
          };
          if (typeof sc._src === 'string' && sc._src) o._src = sc._src; // data URL embarquée (diffusion)
          return o;
        })(),
        // Surcharges de design PAR SORTIE (écran). Stockées telles quelles (champs design bruts) ;
        // normalisées à la fusion. 'obs' (Live) = base, jamais stocké ici.
        outputs: (function () {
          const src = (raw.outputs && typeof raw.outputs === 'object') ? raw.outputs : {};
          const out = {};
          Object.keys(src).forEach((id) => {
            if (!id || id === 'obs') return;
            const ov = src[id];
            if (ov && typeof ov === 'object') {
              const clean = {};
              BSP_SUB_DESIGN_KEYS.forEach((k) => { if (ov[k] !== undefined) clean[k] = ov[k]; });
              out[id] = clean;
            }
          });
          return out;
        })()
      };
    }

    // Clone des champs DESIGN d'un sous-titre (pour initialiser une surcharge de sortie depuis la base).
    function bspSubtitleDesignClone(sub) {
      const o = {};
      BSP_SUB_DESIGN_KEYS.forEach((k) => { try { o[k] = JSON.parse(JSON.stringify(sub[k])); } catch (_) { o[k] = sub[k]; } });
      return o;
    }
    // Sous-titre EFFECTIF pour une sortie : contenu de base + design de la surcharge (si elle
    // existe), re-normalisé. 'obs'/absent → la base telle quelle.
    function bspSubtitleMergeForOutput(sub, outId) {
      if (!outId || outId === 'obs' || !sub.outputs || !sub.outputs[outId]) return sub;
      let merged;
      try { merged = JSON.parse(JSON.stringify(sub)); } catch (_) { merged = sub; }
      const ov = sub.outputs[outId] || {};
      BSP_SUB_DESIGN_KEYS.forEach((k) => { if (ov[k] !== undefined) { try { merged[k] = JSON.parse(JSON.stringify(ov[k])); } catch (_) { merged[k] = ov[k]; } } });
      delete merged.outputs;
      return bspNormalizeSubtitle(merged);
    }

    // Persistance / (dé)sérialisation — appelées par bootstrap (boot) et config-io (export/import).
    function bspSubtitlesLoad(list) {
      bspSubtitles = Array.isArray(list) ? list.map(bspNormalizeSubtitle).filter(Boolean) : [];
    }
    function bspSubtitlesExport() {
      return Array.isArray(bspSubtitles) ? JSON.parse(JSON.stringify(bspSubtitles)) : [];
    }
    function bspSubtitlesPersist() {
      if (typeof saveState === 'function') saveState();
      if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
    }

    // ── PRESET ISOLÉ : export/import des SOUS-TITRES SEULS (fichier .json à part) ──
    // Le preset est AUTONOME : il embarque les médias (photos/scènes) référencés par `bank:<id>`,
    // pour que les images survivent à l'import sur une autre machine.
    function bspSubtitlesMediaRefs(list) {
      const ids = new Set();
      const add = (ref) => { if (typeof ref === 'string' && ref.indexOf('bank:') === 0) ids.add(ref.slice(5)); };
      (list || []).forEach((s) => {
        if (!s) return;
        if (s.image) add(s.image.ref);
        if (s.scene) add(s.scene.ref);
        if (s.outputs) Object.keys(s.outputs).forEach((oid) => { const ov = s.outputs[oid] || {}; if (ov.image) add(ov.image.ref); if (ov.scene) add(ov.scene.ref); });
      });
      return Array.from(ids);
    }
    function bspSubtitlesExportPreset() {
      const subs = bspSubtitlesExport();
      const media = [];
      bspSubtitlesMediaRefs(subs).forEach((id) => { const m = (typeof bspMediaGet === 'function') ? bspMediaGet(id) : null; if (m && m.dataUrl) media.push({ id: m.id, name: m.name, type: m.type, dataUrl: m.dataUrl }); });
      const preset = { app: 'Bible Song Pro', kind: 'subtitle', bspSubtitlePreset: 1, exportedAt: Date.now(), count: subs.length, subtitles: subs, media: media };
      try {
        const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'EEAM-sous-titres_' + new Date().toISOString().slice(0, 10) + '.eeamsub';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_preset_saved', 'Preset sous-titres exporté') + ' (' + subs.length + ')');
      } catch (e) { if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_preset_err', 'Échec de l’export du preset')); }
    }
    async function bspSubtitlesApplyPreset(data, mode) {
      // ENCODAGE DÉDIÉ : on n'accepte QU'un fichier sous-titres (.eeamsub) — refus d'un autre type.
      if (!data || (data.kind && data.kind !== 'subtitle') || !Array.isArray(data.subtitles)) { if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_preset_bad', 'Fichier de preset invalide (attendu : .eeamsub)')); return; }
      // Restaure les médias en GARDANT leur id (les refs bank:<id> résolvent alors).
      if (Array.isArray(data.media) && typeof bspMediaBank !== 'undefined') {
        for (const m of data.media) {
          if (!m || !m.id || !m.dataUrl || bspMediaBank[m.id]) continue;
          const rec = { id: m.id, name: m.name || 'media', type: m.type === 'video' ? 'video' : 'image', dataUrl: m.dataUrl, size: (m.dataUrl || '').length, createdAt: Date.now() };
          bspMediaBank[m.id] = rec;
          try { if (typeof openDb === 'function') await openDb(); if (typeof idbPut === 'function') await idbPut(STORE_MEDIA, rec); } catch (_) {}
        }
      }
      const incoming = data.subtitles.map(bspNormalizeSubtitle).filter(Boolean);
      if (mode === 'replace') { bspSubtitles = incoming; }
      else { incoming.forEach((s) => { s.id = bspSubtitleUid(); bspSubtitles.push(s); }); } // ajout : ids neufs
      bspSubtitleSelectedId = (mode === 'replace') ? (bspSubtitles[0] && bspSubtitles[0].id) : (incoming[0] && incoming[0].id);
      bspSubtitleWork = null;
      bspSubtitlesPersist();
      bspRenderSubtitleLibrary();
      if (typeof bspPhoneScheduleSyncBroadcast === 'function') bspPhoneScheduleSyncBroadcast();
      if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_preset_loaded', 'Preset chargé') + ' (' + incoming.length + ')');
    }
    // `replace` optionnel (bouton dédié). Par défaut : AJOUT (non destructif).
    function bspSubtitlesImportPreset(replace) {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.eeamsub,application/json,.json'; inp.style.display = 'none';
      inp.onchange = () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          let data; try { data = JSON.parse(reader.result); } catch (_) { if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_preset_bad', 'Fichier de preset invalide')); return; }
          bspSubtitlesApplyPreset(data, replace ? 'replace' : 'append');
        };
        reader.readAsText(file);
      };
      document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 1500);
    }
    if (typeof window !== 'undefined') {
      window.bspSubtitlesExportPreset = bspSubtitlesExportPreset;
      window.bspSubtitlesImportPreset = bspSubtitlesImportPreset;
    }
    function bspGetSubtitle(id) { return (Array.isArray(bspSubtitles) ? bspSubtitles.find((x) => x && x.id === id) : null) || null; }

    // ── Diffusion sur la projection RÉELLE (Live + écrans) ──
    // Envoie un message SUBTITLE via le même canal que les UPDATE (broadcastMessage → OBS/écrans/
    // relais). L'affichage (BSP_display) fait l'enchaînement : fondu du verset/chant → sous-titre,
    // et inverse au retour du contenu.
    // Bake les data URL image/scène d'un sous-titre normalisé (diffusion).
    function bspSubtitleBakeSrc(m) {
      if (m.image && m.image.on && m.image.ref && typeof bspResolveMediaRef === 'function') m.image._src = bspResolveMediaRef(m.image.ref) || '';
      if (m.scene && m.scene.type === 'image' && m.scene.ref && typeof bspResolveMediaRef === 'function') m.scene._src = bspResolveMediaRef(m.scene.ref) || '';
      return m;
    }
    // `target` : 'all' (partout, défaut) OU un outputId ('obs' = Live/OBS seul, 'remote_N' = un
    // écran seul). Un message ciblé porte `msg.target` : seul cet affichage y réagit.
    function bspSubtitleBroadcast(action, sub, target) {
      if (typeof broadcastMessage !== 'function') return;
      target = target || 'all';
      const msg = { type: 'SUBTITLE', proto: 1, sender: 'control', ts: Date.now(), action: action };
      if (typeof nextSeq === 'function') msg.seq = nextSeq();
      if (target !== 'all') msg.target = target;
      if (action === 'show' && sub) {
        if (target !== 'all') {
          // Play ISOLÉ : on envoie DIRECTEMENT la variante de cette sortie ('obs' = base).
          const m = bspSubtitleBakeSrc(bspSubtitleMergeForOutput(sub, target));
          msg.sub = JSON.parse(JSON.stringify(m));
        } else {
          const norm = bspSubtitleBakeSrc(bspNormalizeSubtitle(sub));
          msg.sub = JSON.parse(JSON.stringify(norm));
          // Partout : chaque écran applique subByOutput[son id] s'il existe, sinon la base.
          if (sub.outputs && Object.keys(sub.outputs).length) {
            const byOut = {};
            Object.keys(sub.outputs).forEach((id) => { byOut[id] = JSON.parse(JSON.stringify(bspSubtitleBakeSrc(bspSubtitleMergeForOutput(sub, id)))); });
            msg.subByOutput = byOut;
          }
        }
      }
      broadcastMessage(msg);
    }
    function bspSubtitleGoLive(id, target) {
      const sub = bspGetSubtitle(id || bspSubtitleSelectedId);
      if (!sub) return;
      target = target || 'all';
      if (target === 'all') bspSubtitleLiveId = sub.id; else bspSubtitleLiveByOutput[target] = sub.id;
      bspSubtitleBroadcast('show', sub, target);
      if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_broadcasting', 'Sous-titre diffusé') + (target !== 'all' ? ' — ' + bspSubtitleOutputName(target) : ''));
      bspRenderSubtitleLibrary();
      if (typeof bspPhoneScheduleSyncBroadcast === 'function') bspPhoneScheduleSyncBroadcast();
    }
    function bspSubtitleHideLive(target) {
      target = target || 'all';
      if (target === 'all') bspSubtitleLiveId = null; else delete bspSubtitleLiveByOutput[target];
      bspSubtitleBroadcast('hide', null, target);
      if (typeof showToast === 'function') showToast(bspSubtitleT('subtitle_hidden', 'Sous-titre masqué'));
      bspRenderSubtitleLibrary();
      if (typeof bspPhoneScheduleSyncBroadcast === 'function') bspPhoneScheduleSyncBroadcast();
    }
    // Sous-titre actuellement live pour une cible ('all' ou un outputId).
    function bspSubtitleLiveFor(target) {
      target = target || 'all';
      return target === 'all' ? bspSubtitleLiveId : (bspSubtitleLiveByOutput[target] || null);
    }
    // Bascule : play(ON) = diffuser sur la cible ; play(OFF) = masquer sur la cible.
    function bspSubtitleToggleLive(id, target) {
      const wanted = id || bspSubtitleSelectedId;
      if (bspSubtitleLiveFor(target) === wanted) bspSubtitleHideLive(target);
      else bspSubtitleGoLive(wanted, target);
    }
    function bspSubtitleOutputName(id) {
      if (id === 'all') return bspSubtitleT('subtitle_target_all', 'Tous les écrans');
      if (id === 'obs') return bspSubtitleT('subtitle_output_live', 'Live');
      return (typeof bspDesignTargetLabel === 'function' ? bspDesignTargetLabel(id) : id);
    }
    window.bspSubtitleGoLive = bspSubtitleGoLive;
    window.bspSubtitleHideLive = bspSubtitleHideLive;
    window.bspSubtitleToggleLive = bspSubtitleToggleLive;

    // ── CRUD ──────────────────────────────────────────────────────────────────────
    function bspAddSubtitle(type) {
      if (!Array.isArray(bspSubtitles)) bspSubtitles = [];
      const t = BSP_SUBTITLE_TYPES.indexOf(type) !== -1 ? type : 'note';
      const s = bspNormalizeSubtitle({ type: t, colors: bspSubtitleTypeColors(t) });
      bspSubtitles.push(s);
      bspSubtitleSelectedId = s.id;
      bspSubtitlesPersist();
      bspRenderSubtitleLibrary();
      return s;
    }
    // Duplique un sous-titre (design + anim + surcharges par sortie), nouvelle id, inséré juste
    // après l'original et sélectionné — pour re-servir la même config et juste changer la catégorie.
    function bspSubtitleDuplicate(id) {
      const i = bspSubtitles.findIndex((x) => x && x.id === id);
      if (i === -1) return null;
      let clone;
      try { clone = JSON.parse(JSON.stringify(bspSubtitles[i])); } catch (_) { clone = Object.assign({}, bspSubtitles[i]); }
      clone.id = bspSubtitleUid();
      const s = bspNormalizeSubtitle(clone);
      bspSubtitles.splice(i + 1, 0, s);
      bspSubtitleSelectedId = s.id;
      bspSubtitleWork = null;
      bspSubtitlesPersist();
      bspRenderSubtitleLibrary();
      return s;
    }
    // Change la CATÉGORIE d'un sous-titre : applique la couleur signature de la catégorie et, si le
    // libellé était celui par défaut de l'ancienne catégorie, le met à jour.
    function bspSubtitleSetType(baseSub, newType) {
      if (!baseSub || BSP_SUBTITLE_TYPES.indexOf(newType) === -1) return;
      const oldDefaultLabel = bspSubtitleTypeLabel(baseSub.type);
      baseSub.type = newType;
      if (!baseSub.label || baseSub.label === oldDefaultLabel) baseSub.label = bspSubtitleTypeLabel(newType);
      baseSub.colors = bspSubtitleTypeColors(newType);
      bspSubtitleWork = null;
      bspSubtitlesPersist();
      bspRenderSubtitleLibrary();
    }
    function bspDeleteSubtitleNow(id) {
      const i = bspSubtitles.findIndex((x) => x && x.id === id);
      if (i === -1) return;
      bspSubtitles.splice(i, 1);
      if (bspSubtitleSelectedId === id) { bspSubtitleSelectedId = bspSubtitles.length ? bspSubtitles[0].id : null; bspSubtitleWork = null; }
      bspSubtitlesPersist();
      bspRenderSubtitleLibrary();
    }
    // Suppression AVEC confirmation (pop-up d'avertissement — action irréversible).
    function bspDeleteSubtitle(id) {
      const sub = bspGetSubtitle(id);
      if (!sub) return;
      const name = (sub.value || sub.label || bspSubtitleTypeLabel(sub.type) || '').toString().slice(0, 60);
      const title = bspSubtitleT('subtitle_delete_title', 'Supprimer ce sous-titre ?');
      const msg = bspSubtitleT('subtitle_delete_confirm', 'Cette action est irréversible.') + (name ? ('\n\n« ' + name + ' »') : '');
      if (typeof showConfirm === 'function') {
        showConfirm(title, msg, (ok) => { if (ok) bspDeleteSubtitleNow(id); });
        // La modale de confirmation partage le z-index de la modale sous-titres : on la met AU-DESSUS.
        const cm = document.getElementById('confirmModal'); if (cm) cm.style.zIndex = '3000';
      } else if (typeof window !== 'undefined' && window.confirm) {
        if (window.confirm(title + '\n' + msg)) bspDeleteSubtitleNow(id);
      } else {
        bspDeleteSubtitleNow(id);
      }
    }
    function bspSelectSubtitle(id) { bspSubtitleSelectedId = id; bspRenderSubtitleLibrary(); }

    // ── Rendu de la carte lower-third (réutilisé par l'aperçu ; l'étape 2 le réutilisera pour
    //    l'affichage réel). Retourne un élément positionné dans un « stage » 16:9. ──
    function bspSubtitleCardHtml(sub) {
      const c = sub.colors || bspSubtitleDefaultColors();
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const scale = sub.scale || 1;
      // Formatage SÉPARÉ Libellé (lf) / Texte (vf) : taille, gras, italique, casse, alignement.
      const fmt = sub.fmt || {};
      const lf = fmt.label || { size: 20, bold: true, italic: false, transform: 'upper', align: 'left' };
      const vf = fmt.value || { size: 48, bold: true, italic: false, transform: 'none', align: 'left' };
      const caseCss = (tr) => tr === 'upper' ? 'text-transform:uppercase;' : (tr === 'lower' ? 'text-transform:lowercase;' : 'text-transform:none;');
      const lSize = Math.max(6, (lf.size || 20) * scale);
      const vSize = Math.max(6, (vf.size || 48) * scale);
      const p = sub.pad || { top: 14, right: 26, bottom: 14, left: 26 };
      const padCss = `${p.top * scale}px ${p.right * scale}px ${p.bottom * scale}px ${p.left * scale}px`;
      const ff = sub.fontFamily ? `font-family:${sub.fontFamily};` : '';
      const align = vf.align || 'left'; // alignement « conteneur » = celui du Texte
      const ws = sub.wrap ? 'normal' : 'nowrap';
      const sh = sub.shadow || {};
      const shOn = sh.on !== false;
      const shCol = sh.color || '#000000CC';
      const txtShadow = shOn ? `text-shadow:${(sh.x || 0) * scale}px ${(sh.y || 0) * scale}px ${(sh.blur || 0) * scale}px ${shCol};` : '';
      const boxShadow = shOn ? `box-shadow:${(sh.x || 0) * scale}px ${(sh.y || 0) * scale}px ${((sh.blur || 0) + 6) * scale}px ${shCol};` : '';
      const label = esc(sub.label);
      const rawVal = (sub.value != null ? String(sub.value) : '');
      const value = rawVal ? esc(rawVal).replace(/\n/g, '<br>') : `<span style="opacity:.4">${esc(bspSubtitleT('subtitle_value_ph', 'Texte…'))}</span>`;
      const lStyle = `margin:0;color:${c.label};font-size:${lSize}px;font-weight:${lf.bold ? 800 : 400};font-style:${lf.italic ? 'italic' : 'normal'};${caseCss(lf.transform)}text-align:${lf.align || 'left'};letter-spacing:.04em;line-height:1.15;${ff}${txtShadow}`;
      const vStyle = `margin:0;color:${c.value};font-size:${vSize}px;font-weight:${vf.bold ? 800 : 400};font-style:${vf.italic ? 'italic' : 'normal'};${caseCss(vf.transform)}text-align:${vf.align || 'left'};line-height:1.18;${ff}${txtShadow}`;
      const labelHtml = label ? `<div data-sub-el="label" style="${lStyle}">${label}</div>` : '';
      const valueHtml = `<div data-sub-el="value" style="${vStyle}">${value}</div>`;
      // Coins arrondis de la plaque de fond (uniforme OU par coin, × échelle).
      const rd = sub.radius || { uniform: true, all: 0, tl: 0, tr: 0, br: 0, bl: 0 };
      const brad = rd.uniform
        ? `border-radius:${(rd.all || 0) * scale}px;`
        : `border-radius:${(rd.tl || 0) * scale}px ${(rd.tr || 0) * scale}px ${(rd.br || 0) * scale}px ${(rd.bl || 0) * scale}px;`;
      // Avec une photo, le texte ne doit plus être bridé à 70% de LUI-MÊME (dans un flex
      // shrink-to-fit la plaque se retrouvait rognée) : on laisse la plaque prendre tout le
      // texte et on plafonne au niveau du conteneur photo.
      const imgOn = !!(sub.image && sub.image.on);
      const maxW = imgOn ? '100%' : '70%';
      const base = `display:inline-block;max-width:${maxW};text-align:${align};white-space:${ws};box-sizing:border-box;`;
      // La PLAQUE de fond est une couche À PART (`data-sub-el="bg"`), absolue DERRIÈRE le contenu :
      // elle peut donc s'animer indépendamment (sans masquer le texte) et le mode segmenté la
      // trouve comme n'importe quel autre élément. Le contenu est un frère au-dessus (z-index 1).
      const plateWrap = (contentHtml) => `<div style="${base}position:relative;padding:${padCss}"><div data-sub-el="bg" style="position:absolute;inset:0;background:${c.bg};${brad}${boxShadow};z-index:0"></div><div style="position:relative;z-index:1;text-align:${align}">${contentHtml}</div></div>`;
      let inner;
      if (sub.style === 'bar') {
        const barW = Math.max(3, 6 * scale);
        inner = plateWrap(`<div style="display:flex;align-items:stretch;gap:${Math.round(12 * scale)}px;text-align:${align}"><div data-sub-el="accent" style="flex:none;width:${barW}px;background:${c.accent};border-radius:${Math.round(barW / 2)}px"></div><div style="min-width:0">${labelHtml}${valueHtml}</div></div>`);
      } else if (sub.style === 'box') {
        // 'box' : pas de plaque unifiée (chip libellé + chip texte, chacun son fond).
        const lbox = label ? `<div data-sub-el="label" style="display:inline-block;background:${c.accent};color:${c.label};font-size:${lSize}px;font-weight:${lf.bold ? 800 : 400};font-style:${lf.italic ? 'italic' : 'normal'};${caseCss(lf.transform)}letter-spacing:.04em;padding:${Math.round(4 * scale)}px ${Math.round(12 * scale)}px;${brad}${ff}${boxShadow}">${label}</div>` : '';
        inner = `<div style="${base}text-align:${align}">${lbox}<div data-sub-el="value" style="${vStyle};background:${c.bg};padding:${padCss};display:inline-block;${brad}${boxShadow}">${value}</div></div>`;
      } else if (sub.style === 'underline') {
        const uW = Math.max(2, 4 * scale);
        inner = plateWrap(`${labelHtml}<div style="display:inline-block"><div data-sub-el="value" style="${vStyle}">${value}</div><div data-sub-el="accent" style="height:${uW}px;background:${c.accent};margin-top:${Math.round(3 * scale)}px;border-radius:${uW}px"></div></div>`);
      } else {
        inner = plateWrap(`${labelHtml}${valueHtml}`);
      }
      // Vignette photo (cercle) — au-dessus / gauche / droite du texte. `_src` = data URL
      // embarquée (diffusion) ; sinon on résout la réf. banque (aperçu panneau). Fond
      // derrière la photo réglable, VIDE = transparent (PNG détourés).
      const img = sub.image || {};
      if (img.on) {
        const src = img._src || ((typeof bspResolveMediaRef === 'function' && img.ref) ? bspResolveMediaRef(img.ref) : '');
        const sz = Math.max(20, (img.size || 120) * scale);
        const bg = img.bg ? img.bg : 'transparent';
        const media = src
          ? `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.55);font-size:${Math.round(sz * 0.42)}px">👤</div>`;
        const avatar = `<div data-sub-el="image" style="flex:none;width:${sz}px;height:${sz}px;border-radius:50%;overflow:hidden;background:${bg};${boxShadow}">${media}</div>`;
        const gap = Math.round(18 * scale);
        if (img.position === 'above') {
          const ai = align === 'right' ? 'flex-end' : (align === 'center' ? 'center' : 'flex-start');
          // La colonne se dimensionne au contenu (texte), la plaque prend donc toute sa largeur ;
          // on plafonne au conteneur (78% du canvas) au lieu de brider la plaque à 70% d'elle-même.
          return `<div style="display:inline-flex;flex-direction:column;gap:${gap}px;align-items:${ai};max-width:78%">${avatar}${inner}</div>`;
        }
        const parts = img.position === 'right' ? (inner + avatar) : (avatar + inner);
        return `<div style="display:inline-flex;gap:${gap}px;align-items:center;max-width:84%">${parts}</div>`;
      }
      return inner;
    }

    // Style CSS du fond de SCÈNE plein cadre (couleur / dégradé / image). `_src` = data URL
    // embarquée (diffusion) ; sinon on résout la réf. banque (aperçu panneau). L'opacité du
    // calque est appliquée à part (transparence globale).
    function bspSubtitleSceneStyle(scene) {
      if (!scene || scene.type === 'none') return '';
      let bg = '';
      if (scene.type === 'solid') bg = `background:${scene.color};`;
      else if (scene.type === 'gradient') bg = `background:linear-gradient(${scene.gradAngle || 0}deg, ${scene.gradFrom}, ${scene.gradTo});`;
      else if (scene.type === 'image') {
        const src = scene._src || ((typeof bspResolveMediaRef === 'function' && scene.ref) ? bspResolveMediaRef(scene.ref) : '');
        if (src) bg = `background:url("${src}") center/${scene.fit === 'contain' ? 'contain' : 'cover'} no-repeat;`;
      }
      if (!bg) return '';
      const op = (scene.opacity == null ? 100 : scene.opacity) / 100;
      return `${bg}opacity:${op};`;
    }

    // Élément « carte » (racine du lower-third) dans un stage rendu — à travers le conteneur
    // positionné `[data-sub-card]` (le calque de scène est un frère derrière, on ne l'anime pas ici).
    function bspSubtitleCardEl(stageEl) {
      if (!stageEl) return null;
      const host = stageEl.querySelector('[data-sub-card]');
      return host ? host.firstElementChild : null;
    }

    // Rend un sous-titre dans un « stage » 16:9 : canvas logique 1920×1080 (mêmes px que
    // l'affichage réel), avec le fond de scène DERRIÈRE (z-index 0) et la carte positionnée
    // DEVANT (z-index 1). Mis à l'échelle pour tenir dans le stage. Réutilisé par l'aperçu ET
    // par l'affichage de projection.
    function bspSubtitleRenderStage(stageEl, sub) {
      if (!stageEl) return;
      stageEl.innerHTML = '';
      const [v, h] = String(sub.position || 'bot-left').split('-');
      const vy = v === 'top' ? 'flex-start' : (v === 'mid' ? 'center' : 'flex-end');
      const hx = h === 'left' ? 'flex-start' : (h === 'right' ? 'flex-end' : 'center');
      const EDGE = 56; // marge écran pour ne pas coller aux bords
      // Fond de scène : PLEIN CADRE — remplit tout le stage/overlay (pas seulement le canvas 16:9),
      // pour couvrir l'écran quelle que soit sa résolution/ratio. Placé DERRIÈRE le canvas.
      const sceneStyle = bspSubtitleSceneStyle(sub.scene);
      if (sceneStyle) {
        const scene = document.createElement('div');
        scene.setAttribute('data-sub-scene', '');
        scene.style.cssText = `position:absolute;inset:0;z-index:0;${sceneStyle}`;
        stageEl.appendChild(scene);
      }
      // Canvas logique 1920×1080 (pour positionner la carte), mis à l'échelle par la largeur.
      const canvas = document.createElement('div');
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:1920px;height:1080px;transform-origin:top left;z-index:1';
      const host = document.createElement('div');
      host.setAttribute('data-sub-card', '');
      host.style.cssText = `position:absolute;inset:0;display:flex;justify-content:${hx};align-items:${vy};padding:${EDGE}px;box-sizing:border-box`;
      host.innerHTML = bspSubtitleCardHtml(sub);
      canvas.appendChild(host);
      stageEl.appendChild(canvas);
      const fit = () => { const w = stageEl.clientWidth || 1; canvas.style.transform = `scale(${w / 1920})`; };
      fit();
      requestAnimationFrame(fit);
    }

    // Anime la CARTE (indépendant de la mise à l'échelle du canvas). direction 'in' = caché→montré
    // (entrée), 'out' = montré→caché (sortie). Retourne l'Animation (Web Animations API).
    function bspSubtitleAnimate(el, template, direction, ms, delay) {
      if (!el || typeof el.animate !== 'function') return null;
      const tpl = BSP_SUB_ANIMS[template] || BSP_SUB_ANIMS.fade;
      const base = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
      const shown = Object.assign({}, base, tpl.shown || {});
      const hidden = Object.assign({}, base, tpl.hidden || {});
      const from = direction === 'in' ? hidden : shown;
      const to = direction === 'in' ? shown : hidden;
      const easing = direction === 'in' ? (tpl.inEase || 'ease') : (tpl.outEase || 'ease');
      return el.animate([from, to], { duration: Math.max(0, Number(ms) || 0), delay: Math.max(0, Number(delay) || 0), easing, fill: 'both' });
    }

    // Joue l'animation d'un sous-titre sur sa carte, selon le MODULE : 'global' (toute la carte)
    // ou 'segmented' (accent → libellé → texte, chacun sa propre anim/durée, EN SÉQUENCE ; ordre
    // inversé en sortie). Retourne la durée totale (ms) — utile pour enchaîner. Réutilisé par
    // l'aperçu ET (étape 2) par l'affichage réel.
    function bspSubtitlePlaySequence(cardEl, sub, direction) {
      if (!cardEl) return 0;
      // Fond de scène plein cadre : fondu global (opacité → son opacité réglée), en parallèle
      // de l'animation de la carte, quel que soit le mode.
      const host = (cardEl.closest && cardEl.closest('[data-sub-card]')) || null;
      const canvasEl = host && host.parentElement;
      const stageForScene = canvasEl && canvasEl.parentElement; // le fond de scène est frère du canvas
      const sceneEl = stageForScene && stageForScene.querySelector('[data-sub-scene]');
      if (sceneEl && typeof sceneEl.animate === 'function') {
        const sc = sub.scene || {};
        const op = (sc.opacity == null ? 100 : sc.opacity) / 100;
        // Fondu du fond de scène : durées PROPRES (scene.fadeInMs / fadeOutMs), réglées dans les
        // paramètres d'animation — indépendantes de l'anim de la carte.
        const fadeMs = direction === 'in' ? (sc.fadeInMs != null ? sc.fadeInMs : 400) : (sc.fadeOutMs != null ? sc.fadeOutMs : 400);
        sceneEl.animate(direction === 'in' ? [{ opacity: 0 }, { opacity: op }] : [{ opacity: op }, { opacity: 0 }],
          { duration: Math.max(0, Number(fadeMs) || 0), easing: BSP_SUB_EASE_OUT, fill: 'both' });
      }
      if (sub.animMode === 'segmented') {
        const seg = sub.seg || {};
        // Ordre d'apparition CHOISI (seg.order) ; à défaut, l'ordre par défaut. Inversé en sortie.
        const orderIn = (Array.isArray(seg.order) && seg.order.length) ? seg.order.slice() : ['bg', 'image', 'accent', 'label', 'value'];
        const order = direction === 'in' ? orderIn : orderIn.slice().reverse();
        let cursor = 0;
        order.forEach((k) => {
          const el = cardEl.querySelector('[data-sub-el="' + k + '"]');
          if (!el) return;
          const spec = seg[k] || {};
          const ms = direction === 'in' ? spec.inMs : spec.outMs;
          bspSubtitleAnimate(el, spec.template, direction, ms, cursor);
          cursor += Math.max(0, Number(ms) || 0); // l'un après l'autre
        });
        cardEl.style.opacity = '1'; cardEl.style.transform = 'none';
        return cursor;
      }
      const a = sub.anim || {};
      const ms = direction === 'in' ? a.inMs : a.outMs;
      bspSubtitleAnimate(cardEl, a.template, direction, ms);
      return Math.max(0, Number(ms) || 0);
    }

    // Lecteur d'aperçu : rejoue l'animation d'ENTRÉE, tient un court instant, puis l'animation de
    // SORTIE — « l'animation se joue et disparaît ». Réutilisé par le bouton Aperçu du modal.
    function bspSubtitlePlayPreview(stageEl, sub) {
      if (!stageEl || !sub) return;
      if (bspSubtitlePreviewTimer) { clearTimeout(bspSubtitlePreviewTimer); bspSubtitlePreviewTimer = 0; }
      bspSubtitleRenderStage(stageEl, sub);
      const card = bspSubtitleCardEl(stageEl);
      if (!card) return;
      const holdMs = 1400;
      const inTotal = bspSubtitlePlaySequence(card, sub, 'in');
      bspSubtitlePreviewTimer = setTimeout(() => { bspSubtitlePlaySequence(card, sub, 'out'); }, inTotal + holdMs);
    }

    // Aperçu EN BASCULE (ON/OFF) : ON = joue l'ENTRÉE et laisse affiché ; OFF = joue la SORTIE.
    // Permet de voir séparément l'entrée puis la sortie (demande utilisateur). `btn` est restylé.
    function bspSubtitlePreviewToggle(stageEl, sub, btn) {
      if (!stageEl || !sub) return;
      if (bspSubtitlePreviewTimer) { clearTimeout(bspSubtitlePreviewTimer); bspSubtitlePreviewTimer = 0; }
      if (!bspSubtitlePreviewOn) {
        bspSubtitleRenderStage(stageEl, sub);
        const card = bspSubtitleCardEl(stageEl);
        if (card) bspSubtitlePlaySequence(card, sub, 'in');
        bspSubtitlePreviewOn = true;
      } else {
        const card = bspSubtitleCardEl(stageEl);
        if (card) bspSubtitlePlaySequence(card, sub, 'out');
        bspSubtitlePreviewOn = false;
      }
      if (btn) bspStyleSubtitlePreviewBtn(btn);
    }
    // Habillage des boutons Aperçu / Diffuser — DEUX couleurs distinctes, état ON/OFF lisible.
    function bspStyleSubtitlePreviewBtn(btn) {
      btn.className = 'bsp-st-btn preview' + (bspSubtitlePreviewOn ? ' on' : '');
      btn.textContent = (bspSubtitlePreviewOn ? '■ ' : '▶ ') + bspSubtitleT(bspSubtitlePreviewOn ? 'subtitle_preview_off' : 'subtitle_preview_on', bspSubtitlePreviewOn ? 'Aperçu : sortie' : 'Aperçu : entrée');
    }
    function bspStyleSubtitleLiveBtn(btn, isLive) {
      btn.className = 'bsp-st-btn live' + (isLive ? ' on' : '');
      btn.textContent = (isLive ? '● ' : '◉ ') + bspSubtitleT(isLive ? 'subtitle_live_off' : 'subtitle_live_on', isLive ? 'Live : masquer' : 'Live : diffuser');
    }

    // ── Modal bibliothèque ──────────────────────────────────────────────────────────
    function bspOpenSubtitleModal() {
      if (typeof openModal === 'function') openModal('subtitleModal');
      if (!Array.isArray(bspSubtitles)) bspSubtitles = [];
      if ((!bspSubtitleSelectedId || !bspGetSubtitle(bspSubtitleSelectedId)) && bspSubtitles.length) bspSubtitleSelectedId = bspSubtitles[0].id;
      bspRenderSubtitleLibrary();
    }

    function bspRenderSubtitleLibrary() {
      const listEl = document.getElementById('subtitle-lib-list');
      const edEl = document.getElementById('subtitle-editor');
      if (!listEl || !edEl) return;
      // Liste
      listEl.innerHTML = '';
      if (!bspSubtitles.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:14px;color:var(--text-secondary);font-size:12px;text-align:center';
        empty.textContent = bspSubtitleT('subtitle_empty', 'Aucun sous-titre. Ajoutez-en un ci-dessus.');
        listEl.appendChild(empty);
      }
      bspSubtitles.forEach((sub) => {
        const row = document.createElement('div');
        row.className = 'bsp-st-row' + (sub.id === bspSubtitleSelectedId ? ' is-active' : '');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = (sub.colors && sub.colors.accent) || '#FF2D55';
        const txt = document.createElement('div');
        txt.className = 'meta';
        txt.innerHTML = `<div class="kind">${bspSubtitleTypeLabel(sub.type)}</div>` +
          `<div class="name">${(sub.value || sub.label || '—').replace(/</g, '&lt;')}</div>`;
        const dup = document.createElement('span');
        dup.className = 'act'; dup.textContent = '⎘'; dup.title = bspSubtitleT('subtitle_duplicate', 'Dupliquer');
        dup.onclick = (e) => { e.stopPropagation(); bspSubtitleDuplicate(sub.id); };
        const del = document.createElement('span');
        del.className = 'act del'; del.textContent = '✕'; del.title = bspSubtitleT('common_delete', 'Delete');
        del.onclick = (e) => { e.stopPropagation(); bspDeleteSubtitle(sub.id); };
        row.onclick = () => bspSelectSubtitle(sub.id);
        row.appendChild(dot); row.appendChild(txt); row.appendChild(dup); row.appendChild(del);
        listEl.appendChild(row);
      });
      // Éditeur
      const sub = bspGetSubtitle(bspSubtitleSelectedId);
      edEl.innerHTML = '';
      if (!sub) {
        const hint = document.createElement('div');
        hint.style.cssText = 'padding:24px;color:var(--text-secondary);font-size:13px;text-align:center';
        hint.textContent = bspSubtitleT('subtitle_pick_hint', 'Sélectionnez ou créez un sous-titre pour l’éditer.');
        edEl.appendChild(hint);
        return;
      }
      edEl.appendChild(bspSubtitleEditorEl(sub));
    }

    function bspSubtitleEditorEl(baseSub) {
      bspSubtitlePreviewOn = false; // le stage est re-rendu en état « affiché » → aperçu repart d'OFF
      // ROUTAGE PAR SORTIE : `sub` = l'objet ÉDITÉ pour la sortie choisie. Pour 'obs' c'est la base ;
      // pour un écran, un objet de travail (contenu de base + design de la surcharge). Tout le corps
      // édite `sub` ; `commit` renvoie le contenu vers la base (commun) et le design vers la
      // surcharge de la sortie — d'où AUCUN recâblage des contrôles.
      const outputList = bspSubtitleOutputList();
      if (!outputList.some((o) => o[0] === bspSubtitleDesignOutput)) bspSubtitleDesignOutput = 'obs';
      const editOut = bspSubtitleDesignOutput || 'obs';
      const isBaseOut = (editOut === 'obs');
      const sub = bspSubtitleGetWork(baseSub, editOut);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px';

      // Aperçu (canvas 1920×1080 mis à l'échelle pour tenir)
      const stage = document.createElement('div');
      stage.className = 'bsp-st-stage';
      const previewInner = () => bspSubtitleRenderStage(stage, sub);
      wrap.appendChild(stage);
      previewInner();
      // Barre d'actions : Aperçu (violet) + Live (vert/rouge) + Routage (sélecteur de sortie).
      const playBar = document.createElement('div');
      playBar.className = 'bsp-st-actions';
      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      bspStyleSubtitlePreviewBtn(previewBtn);
      previewBtn.onclick = () => bspSubtitlePreviewToggle(stage, sub, previewBtn);
      playBar.appendChild(previewBtn);
      const liveBtn = document.createElement('button');
      liveBtn.type = 'button';
      bspStyleSubtitleLiveBtn(liveBtn, bspSubtitleLiveId === sub.id);
      liveBtn.onclick = () => { bspSubtitleToggleLive(sub.id); bspStyleSubtitleLiveBtn(liveBtn, bspSubtitleLiveId === sub.id); };
      playBar.appendChild(liveBtn);
      // ── Routage : sélecteur de SORTIE (barre distincte) + play isolé + reprendre le Live ──
      const outWrap = document.createElement('div');
      outWrap.className = 'bsp-st-route' + (isBaseOut ? '' : ' edit-screen');
      const outLbl = document.createElement('span');
      outLbl.className = 'rl';
      outLbl.textContent = bspSubtitleT('subtitle_output', 'Sortie');
      const outSel = document.createElement('select');
      outputList.forEach(([id, lbl]) => { const o = document.createElement('option'); o.value = id; o.textContent = lbl + (id !== 'obs' && baseSub.outputs && baseSub.outputs[id] ? '  •' : ''); if (id === editOut) o.selected = true; outSel.appendChild(o); });
      outSel.onchange = () => { bspSubtitleDesignOutput = outSel.value; bspSubtitleWork = null; bspRenderSubtitleLibrary(); };
      outWrap.appendChild(outLbl); outWrap.appendChild(outSel);
      // Quand on édite un écran : bouton pour REVENIR au design du Live (supprime la surcharge).
      if (!isBaseOut) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button'; resetBtn.className = 'reset';
        resetBtn.textContent = '↺ ' + bspSubtitleT('subtitle_output_reset', 'Reprendre le Live');
        resetBtn.onclick = () => {
          if (baseSub.outputs) delete baseSub.outputs[editOut];
          bspSubtitleWork = null;
          if (typeof bspSubtitlesPersist === 'function') bspSubtitlesPersist();
          bspRenderSubtitleLibrary();
        };
        outWrap.appendChild(resetBtn);
      }
      // PLAY ISOLÉ : projette/masque UNIQUEMENT la sortie sélectionnée.
      const isoLive = (bspSubtitleLiveFor(editOut) === sub.id);
      const isoBtn = document.createElement('button');
      isoBtn.type = 'button'; isoBtn.className = 'iso' + (isoLive ? ' on' : '');
      isoBtn.title = bspSubtitleT('subtitle_play_isolated', 'Projeter cette sortie seule');
      isoBtn.textContent = isoLive ? '■' : '▶';
      isoBtn.onclick = () => { bspSubtitleToggleLive(sub.id, editOut); };
      outWrap.appendChild(isoBtn);
      playBar.appendChild(outWrap);
      wrap.appendChild(playBar);

      // Sections rangées proprement (une carte titrée par groupe de réglages).
      const sectionGrids = {};
      const makeSection = (key, titleText) => {
        const card = document.createElement('div');
        card.className = 'bsp-st-section';
        const h = document.createElement('div');
        h.className = 'bsp-st-shead';
        h.textContent = titleText;
        const g = document.createElement('div');
        g.className = 'bsp-st-grid';
        card.appendChild(h); card.appendChild(g);
        wrap.appendChild(card);
        sectionGrids[key] = g;
        return g;
      };
      const secContent = makeSection('content', bspSubtitleT('subtitle_sec_content', 'Contenu'));
      const secType = makeSection('type', bspSubtitleT('subtitle_sec_type', 'Police & texte'));
      const secLayout = makeSection('layout', bspSubtitleT('subtitle_sec_layout', 'Position & espacement'));
      const secImage = makeSection('image', bspSubtitleT('subtitle_sec_image', 'Image (photo)'));
      const secScene = makeSection('scene', bspSubtitleT('subtitle_sec_scene', 'Fond de scène (plein cadre)'));
      const secShadow = makeSection('shadow', bspSubtitleT('subtitle_sec_shadow', 'Ombre portée'));
      const secAnim = makeSection('anim', bspSubtitleT('subtitle_sec_anim', 'Animation'));
      const secColors = makeSection('colors', bspSubtitleT('subtitle_sec_colors', 'Couleurs'));
      // `grid` = section courante ; on le réaffecte avant chaque groupe de champs.
      let grid = secContent;

      const field = (labelText, controlEl, full) => {
        const f = document.createElement('div');
        f.className = 'bsp-st-field' + (full ? ' full' : '');
        const l = document.createElement('label');
        l.className = 'bsp-st-flabel';
        l.textContent = labelText;
        f.appendChild(l); f.appendChild(controlEl);
        return f;
      };
      const textInput = (val, ph, onInput) => {
        const i = document.createElement('input');
        i.type = 'text'; i.value = val || ''; i.placeholder = ph || '';
        i.className = 'bsp-st-input';
        i.oninput = () => onInput(i.value);
        return i;
      };
      const seg = (options, current, onPick) => {
        const s = document.createElement('div');
        s.className = 'bsp-st-seg';
        options.forEach(([val, lbl]) => {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = lbl;
          b.className = 'bsp-st-segbtn' + (val === current ? ' is-active' : '');
          b.onclick = () => onPick(val);
          s.appendChild(b);
        });
        return s;
      };
      const colorCtl = (val, withAlpha, onChange) => {
        const box = document.createElement('div');
        box.className = 'bsp-st-color';
        const hex6 = (v) => { const m = /^#?([0-9a-f]{6})/i.exec(String(v || '')); return m ? ('#' + m[1]) : '#000000'; };
        const alphaOf = (v) => { const m = /^#?[0-9a-f]{6}([0-9a-f]{2})$/i.exec(String(v || '')); return m ? Math.round(parseInt(m[1], 16) / 255 * 100) : 100; };
        const pick = document.createElement('input');
        pick.type = 'color'; pick.value = hex6(val); pick.className = 'bsp-st-swatch';
        let alpha = withAlpha ? alphaOf(val) : 100;
        let aRange = null, av = null;
        const composed = () => {
          let out = pick.value;
          if (withAlpha && alpha < 100) out = pick.value + ('0' + Math.round(alpha / 100 * 255).toString(16)).slice(-2);
          return out;
        };
        // Champ HEXADÉCIMAL éditable (#RRGGBB ou #RRGGBBAA) — demandé partout où il y a une couleur.
        const hexIn = document.createElement('input');
        hexIn.type = 'text'; hexIn.spellcheck = false; hexIn.setAttribute('aria-label', 'Hex'); hexIn.className = 'bsp-st-hex';
        const syncHex = () => { hexIn.value = composed().toUpperCase(); };
        const emit = () => { syncHex(); onChange(composed()); };
        pick.oninput = emit;
        hexIn.value = composed().toUpperCase();
        hexIn.oninput = () => {
          const m = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hexIn.value.trim());
          if (!m) return; // saisie invalide/incomplète : on ne l'écrase pas
          pick.value = '#' + m[1];
          if (withAlpha) { alpha = m[2] ? Math.round(parseInt(m[2], 16) / 255 * 100) : 100; if (aRange) aRange.value = String(alpha); if (av) av.textContent = alpha + '%'; }
          onChange(composed());
        };
        box.appendChild(pick); box.appendChild(hexIn);
        if (withAlpha) {
          aRange = document.createElement('input');
          aRange.type = 'range'; aRange.min = '0'; aRange.max = '100'; aRange.value = String(alpha); aRange.className = 'bsp-st-range';
          aRange.style.minWidth = '64px';
          av = document.createElement('span');
          av.className = 'bsp-st-numval'; av.style.minWidth = '34px';
          av.textContent = alpha + '%';
          aRange.oninput = () => { alpha = Number(aRange.value); av.textContent = alpha + '%'; emit(); };
          box.appendChild(aRange); box.appendChild(av);
        }
        return box;
      };
      const textarea = (val, ph, onInput) => {
        const ta = document.createElement('textarea');
        ta.value = val || ''; ta.placeholder = ph || ''; ta.rows = 2;
        ta.className = 'bsp-st-textarea';
        ta.oninput = () => onInput(ta.value);
        return ta;
      };
      const toggleBtns = (items) => {
        const s = document.createElement('div');
        s.className = 'bsp-st-seg';
        items.forEach(([lbl, isOn, onClick, title]) => {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = lbl; if (title) b.title = title;
          b.className = 'bsp-st-segbtn' + (isOn ? ' is-active' : '');
          b.onclick = onClick;
          s.appendChild(b);
        });
        return s;
      };
      const numRow = (val, lo, hi, step, unit, onChange) => {
        const box = document.createElement('div');
        box.className = 'bsp-st-num';
        const r = document.createElement('input');
        r.type = 'range'; r.min = String(lo); r.max = String(hi); r.step = String(step || 1); r.value = String(val);
        r.className = 'bsp-st-range';
        const out = document.createElement('span');
        out.className = 'bsp-st-numval';
        out.textContent = val + (unit || '');
        r.oninput = () => { const n = Number(r.value); out.textContent = n + (unit || ''); onChange(n); };
        box.appendChild(r); box.appendChild(out);
        return box;
      };
      const padInput = (val, onChange) => {
        const i = document.createElement('input');
        i.type = 'number'; i.min = '0'; i.max = '400'; i.value = String(val);
        i.className = 'bsp-st-input'; i.style.width = '100%'; i.style.padding = '7px 8px'; i.style.textAlign = 'center';
        i.oninput = () => { let n = Number(i.value); if (!Number.isFinite(n)) n = 0; onChange(Math.max(0, Math.min(400, n))); };
        return i;
      };
      const fontOptions = () => {
        const opts = [['', bspSubtitleT('subtitle_font_inherit', 'Hérité')]];
        const seen = new Set();
        const selEl = document.getElementById('font-family');
        if (selEl && selEl.options) { for (let k = 0; k < selEl.options.length; k++) { const o = selEl.options[k]; if (o.value) { opts.push([o.value, o.textContent || o.value]); seen.add(o.value); } } }
        // Polices récupérées du PC (bspLoadLocalFonts) : ajoutées si pas déjà listées.
        (bspLocalFonts || []).forEach((fam) => { if (fam && !seen.has(fam)) { opts.push([fam, fam]); seen.add(fam); } });
        return opts;
      };
      const selectCtl = (options, current, onPick) => {
        const s = document.createElement('select');
        s.className = 'bsp-st-select';
        options.forEach(([val, lbl]) => { const o = document.createElement('option'); o.value = val; o.textContent = lbl; if (val === current) o.selected = true; s.appendChild(o); });
        s.onchange = () => onPick(s.value);
        return s;
      };
      // Sélecteur d'image réutilisable (banque média) : bandeau de vignettes + Importer + Aucune.
      // `onPick('bank:<id>' | '')` reçoit la réf. choisie ; re-rend l'éditeur pour refléter l'état.
      const mediaPickerEl = (currentRef) => {
        const picker = document.createElement('div');
        picker.style.cssText = 'grid-column:1/-1;display:flex;flex-direction:column;gap:8px';
        const strip = document.createElement('div');
        strip.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;max-height:150px;overflow:auto;padding:2px';
        const items = (typeof bspMediaList === 'function' ? bspMediaList() : []).filter((m) => m && m.type === 'image');
        if (!items.length) {
          const em = document.createElement('div');
          em.style.cssText = 'font-size:11px;color:var(--text-secondary);padding:6px';
          em.textContent = bspSubtitleT('subtitle_image_empty', 'Aucune photo dans la banque. Importez-en une.');
          strip.appendChild(em);
        }
        items.forEach((m) => {
          const ref = 'bank:' + m.id;
          const th = document.createElement('button');
          th.type = 'button'; th.title = m.name || '';
          const sel = (currentRef === ref);
          th.style.cssText = 'flex:none;width:64px;height:44px;border-radius:6px;overflow:hidden;cursor:pointer;padding:0;background:#0a0d14;' +
            (sel ? 'border:3px solid var(--accent)' : 'border:1px solid var(--border)');
          th.innerHTML = `<img src="${m.dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`;
          th.onclick = () => { picker._onPick && picker._onPick(ref); };
          strip.appendChild(th);
        });
        picker.appendChild(strip);
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        const importBtn = document.createElement('button');
        importBtn.type = 'button'; importBtn.className = 'btn'; importBtn.style.cssText = 'background:var(--bg-dark)';
        importBtn.textContent = '＋ ' + bspSubtitleT('subtitle_image_import', 'Importer une photo');
        const fileIn = document.createElement('input');
        fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.style.display = 'none';
        fileIn.onchange = async () => {
          if (!fileIn.files || !fileIn.files.length || typeof bspMediaImportFiles !== 'function') return;
          const before = (typeof bspMediaList === 'function' ? bspMediaList() : []).filter((m) => m.type === 'image');
          await bspMediaImportFiles(fileIn.files);
          const after = (typeof bspMediaList === 'function' ? bspMediaList() : []).filter((m) => m.type === 'image');
          const added = after.find((m) => !before.some((b) => b.id === m.id));
          if (added && picker._onPick) picker._onPick('bank:' + added.id);
        };
        importBtn.onclick = () => fileIn.click();
        bar.appendChild(importBtn); bar.appendChild(fileIn);
        if (currentRef) {
          const none = document.createElement('button');
          none.type = 'button'; none.className = 'btn'; none.style.cssText = 'background:var(--bg-dark)';
          none.textContent = '✕ ' + bspSubtitleT('subtitle_image_none', 'Aucune');
          none.onclick = () => { picker._onPick && picker._onPick(''); };
          bar.appendChild(none);
        }
        picker.appendChild(bar);
        return picker;
      };
      const commit = (rerenderList) => {
        if (!isBaseOut) {
          // Contenu COMMUN → base ; design → surcharge de la sortie éditée.
          baseSub.label = sub.label; baseSub.value = sub.value; baseSub.type = sub.type;
          if (!baseSub.outputs || typeof baseSub.outputs !== 'object') baseSub.outputs = {};
          const ov = {};
          BSP_SUB_DESIGN_KEYS.forEach((k) => { try { ov[k] = JSON.parse(JSON.stringify(sub[k])); } catch (_) { ov[k] = sub[k]; } });
          baseSub.outputs[editOut] = ov;
        }
        bspSubtitlesPersist();
        if (rerenderList) bspRenderSubtitleLibrary(); else previewInner();
      };

      // Champs — Catégorie (change le type + applique sa couleur signature) ; opère sur la base
      // car le CONTENU/catégorie est commun à toutes les sorties.
      grid.appendChild(field(bspSubtitleT('subtitle_field_category', 'Catégorie'), selectCtl(
        BSP_SUBTITLE_TYPES.map((t) => [t, bspSubtitleTypeLabel(t)]), baseSub.type, (v) => bspSubtitleSetType(baseSub, v)
      ), true));
      grid.appendChild(field(bspSubtitleT('subtitle_field_label', 'Libellé'), textInput(sub.label, bspSubtitleTypeLabel(sub.type), (v) => { sub.label = v; commit(false); })));
      grid.appendChild(field(bspSubtitleT('subtitle_field_value', 'Texte'), textarea(sub.value, bspSubtitleT('subtitle_value_ph', 'Texte…'), (v) => { sub.value = v; commit(false); }), true));

      // Police : famille (+ bouton « PC » pour récupérer les polices installées), gras/italique…
      grid = secType;
      const fontWrap = document.createElement('div');
      fontWrap.style.cssText = 'display:flex;gap:6px;align-items:stretch';
      const fontSel = selectCtl(fontOptions(), sub.fontFamily || '', (v) => { sub.fontFamily = v; commit(false); });
      fontSel.style.flex = '1'; fontSel.style.minWidth = '0';
      const pcBtn = document.createElement('button');
      pcBtn.type = 'button'; pcBtn.title = bspSubtitleT('subtitle_fonts_pc', 'Récupérer les polices du PC');
      pcBtn.textContent = '🖥 ' + bspSubtitleT('subtitle_fonts_pc_short', 'PC');
      pcBtn.style.cssText = 'flex:none;padding:0 10px;border-radius:6px;border:1px solid var(--border);background:#0a0d14;color:var(--text);font-size:11px;font-weight:600;cursor:pointer';
      pcBtn.onclick = async () => { pcBtn.disabled = true; await bspLoadLocalFonts(); pcBtn.disabled = false; bspRenderSubtitleLibrary(); };
      fontWrap.appendChild(fontSel); fontWrap.appendChild(pcBtn);
      grid.appendChild(field(bspSubtitleT('subtitle_field_font', 'Police'), fontWrap));
      // Formatage SÉPARÉ du Libellé et du Texte : taille, gras/italique, casse, alignement.
      const fmtBlock = (key, title) => {
        const el = sub.fmt[key];
        const blk = document.createElement('div');
        blk.className = 'bsp-st-subblock';
        blk.style.cssText += 'display:grid;grid-template-columns:1fr 1fr;gap:9px 12px;align-items:end';
        const tt = document.createElement('div'); tt.className = 'bh'; tt.style.gridColumn = '1/-1'; tt.textContent = title; blk.appendChild(tt);
        blk.appendChild(field(bspSubtitleT('subtitle_field_size', 'Taille'), numRow(el.size, 6, 200, 1, 'px', (n) => { el.size = n; commit(false); })));
        blk.appendChild(field(bspSubtitleT('subtitle_field_style_b', 'Gras / Italique'), toggleBtns([
          ['B', !!el.bold, () => { el.bold = !el.bold; bspRenderSubtitleLibrary(); commit(false); }, bspSubtitleT('subtitle_bold', 'Gras')],
          ['I', !!el.italic, () => { el.italic = !el.italic; bspRenderSubtitleLibrary(); commit(false); }, bspSubtitleT('subtitle_italic', 'Italique')]
        ])));
        blk.appendChild(field(bspSubtitleT('subtitle_field_case', 'Casse'), toggleBtns([
          ['Aa', el.transform === 'none', () => { el.transform = 'none'; bspRenderSubtitleLibrary(); commit(false); }, bspSubtitleT('subtitle_case_normal', 'Normal')],
          ['AA', el.transform === 'upper', () => { el.transform = 'upper'; bspRenderSubtitleLibrary(); commit(false); }, bspSubtitleT('subtitle_case_upper', 'Majuscules')],
          ['aa', el.transform === 'lower', () => { el.transform = 'lower'; bspRenderSubtitleLibrary(); commit(false); }, bspSubtitleT('subtitle_case_lower', 'Minuscules')]
        ])));
        blk.appendChild(field(bspSubtitleT('subtitle_field_align', 'Alignement'), toggleBtns([
          ['⇤', el.align === 'left', () => { el.align = 'left'; bspRenderSubtitleLibrary(); commit(false); }, bspSubtitleT('subtitle_align_left', 'Gauche')],
          ['↔', el.align === 'center', () => { el.align = 'center'; bspRenderSubtitleLibrary(); commit(false); }, bspSubtitleT('subtitle_align_center', 'Centre')],
          ['⇥', el.align === 'right', () => { el.align = 'right'; bspRenderSubtitleLibrary(); commit(false); }, bspSubtitleT('subtitle_align_right', 'Droite')]
        ])));
        return blk;
      };
      grid.appendChild(fmtBlock('label', bspSubtitleT('subtitle_fmt_label', 'Libellé')));
      grid.appendChild(fmtBlock('value', bspSubtitleT('subtitle_fmt_value', 'Texte')));
      grid.appendChild(field(bspSubtitleT('subtitle_field_wrap', 'Retour à la ligne'), toggleBtns([
        [bspSubtitleT('common_on', 'On'), !!sub.wrap, () => { sub.wrap = true; bspRenderSubtitleLibrary(); commit(false); }],
        [bspSubtitleT('common_off', 'Off'), !sub.wrap, () => { sub.wrap = false; bspRenderSubtitleLibrary(); commit(false); }]
      ])));

      grid.appendChild(field(bspSubtitleT('subtitle_field_style', 'Style'), seg(
        [['bar', bspSubtitleT('subtitle_style_bar', 'Barre')], ['box', bspSubtitleT('subtitle_style_box', 'Boîte')], ['underline', bspSubtitleT('subtitle_style_underline', 'Souligné')], ['plain', bspSubtitleT('subtitle_style_plain', 'Simple')]],
        sub.style, (v) => { sub.style = v; bspRenderSubtitleLibrary(); commit(false); }
      ), true));

      // Position 3×3
      grid = secLayout;
      const posGrid = document.createElement('div');
      posGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;max-width:120px';
      BSP_SUBTITLE_POSITIONS.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = 'height:26px;border-radius:5px;border:1px solid var(--border);cursor:pointer;' + (p === sub.position ? 'background:var(--accent)' : 'background:#0a0d14');
        b.title = p;
        b.onclick = () => { sub.position = p; bspRenderSubtitleLibrary(); commit(false); };
        posGrid.appendChild(b);
      });
      grid.appendChild(field(bspSubtitleT('subtitle_field_position', 'Position'), posGrid, true));

      // Taille globale + padding interne (pour ne pas coller aux bords)
      grid.appendChild(field(bspSubtitleT('subtitle_field_scale', 'Taille globale'), numRow(Math.round((sub.scale || 1) * 100), 30, 300, 5, '%', (n) => { sub.scale = n / 100; commit(false); }), true));
      const padWrap = document.createElement('div');
      padWrap.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px';
      [['top', bspSubtitleT('subtitle_pad_top', 'Haut')], ['right', bspSubtitleT('subtitle_pad_right', 'Droite')], ['bottom', bspSubtitleT('subtitle_pad_bottom', 'Bas')], ['left', bspSubtitleT('subtitle_pad_left', 'Gauche')]].forEach(([k, lbl]) => {
        const cell = document.createElement('div');
        cell.style.cssText = 'display:flex;flex-direction:column;gap:3px';
        const cl = document.createElement('label'); cl.style.cssText = 'font-size:10px;color:var(--text-secondary);text-align:center'; cl.textContent = lbl;
        cell.appendChild(cl); cell.appendChild(padInput(sub.pad[k], (n) => { sub.pad[k] = n; commit(false); }));
        padWrap.appendChild(cell);
      });
      grid.appendChild(field(bspSubtitleT('subtitle_field_padding', 'Padding interne'), padWrap, true));

      // Coins arrondis du fond — uniforme (un seul rayon) OU par coin (4 rayons).
      grid.appendChild(field(bspSubtitleT('subtitle_radius_mode', 'Coins arrondis'), toggleBtns([
        [bspSubtitleT('subtitle_radius_uniform', 'Uniforme'), sub.radius.uniform !== false, () => { sub.radius.uniform = true; bspRenderSubtitleLibrary(); commit(false); }],
        [bspSubtitleT('subtitle_radius_each', 'Par coin'), sub.radius.uniform === false, () => { sub.radius.uniform = false; bspRenderSubtitleLibrary(); commit(false); }]
      ]), true));
      if (sub.radius.uniform !== false) {
        grid.appendChild(field(bspSubtitleT('subtitle_radius_all', 'Rayon'), numRow(sub.radius.all, 0, 200, 1, 'px', (n) => { sub.radius.all = n; commit(false); }), true));
      } else {
        const rWrap = document.createElement('div');
        rWrap.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px';
        [['tl', bspSubtitleT('subtitle_radius_tl', 'H-G')], ['tr', bspSubtitleT('subtitle_radius_tr', 'H-D')], ['br', bspSubtitleT('subtitle_radius_br', 'B-D')], ['bl', bspSubtitleT('subtitle_radius_bl', 'B-G')]].forEach(([k, lbl]) => {
          const cell = document.createElement('div');
          cell.style.cssText = 'display:flex;flex-direction:column;gap:3px';
          const cl = document.createElement('label'); cl.style.cssText = 'font-size:10px;color:var(--text-secondary);text-align:center'; cl.textContent = lbl;
          cell.appendChild(cl); cell.appendChild(padInput(sub.radius[k], (n) => { sub.radius[k] = n; commit(false); }));
          rWrap.appendChild(cell);
        });
        grid.appendChild(field(bspSubtitleT('subtitle_radius_each', 'Rayon par coin'), rWrap, true));
      }

      // Ombre portée (drop shadow)
      grid = secShadow;
      grid.appendChild(field(bspSubtitleT('subtitle_field_shadow', 'Ombre portée'), toggleBtns([
        [bspSubtitleT('common_on', 'On'), (sub.shadow.on !== false), () => { sub.shadow.on = true; bspRenderSubtitleLibrary(); commit(false); }],
        [bspSubtitleT('common_off', 'Off'), (sub.shadow.on === false), () => { sub.shadow.on = false; bspRenderSubtitleLibrary(); commit(false); }]
      ])));
      if (sub.shadow.on !== false) {
        grid.appendChild(field(bspSubtitleT('subtitle_shadow_color', 'Couleur ombre'), colorCtl(sub.shadow.color, true, (v) => { sub.shadow.color = v; commit(false); })));
        grid.appendChild(field(bspSubtitleT('subtitle_shadow_blur', 'Flou ombre'), numRow(sub.shadow.blur, 0, 60, 1, 'px', (n) => { sub.shadow.blur = n; commit(false); })));
        grid.appendChild(field(bspSubtitleT('subtitle_shadow_x', 'Décalage X'), numRow(sub.shadow.x, -40, 40, 1, 'px', (n) => { sub.shadow.x = n; commit(false); })));
        grid.appendChild(field(bspSubtitleT('subtitle_shadow_y', 'Décalage Y'), numRow(sub.shadow.y, -40, 40, 1, 'px', (n) => { sub.shadow.y = n; commit(false); })));
      }

      // Animation : template (10) + durées d'entrée/sortie
      const animLabels = { 'fade': 'Fondu', 'slide-up': 'Glissé haut', 'slide-down': 'Glissé bas', 'slide-left': 'Glissé gauche', 'slide-right': 'Glissé droite', 'zoom-in': 'Zoom avant', 'zoom-out': 'Zoom arrière', 'slide-blur': 'Glissé + flou', 'flip-x': 'Bascule', 'linear': 'Linéaire' };
      const animKeyMap = { 'fade': 'fade', 'slide-up': 'slideup', 'slide-down': 'slidedown', 'slide-left': 'slideleft', 'slide-right': 'slideright', 'zoom-in': 'zoomin', 'zoom-out': 'zoomout', 'slide-blur': 'slideblur', 'flip-x': 'flip', 'linear': 'linear' };
      const animOpts = BSP_SUB_ANIM_LIST.map((k) => [k, bspSubtitleT('subtitle_anim_' + animKeyMap[k], animLabels[k] || k)]);
      // Module d'animation : Global (tout ensemble) vs Segmenté (par élément, en séquence)
      grid = secAnim;
      grid.appendChild(field(bspSubtitleT('subtitle_anim_mode', 'Mode animation'), toggleBtns([
        [bspSubtitleT('subtitle_anim_global', 'Global'), sub.animMode !== 'segmented', () => { sub.animMode = 'global'; bspRenderSubtitleLibrary(); commit(false); }],
        [bspSubtitleT('subtitle_anim_segmented', 'Segmenté'), sub.animMode === 'segmented', () => { sub.animMode = 'segmented'; bspRenderSubtitleLibrary(); commit(false); }]
      ]), true));
      if (sub.animMode === 'segmented') {
        const hint = document.createElement('div');
        hint.style.cssText = 'grid-column:1/-1;font-size:11px;color:var(--text-secondary)';
        hint.textContent = bspSubtitleT('subtitle_seg_hint', 'Les éléments s’animent l’un après l’autre dans l’ordre ci-dessous (▲▼ pour réordonner ; ordre inversé en sortie).');
        grid.appendChild(hint);
        // Éléments VISIBLES dans la séquence (la photo seulement si active) — réordonnables.
        const segLabels = { bg: bspSubtitleT('subtitle_seg_bg', 'Fond (plaque)'), image: bspSubtitleT('subtitle_seg_image', 'Photo'), accent: bspSubtitleT('subtitle_seg_accent', 'Accent'), label: bspSubtitleT('subtitle_seg_label', 'Libellé'), value: bspSubtitleT('subtitle_seg_value', 'Texte') };
        const segVisible = ['bg']; if (sub.image && sub.image.on) segVisible.push('image'); segVisible.push('accent', 'label', 'value');
        // Ordre AFFICHÉ = seg.order filtré aux éléments visibles.
        const segDisplay = (sub.seg.order || []).filter((k) => segVisible.indexOf(k) !== -1);
        // Déplace `k` d'un cran parmi les éléments VISIBLES (échange leurs positions dans l'ordre
        // complet ; les éléments cachés restent ancrés).
        const segMove = (k, dir) => {
          const vis = segDisplay.slice();
          const vi = vis.indexOf(k);
          const other = vis[vi + dir];
          if (!other) return;
          const ord = sub.seg.order.slice();
          const ia = ord.indexOf(k), ib = ord.indexOf(other);
          if (ia === -1 || ib === -1) return;
          ord[ia] = other; ord[ib] = k;
          sub.seg.order = ord;
          bspRenderSubtitleLibrary(); commit(false);
        };
        // Glisser-déposer : place `fromKey` à l'emplacement de `toKey` (les éléments cachés
        // restent ancrés — on ne bouge que l'ordre relatif).
        const segReorderTo = (fromKey, toKey) => {
          if (!fromKey || !toKey || fromKey === toKey) return;
          const ord = sub.seg.order.slice();
          const fi = ord.indexOf(fromKey), ti = ord.indexOf(toKey);
          if (fi === -1 || ti === -1) return;
          ord.splice(fi, 1);
          const ti2 = ord.indexOf(toKey);
          ord.splice(fi < ti ? ti2 + 1 : ti2, 0, fromKey); // vers le bas → après la cible ; vers le haut → avant
          sub.seg.order = ord;
          bspRenderSubtitleLibrary(); commit(false);
        };
        segDisplay.forEach((k, idx) => {
          const blk = document.createElement('div');
          blk.className = 'bsp-st-subblock';
          blk.style.cssText += 'display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:9px;align-items:end';
          // ── Glisser-déposer : SEULE la poignée (⠿) démarre le drag, pour ne pas gêner les
          //    selects/curseurs à l'intérieur du bloc. ──
          blk.draggable = false;
          blk.dataset.segKey = k;
          blk.addEventListener('dragstart', (e) => { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); } catch (_) {} blk.style.opacity = '0.45'; });
          blk.addEventListener('dragend', () => { blk.style.opacity = ''; blk.style.borderColor = ''; blk.draggable = false; });
          blk.addEventListener('dragover', (e) => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (_) {} blk.style.borderColor = 'var(--accent)'; });
          blk.addEventListener('dragleave', () => { blk.style.borderColor = ''; });
          blk.addEventListener('drop', (e) => { e.preventDefault(); blk.style.borderColor = ''; let from = ''; try { from = e.dataTransfer.getData('text/plain'); } catch (_) {} segReorderTo(from, k); });
          const head = document.createElement('div');
          head.className = 'bh'; head.style.gridColumn = '1/-1'; head.style.marginBottom = '2px';
          const grip = document.createElement('span');
          grip.textContent = '⠿'; grip.title = bspSubtitleT('subtitle_seg_drag', 'Glisser pour réordonner');
          grip.className = 'bsp-st-grip';
          grip.addEventListener('mousedown', () => { blk.draggable = true; });
          grip.addEventListener('mouseup', () => { blk.draggable = false; });
          head.appendChild(grip);
          const title = document.createElement('div');
          title.style.cssText = 'flex:1';
          title.textContent = (idx + 1) + '. ' + (segLabels[k] || k);
          head.appendChild(title);
          const mkMove = (arrow, dir, disabled) => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = arrow; b.title = dir < 0 ? bspSubtitleT('subtitle_seg_up', 'Monter') : bspSubtitleT('subtitle_seg_down', 'Descendre');
            b.style.cssText = 'width:26px;height:24px;border-radius:7px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#cdd6e4;font-size:12px;' + (disabled ? 'opacity:.3;cursor:default' : 'cursor:pointer');
            if (!disabled) b.onclick = () => segMove(k, dir);
            return b;
          };
          head.appendChild(mkMove('▲', -1, idx === 0));
          head.appendChild(mkMove('▼', 1, idx === segDisplay.length - 1));
          blk.appendChild(head);
          blk.appendChild(field(bspSubtitleT('subtitle_field_anim', 'Animation'), selectCtl(animOpts, sub.seg[k].template, (v) => { sub.seg[k].template = v; commit(false); })));
          blk.appendChild(field(bspSubtitleT('subtitle_anim_in', 'Entrée'), numRow(sub.seg[k].inMs, 0, 3000, 50, 'ms', (n) => { sub.seg[k].inMs = n; commit(false); })));
          blk.appendChild(field(bspSubtitleT('subtitle_anim_out', 'Sortie'), numRow(sub.seg[k].outMs, 0, 3000, 50, 'ms', (n) => { sub.seg[k].outMs = n; commit(false); })));
          grid.appendChild(blk);
        });
      } else {
        grid.appendChild(field(bspSubtitleT('subtitle_field_anim', 'Animation'), selectCtl(animOpts, sub.anim.template, (v) => { sub.anim.template = v; commit(false); })));
        grid.appendChild(field(bspSubtitleT('subtitle_anim_in', 'Durée entrée'), numRow(sub.anim.inMs, 0, 3000, 50, 'ms', (n) => { sub.anim.inMs = n; commit(false); })));
        grid.appendChild(field(bspSubtitleT('subtitle_anim_out', 'Durée sortie'), numRow(sub.anim.outMs, 0, 3000, 50, 'ms', (n) => { sub.anim.outMs = n; commit(false); })));
      }
      // Fondu du FOND DE SCÈNE plein cadre (fade-in / fade-out), durées propres — visible dès
      // qu'un fond de scène est actif.
      if (sub.scene && sub.scene.type !== 'none') {
        const sfHint = document.createElement('div');
        sfHint.style.cssText = 'grid-column:1/-1;font-size:11px;color:var(--text-secondary);margin-top:2px';
        sfHint.textContent = bspSubtitleT('subtitle_scene_fade_hint', 'Fondu du fond de scène (plein cadre) :');
        grid.appendChild(sfHint);
        grid.appendChild(field(bspSubtitleT('subtitle_scene_fade_in', 'Fondu entrée (fond)'), numRow(sub.scene.fadeInMs, 0, 5000, 50, 'ms', (n) => { sub.scene.fadeInMs = n; commit(false); })));
        grid.appendChild(field(bspSubtitleT('subtitle_scene_fade_out', 'Fondu sortie (fond)'), numRow(sub.scene.fadeOutMs, 0, 5000, 50, 'ms', (n) => { sub.scene.fadeOutMs = n; commit(false); })));
      }

      // Couleurs par élément
      grid = secColors;
      grid.appendChild(field(bspSubtitleT('subtitle_color_label', 'Couleur libellé'), colorCtl(sub.colors.label, false, (v) => { sub.colors.label = v; commit(false); })));
      grid.appendChild(field(bspSubtitleT('subtitle_color_value', 'Couleur texte'), colorCtl(sub.colors.value, false, (v) => { sub.colors.value = v; commit(false); })));
      grid.appendChild(field(bspSubtitleT('subtitle_color_accent', 'Couleur accent'), colorCtl(sub.colors.accent, false, (v) => { sub.colors.accent = v; commit(false); bspTouchSubtitleListRow(sub); })));
      grid.appendChild(field(bspSubtitleT('subtitle_color_bg', 'Fond'), colorCtl(sub.colors.bg, true, (v) => { sub.colors.bg = v; commit(false); })));

      // ── Image (photo) : vignette ronde depuis la banque média, tous types ──
      grid = secImage;
      grid.appendChild(field(bspSubtitleT('subtitle_image_show', 'Afficher une photo'), toggleBtns([
        [bspSubtitleT('common_on', 'On'), !!sub.image.on, () => { sub.image.on = true; bspRenderSubtitleLibrary(); commit(false); }],
        [bspSubtitleT('common_off', 'Off'), !sub.image.on, () => { sub.image.on = false; bspRenderSubtitleLibrary(); commit(false); }]
      ]), true));
      if (sub.image.on) {
        // Sélecteur : bandeau de vignettes de la banque média (images) + Importer + Aucune.
        const picker = document.createElement('div');
        picker.style.cssText = 'grid-column:1/-1;display:flex;flex-direction:column;gap:8px';
        const strip = document.createElement('div');
        strip.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;max-height:150px;overflow:auto;padding:2px';
        const items = (typeof bspMediaList === 'function' ? bspMediaList() : []).filter((m) => m && m.type === 'image');
        if (!items.length) {
          const em = document.createElement('div');
          em.style.cssText = 'font-size:11px;color:var(--text-secondary);padding:6px';
          em.textContent = bspSubtitleT('subtitle_image_empty', 'Aucune photo dans la banque. Importez-en une.');
          strip.appendChild(em);
        }
        items.forEach((m) => {
          const ref = 'bank:' + m.id;
          const th = document.createElement('button');
          th.type = 'button'; th.title = m.name || '';
          const sel = (sub.image.ref === ref);
          th.style.cssText = 'flex:none;width:64px;height:64px;border-radius:50%;overflow:hidden;cursor:pointer;padding:0;background:#0a0d14;' +
            (sel ? 'border:3px solid var(--accent)' : 'border:1px solid var(--border)');
          th.innerHTML = `<img src="${m.dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`;
          th.onclick = () => { sub.image.ref = ref; bspRenderSubtitleLibrary(); commit(false); };
          strip.appendChild(th);
        });
        picker.appendChild(strip);
        const pickerBar = document.createElement('div');
        pickerBar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        const importBtn = document.createElement('button');
        importBtn.type = 'button'; importBtn.className = 'btn'; importBtn.style.cssText = 'background:var(--bg-dark)';
        importBtn.textContent = '＋ ' + bspSubtitleT('subtitle_image_import', 'Importer une photo');
        const fileIn = document.createElement('input');
        fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.style.display = 'none';
        fileIn.onchange = async () => {
          if (!fileIn.files || !fileIn.files.length || typeof bspMediaImportFiles !== 'function') return;
          const before = (typeof bspMediaList === 'function' ? bspMediaList() : []).filter((m) => m.type === 'image');
          await bspMediaImportFiles(fileIn.files);
          const after = (typeof bspMediaList === 'function' ? bspMediaList() : []).filter((m) => m.type === 'image');
          const added = after.find((m) => !before.some((b) => b.id === m.id)); // le plus récent nouvel élément
          if (added) sub.image.ref = 'bank:' + added.id;
          bspRenderSubtitleLibrary(); commit(false);
        };
        importBtn.onclick = () => fileIn.click();
        pickerBar.appendChild(importBtn); pickerBar.appendChild(fileIn);
        if (sub.image.ref) {
          const none = document.createElement('button');
          none.type = 'button'; none.className = 'btn'; none.style.cssText = 'background:var(--bg-dark)';
          none.textContent = '✕ ' + bspSubtitleT('subtitle_image_none', 'Aucune');
          none.onclick = () => { sub.image.ref = ''; bspRenderSubtitleLibrary(); commit(false); };
          pickerBar.appendChild(none);
        }
        picker.appendChild(pickerBar);
        grid.appendChild(picker);
        // Position (au-dessus / gauche / droite) + taille + fond (transparent possible)
        grid.appendChild(field(bspSubtitleT('subtitle_image_position', 'Position photo'), toggleBtns([
          [bspSubtitleT('subtitle_image_pos_above', 'Au-dessus'), sub.image.position === 'above', () => { sub.image.position = 'above'; bspRenderSubtitleLibrary(); commit(false); }],
          [bspSubtitleT('subtitle_image_pos_left', 'Gauche'), sub.image.position === 'left', () => { sub.image.position = 'left'; bspRenderSubtitleLibrary(); commit(false); }],
          [bspSubtitleT('subtitle_image_pos_right', 'Droite'), sub.image.position === 'right', () => { sub.image.position = 'right'; bspRenderSubtitleLibrary(); commit(false); }]
        ]), true));
        grid.appendChild(field(bspSubtitleT('subtitle_image_size', 'Taille photo'), numRow(sub.image.size, 40, 480, 5, 'px', (n) => { sub.image.size = n; commit(false); })));
        const bgBox = document.createElement('div');
        bgBox.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
        bgBox.appendChild(colorCtl(sub.image.bg || '#00000000', true, (v) => { sub.image.bg = v; commit(false); }));
        const clearBg = document.createElement('button');
        clearBg.type = 'button'; clearBg.style.cssText = 'padding:6px 10px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:11px;font-weight:600;background:#0a0d14;color:var(--text)';
        clearBg.textContent = bspSubtitleT('subtitle_image_bg_none', 'Transparent');
        clearBg.onclick = () => { sub.image.bg = ''; bspRenderSubtitleLibrary(); commit(false); };
        bgBox.appendChild(clearBg);
        grid.appendChild(field(bspSubtitleT('subtitle_image_bg', 'Fond derrière la photo'), bgBox));
      }

      // ── Fond de scène plein cadre : couleur unie / dégradé / image, + opacité (transparence) ──
      grid = secScene;
      grid.appendChild(field(bspSubtitleT('subtitle_scene_type', 'Type de fond'), seg([
        ['none', bspSubtitleT('subtitle_scene_none', 'Aucun')],
        ['solid', bspSubtitleT('subtitle_scene_solid', 'Couleur')],
        ['gradient', bspSubtitleT('subtitle_scene_gradient', 'Dégradé')],
        ['image', bspSubtitleT('subtitle_scene_image', 'Image')]
      ], sub.scene.type, (v) => { sub.scene.type = v; bspRenderSubtitleLibrary(); commit(false); }), true));
      if (sub.scene.type === 'solid') {
        grid.appendChild(field(bspSubtitleT('subtitle_scene_color', 'Couleur (hex + alpha)'), colorCtl(sub.scene.color, true, (v) => { sub.scene.color = v; commit(false); }), true));
      } else if (sub.scene.type === 'gradient') {
        grid.appendChild(field(bspSubtitleT('subtitle_scene_grad_from', 'Couleur début'), colorCtl(sub.scene.gradFrom, true, (v) => { sub.scene.gradFrom = v; commit(false); })));
        grid.appendChild(field(bspSubtitleT('subtitle_scene_grad_to', 'Couleur fin'), colorCtl(sub.scene.gradTo, true, (v) => { sub.scene.gradTo = v; commit(false); })));
        grid.appendChild(field(bspSubtitleT('subtitle_scene_grad_angle', 'Angle'), numRow(sub.scene.gradAngle, 0, 360, 5, '°', (n) => { sub.scene.gradAngle = n; commit(false); }), true));
      } else if (sub.scene.type === 'image') {
        const picker = mediaPickerEl(sub.scene.ref);
        picker._onPick = (ref) => { sub.scene.ref = ref; bspRenderSubtitleLibrary(); commit(false); };
        grid.appendChild(picker);
        grid.appendChild(field(bspSubtitleT('subtitle_scene_fit', 'Cadrage'), seg([
          ['cover', bspSubtitleT('subtitle_scene_fit_cover', 'Remplir')],
          ['contain', bspSubtitleT('subtitle_scene_fit_contain', 'Contenir')]
        ], sub.scene.fit, (v) => { sub.scene.fit = v; commit(false); })));
      }
      if (sub.scene.type !== 'none') {
        grid.appendChild(field(bspSubtitleT('subtitle_scene_opacity', 'Opacité (transparence)'), numRow(sub.scene.opacity, 0, 100, 1, '%', (n) => { sub.scene.opacity = n; commit(false); }), true));
      }

      // Supprimer (pleine largeur, sous les sections)
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'bsp-st-btn';
      del.style.cssText = 'align-self:start;background:rgba(255,59,48,.12);color:#ff8a8a;border-color:rgba(255,59,48,.35)';
      del.textContent = '🗑  ' + bspSubtitleT('subtitle_delete', 'Supprimer ce sous-titre');
      del.onclick = () => bspDeleteSubtitle(sub.id);
      wrap.appendChild(del);

      return wrap;
    }

    // Rafraîchit juste l'aperçu de la ligne de liste sélectionnée sans tout re-rendre (préserve
    // le focus des champs texte pendant la frappe).
    function bspTouchSubtitleListRow() { /* léger : la liste se resync au prochain rendu complet */ }

    if (typeof window !== 'undefined') {
      window.bspOpenSubtitleModal = bspOpenSubtitleModal;
      window.bspAddSubtitle = bspAddSubtitle;
      window.bspSubtitlesLoad = bspSubtitlesLoad;
      window.bspSubtitlesExport = bspSubtitlesExport;
      window.bspSubtitleCardEl = bspSubtitleCardEl;
    }
