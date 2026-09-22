    // ===== PER-OUTPUT DESIGN EDITOR =====
    // Selecting a physical screen opens a focused panel for its "mother" design
    // components — Lines, Mode (FS/LT), Background, Background type — that writes
    // DIRECTLY into that screen's override (bspReplaceOutputDesign), never through the
    // global controls.
    //
    // Why not reuse the toolbar controls: setRatio()/setLines() mutate the shared live
    // globals (liveRatio, linesPerPage) and push live before anything can be captured,
    // so driving them while a screen is selected changes the mode/lines for OBS and
    // every other screen too — the "the mode is synchronised for all screens" problem.
    // This panel bypasses them entirely, so a screen's mode/lines/background are truly
    // its own. Font and finer styles come later, layered on the same override.
    //
    // Each control shows the INHERITED (base/live) value until the operator changes it;
    // changing it stores an override, and setting it back to the base value drops the
    // override so the screen re-follows the live design.

    // The output whose design the panel is editing: '' none, 'obs' the live output, or a
    // physical screen id. The live output is a first-class target with its own override,
    // exactly like a screen — so it gets the same design panel.
    let bspDesignTargetId = '';

    function bspIsEditingScreenDesign() {
      return !!bspDesignTargetId;
    }

    function bspDesignTargetLabel(id) {
      if (id === BSP_DEFAULT_OUTPUT_ID) return t('screens_live_label');
      const screen = (typeof bspScreensAdded !== 'undefined' && Array.isArray(bspScreensAdded))
        ? bspScreensAdded.find(s => s.id === id) : null;
      return screen ? screen.label : id;
    }

    // The inherited design a screen sits on top of: the panel's own live design.
    // Recomputed on demand and never mutated by this editor, so it is a stable base.
    function bspScreenDesignBase() {
      return normalizeProjectionSettingsSnapshot(captureProjectionSettingsSnapshot(), {});
    }

    function bspScreenEffective(id, key, base) {
      const override = bspGetOutputDesign(id) || {};
      if (Object.prototype.hasOwnProperty.call(override, key) && override[key] != null) return override[key];
      return base[key];
    }

    // Apply a patch (one or more keys) to the screen's override, dropping any key whose
    // new value equals the inherited base so it re-follows the live design.
    //
    // opts.rerender === false: update only the header, never the control body. Controls
    // that emit continuously (colour pickers fire `input` on every move, text/number
    // fields while typing) must NOT rebuild the body — doing so destroys the very element
    // the OS colour picker is attached to, which slams the picker shut on each click.
    // Only controls that reveal or hide other fields (toggles, segmented pickers) need a
    // full rebuild, and those are click-based so nothing is open to destroy.
    function bspScreenDesignApply(id, patch, opts = {}) {
      // opts.base: diff against this map instead of the live design. Kind-specific text
      // controls pass the pure Bible/Songs tab profile, so a value set back to that kind's
      // inherited value drops the override even when the OTHER kind is currently live.
      const base = opts.base || bspScreenDesignBase();
      const next = { ...(bspGetOutputDesign(id) || {}) };
      Object.keys(patch).forEach((k) => {
        const v = patch[k];
        if (v == null || JSON.stringify(v) === JSON.stringify(base[k])) delete next[k];
        else next[k] = v;
      });
      bspReplaceOutputDesign(id, next);
      if (opts.rerender === false) bspUpdateDesignHeader();
      else bspRenderScreenDesignPanel();
      // Keep the bottom Screen Mode Zone (which reads the same activeRatio__<kind>
      // keys) in lockstep with any change made here.
      if (typeof bspRenderScreenModeZone === 'function') bspRenderScreenModeZone();
    }

    // The pure projection profile for a content kind (Bible/Songs), independent of what is
    // live — the correct base for diffing per-kind text formatting.
    function bspScreenDesignBaseForKind(kind) {
      const tab = kind === 'bible' ? 'bible' : 'songs';
      try {
        return normalizeProjectionSettingsSnapshot(ensureProjectionSettingsProfiles()[tab], {});
      } catch (_) {
        return bspScreenDesignBase();
      }
    }

    // Which content kind the Text section is formatting. Independent of the live content,
    // so the operator can style verse and song without switching what's on air. Defaults
    // to the live kind on open.
    let bspTextEditKind = 'bible';

    // Effective value of a split text key for the chosen kind: the screen's per-kind
    // override, then its legacy shared override, then that kind's inherited value.
    function bspKindEffective(id, baseKey, kind, kindBase) {
      const ov = bspGetOutputDesign(id) || {};
      const suffixed = ov[baseKey + '__' + kind];
      if (suffixed != null) return suffixed;
      if (ov[baseKey] != null) return ov[baseKey];
      return kindBase[baseKey];
    }

    // ═══ Settings advanced design pages (dynamic) ═══
    // Bring Edit Design's per-output-only sections — Side-Screen (SD), progressive contour,
    // simple stroke, reference border — INTO the Settings modal, routed by settingsTargetOutput
    // through the shared bspSettingsEffectiveDesignKey / bspSettingsApplyDesignKey helpers. One
    // home for formatting; Live edits the base, a screen edits its override.
    function bspRenderSettingsDesignPages() {
      if (typeof bspRenderSettingsModeSelector === 'function') bspRenderSettingsModeSelector();
      if (typeof bspRenderSettingsSdPage === 'function') bspRenderSettingsSdPage();
      if (typeof bspRenderSettingsTypoExtra === 'function') bspRenderSettingsTypoExtra();
      if (typeof bspRenderSettingsBgRef === 'function') bspRenderSettingsBgRef();
    }

    // Mode selector (FS / LT / SD-G / SD-D) in the Settings output bar, per output × kind.
    function bspRenderSettingsModeSelector() {
      const wrap = document.getElementById('settings-mode-seg');
      if (!wrap || typeof bspSettingsEffectiveDesignKey !== 'function') return;
      const kind = bspSettingsDesignKind();
      const raw = bspSettingsEffectiveDesignKey('activeRatio', kind) || 'full';
      const cur = (raw === '16-9' || raw === 'sd-left' || raw === 'sd-right') ? raw : 'full';
      wrap.innerHTML = '';
      [['full', 'FS', t('sde_mode_fs')], ['16-9', 'LT', t('sde_mode_lt')],
       ['sd-left', 'SD-G', t('sde_mode_sd_left')], ['sd-right', 'SD-D', t('sde_mode_sd_right')]].forEach(([val, lbl, title]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'settings-output-bar__modebtn' + (cur === val ? ' is-active' : '');
        b.textContent = lbl;
        b.title = title || lbl;
        b.addEventListener('click', () => bspSettingsApplyMode(val));
        wrap.appendChild(b);
      });
    }
    const bspClampN = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

    function bspRenderSettingsSdPage() {
      const body = document.getElementById('sm-sd-body');
      if (!body || typeof bspSettingsEffectiveDesignKey !== 'function') return;
      const kind = bspSettingsDesignKind();
      const eff = (k) => bspSettingsEffectiveDesignKey(k, kind);
      const set = (k, v) => bspSettingsApplyDesignKey(k, v, kind);
      body.innerHTML = '';
      body.appendChild(bspSdeField(t('sde_sd_width'),
        bspSdeSlider(bspClampN(eff('sdWidth'),15,90,50), 15, 90, (v)=>set('sdWidth', bspClampN(v,15,90,50)), {step:1,unit:'%',fallback:50})));
      [['sdMarginTop','sde_sd_margin_top',4],['sdMarginRight','sde_sd_margin_right',6],['sdMarginBottom','sde_sd_margin_bottom',4],['sdMarginLeft','sde_sd_margin_left',6]].forEach(([k,lbl,d])=>{
        body.appendChild(bspSdeField(t('sde_sd_margins')+' · '+t(lbl),
          bspSdeSlider(bspClampN(eff(k),0,40,d), 0, 40, (v)=>set(k, bspClampN(v,0,40,d)), {step:1,unit:'%',fallback:d})));
      });
      body.appendChild(bspSdeField(t('sde_sd_slant'),
        bspSdeSlider(bspClampN(eff('sdSlant'),-40,40,0), -40, 40, (v)=>set('sdSlant', bspClampN(v,-40,40,0)), {step:1,unit:'%',fallback:0})));
      body.appendChild(bspSdeField(t('sde_sd_stroke'),
        bspSdeSlider(bspClampN(eff('sdStrokeWidth'),0,40,0), 0, 40, (v)=>set('sdStrokeWidth', bspClampN(v,0,40,0)), {step:1,unit:'px',fallback:0})));
      body.appendChild(bspSdeField(t('sde_sd_stroke_color'),
        bspSdeColorA(eff('sdStrokeColor')||'#FFD24AFF','#FFD24AFF',(v)=>set('sdStrokeColor', v),{title:t('sde_sd_stroke_color')})));
    }

    function bspRenderSettingsTypoExtra() {
      const body = document.getElementById('sm-typo-extra');
      if (!body || typeof bspSettingsEffectiveDesignKey !== 'function') return;
      const kind = bspSettingsDesignKind();
      const isBible = kind === 'bible';
      const eff = (k) => bspSettingsEffectiveDesignKey(k, kind);
      const set = (k, v) => bspSettingsApplyDesignKey(k, v, kind);
      const reRender = () => bspRenderSettingsTypoExtra();
      body.innerHTML = '';

      // Progressive contour (content)
      const cEn = isBible ? 'verseContourEnabled' : 'songContourEnabled';
      const cCol = isBible ? 'verseContourColor' : 'songContourColor';
      const cSz = isBible ? 'verseContourSize' : 'songContourSize';
      body.appendChild(bspSdeSection(t('sde_contour')));
      const cOn = !!eff(cEn);
      body.appendChild(bspSdeField(t('sde_contour'), bspSdeToggle(cOn, ()=>{ set(cEn, !cOn); reRender(); })));
      if (cOn) {
        body.appendChild(bspSdeField(t('sde_contour_size'),
          bspSdeSlider(bspClampN(eff(cSz),0,20,4), 0, 20, (v)=>set(cSz, bspClampN(v,0,20,4)), {step:1,unit:'px',fallback:4})));
        body.appendChild(bspSdeField(t('sde_contour_color'),
          bspSdeColorA(eff(cCol)||'#000000FF','#000000FF',(v)=>set(cCol,v),{title:t('sde_contour_color')})));
      }
      // Simple stroke (content)
      const sEn = isBible ? 'verseStrokeEnabled' : 'songStrokeEnabled';
      const sCol = isBible ? 'verseStrokeColor' : 'songStrokeColor';
      const sSz = isBible ? 'verseStrokeSize' : 'songStrokeSize';
      body.appendChild(bspSdeSection(t('sde_stroke')));
      const sOn = !!eff(sEn);
      body.appendChild(bspSdeField(t('sde_stroke'), bspSdeToggle(sOn, ()=>{ set(sEn, !sOn); reRender(); })));
      if (sOn) {
        body.appendChild(bspSdeField(t('sde_stroke_size'),
          bspSdeSlider(bspClampN(eff(sSz),0,20,2), 0, 20, (v)=>set(sSz, bspClampN(v,0,20,2)), {step:1,unit:'px',fallback:2})));
        body.appendChild(bspSdeField(t('sde_stroke_color'),
          bspSdeColorA(eff(sCol)||'#000000FF','#000000FF',(v)=>set(sCol,v),{title:t('sde_stroke_color')})));
      }
      // Reference (Bible only) — TEXT styling only : gras/italique, casse (—/AA/aa/Aa),
      // contour, trait. La BOÎTE de référence (fond, rayon, bordure, souligné) vit désormais
      // dans l'onglet Background (bspRenderSettingsBgRef), à la demande.
      if (isBible) {
        body.appendChild(bspSdeSection(t('sde_section_reference')));

        // Bold / italic — refBold defaults on (historic 800 weight).
        const refBoldOn = eff('refBold') !== false;
        const refItalicOn = !!eff('refItalic');
        const refBiSeg = document.createElement('div');
        refBiSeg.className = 'bsp-sde-seg-group';
        refBiSeg.appendChild(bspSegButton('B', refBoldOn, () => { set('refBold', !refBoldOn); reRender(); }, t('sde_ref_bold')));
        refBiSeg.appendChild(bspSegButton('I', refItalicOn, () => { set('refItalic', !refItalicOn); reRender(); }, t('sde_ref_italic')));
        body.appendChild(bspSdeField(t('sde_ref_style'), refBiSeg));

        // Case (—/AA/aa/Aa) — mode-dependent key: LT → ltRefTextTransform, sinon
        // fullRefTextTransform. Chemin de CAPTURE (comme l'alignement) : updateReference...
        // pose la globale + notifie, la capture l'écrit dans la sortie ciblée → PAS de skip.
        const refMode = eff('activeRatio') || 'full';
        const refTfKey = (refMode === '16-9') ? 'ltRefTextTransform' : 'fullRefTextTransform';
        const refTfArg = (refMode === '16-9') ? 'lt' : 'full';
        const refTfVal = eff(refTfKey) || 'uppercase';
        const refTfSeg = document.createElement('div');
        refTfSeg.className = 'bsp-sde-seg-group';
        [['none','—',t('sde_tf_none')],['uppercase','AA',t('sde_tf_upper')],
         ['lowercase','aa',t('sde_tf_lower')],['capitalize','Aa',t('sde_tf_cap')]].forEach(([val,lbl,title])=>{
          refTfSeg.appendChild(bspSegButton(lbl, refTfVal === val, () => {
            if (typeof updateReferenceTextTransformValue === 'function') updateReferenceTextTransformValue(refTfArg, val, { notify: true });
            reRender();
          }, title));
        });
        body.appendChild(bspSdeField(t('sde_ref_transform'), refTfSeg));

        const rcOn = !!eff('refContourEnabled');
        body.appendChild(bspSdeField(t('sde_ref_contour'), bspSdeToggle(rcOn, ()=>{ set('refContourEnabled', !rcOn); reRender(); })));
        if (rcOn) {
          body.appendChild(bspSdeField(t('sde_contour_size'),
            bspSdeSlider(bspClampN(eff('refContourSize'),0,20,3), 0, 20, (v)=>set('refContourSize', bspClampN(v,0,20,3)), {step:1,unit:'px',fallback:3})));
          body.appendChild(bspSdeField(t('sde_contour_color'),
            bspSdeColorA(eff('refContourColor')||'#000000FF','#000000FF',(v)=>set('refContourColor',v),{title:t('sde_contour_color')})));
        }
        const rsOn = !!eff('refStrokeEnabled');
        body.appendChild(bspSdeField(t('sde_ref_stroke'), bspSdeToggle(rsOn, ()=>{ set('refStrokeEnabled', !rsOn); reRender(); })));
        if (rsOn) {
          body.appendChild(bspSdeField(t('sde_stroke_size'),
            bspSdeSlider(bspClampN(eff('refStrokeSize'),0,20,2), 0, 20, (v)=>set('refStrokeSize', bspClampN(v,0,20,2)), {step:1,unit:'px',fallback:2})));
          body.appendChild(bspSdeField(t('sde_stroke_color'),
            bspSdeColorA(eff('refStrokeColor')||'#000000FF','#000000FF',(v)=>set('refStrokeColor',v),{title:t('sde_stroke_color')})));
        }
      }
    }

    // Reference BACKGROUND (Bible only) — migré de « Typography & colors » vers l'onglet
    // Background à la demande. La boîte a une couleur et un arrondi, plus une bordure et un
    // souligné optionnels. Routé par sortie comme les pages SD / typo (écriture directe dans la
    // surcharge, protégé par le skip-set). Ne s'affiche que pour la Bible (pas de réf. en chant).
    function bspRenderSettingsBgRef() {
      const body = document.getElementById('sm-bg-ref-extra');
      if (!body || typeof bspSettingsEffectiveDesignKey !== 'function') return;
      body.innerHTML = '';
      const kind = bspSettingsDesignKind();
      if (kind !== 'bible') return;
      const eff = (k) => bspSettingsEffectiveDesignKey(k, 'bible');
      const set = (k, v) => bspSettingsApplyDesignKey(k, v, 'bible');
      const reRender = () => bspRenderSettingsBgRef();

      body.appendChild(bspSdeSection(t('settings_reference_background')));

      // Boîte on/off — off = référence nue, sans fond plein.
      const boxOn = eff('refBgEnabled') !== false;
      body.appendChild(bspSdeField(t('sde_ref_box'), bspSdeToggle(boxOn, () => { set('refBgEnabled', !boxOn); reRender(); })));
      if (boxOn) {
        body.appendChild(bspSdeField(t('sde_ref_bg_color'),
          bspSdeColorA(eff('refBgColor')||'#FFD500','#FFD500',(v)=>set('refBgColor', v),{title:t('sde_ref_bg_color')})));
        body.appendChild(bspSdeField(t('sde_ref_radius'),
          bspSdeSlider(bspClampN(eff('refBorderRadius'),0,120,12), 0, 120, (v)=>set('refBorderRadius', bspClampN(v,0,120,12)), {step:1,unit:'px',fallback:12})));
        body.appendChild(bspSdeField(t('sde_ref_border'),
          bspSdeSlider(bspClampN(eff('refBorderWidth'),0,40,0), 0, 40, (v)=>set('refBorderWidth', bspClampN(v,0,40,0)), {step:1,unit:'px',fallback:0})));
        body.appendChild(bspSdeField(t('sde_ref_border_color'),
          bspSdeColorA(eff('refBorderColor')||'#FFFFFFFF','#FFFFFFFF',(v)=>set('refBorderColor',v),{title:t('sde_ref_border_color')})));
      }

      // Souligné — utilisable avec ou sans la boîte (couleur + épaisseur dans un champ).
      const ulOn = !!eff('refUnderlineEnabled');
      body.appendChild(bspSdeField(t('sde_ref_underline'), bspSdeToggle(ulOn, () => { set('refUnderlineEnabled', !ulOn); reRender(); })));
      if (ulOn) {
        const ulWrap = document.createElement('div');
        ulWrap.className = 'bsp-sde-bg-value';
        ulWrap.appendChild(bspSdeColorA(eff('refUnderlineColor')||'#FFD500','#FFD500',(v)=>set('refUnderlineColor',v),{title:t('sde_line_color')}));
        ulWrap.appendChild(bspSdeSlider(bspClampN(eff('refUnderlineThickness'),0,40,3),0,40,(v)=>set('refUnderlineThickness',bspClampN(v,0,40,3)),{step:1,unit:'px',fallback:3}));
        body.appendChild(bspSdeField(t('sde_line_style'), ulWrap));
      }
    }

    // ── Selection ──────────────────────────────────────────────────────────────
    // Selecting an output no longer opens anything by itself: it reveals the design
    // icon next to the Settings gear. The editor is a modal, opened from that icon.
    window.bspOnScreenSelectionChange = function (selectedId) {
      bspDesignTargetId = selectedId || '';
      document.body.classList.toggle('bsp-editing-screen-design', !!bspDesignTargetId);
      const btn = document.getElementById('bsp-design-btn');
      if (btn) btn.hidden = !bspDesignTargetId;
      bspSyncFreezeButton();
      if (typeof bspRenderScreenModeZone === 'function') bspRenderScreenModeZone();
      // Keep the live-preview window pointed at the newly selected screen.
      if (typeof bspPreviewUpdateTarget === 'function' && typeof bspPreviewIsOpen === 'function' && bspPreviewIsOpen()) bspPreviewUpdateTarget();
      if (!bspDesignTargetId) bspCloseDesignModal();
      else if (bspIsDesignModalOpen()) bspRenderScreenDesignPanel();
    };

    // Freeze acts on the output currently selected in the Screens bar.
    function bspSyncFreezeButton() {
      const btn = document.getElementById('bsp-freeze-btn');
      if (!btn) return;
      btn.hidden = !bspDesignTargetId;
      const frozen = bspDesignTargetId && typeof bspIsOutputFrozen === 'function' && bspIsOutputFrozen(bspDesignTargetId);
      btn.classList.toggle('is-frozen', !!frozen);
      btn.setAttribute('aria-pressed', frozen ? 'true' : 'false');
      btn.title = frozen ? t('freeze_active') : t('freeze_title');
    }

    function bspToggleFreezeFromToolbar() {
      if (!bspDesignTargetId) return;
      const label = bspDesignTargetLabel(bspDesignTargetId);
      const nowFrozen = bspToggleOutputFreeze(bspDesignTargetId);
      // Freezing needs something already on screen to pin; say so instead of silently
      // doing nothing.
      if (nowFrozen === false && bspIsOutputFrozen(bspDesignTargetId) === false &&
          !bspLastSentDesigns[bspDesignTargetId]) {
        showToast(t('freeze_nothing_live'));
      } else {
        showToast((nowFrozen ? t('freeze_on') : t('freeze_off')).replace('{screen}', label));
      }
      bspSyncFreezeButton();
      if (typeof bspScreensRenderChips === 'function') bspScreensRenderChips();
    }

    function bspIsDesignModalOpen() {
      const modal = document.getElementById('bsp-design-modal');
      return !!(modal && !modal.hidden);
    }

    function bspOpenDesignModal() {
      if (!bspDesignTargetId) return;
      // Étape 3 : Edit Design est fusionné dans Settings. Le bouton design d'un écran ouvre
      // désormais Settings, pré-ciblé sur CETTE sortie (sélecteur « Réglages pour » = l'écran).
      // Un seul endroit pour tout le formatage.
      if (typeof openModal === 'function' && document.getElementById('settingsModal') &&
          typeof handleSettingsOutputChange === 'function') {
        openModal('settingsModal');
        handleSettingsOutputChange(bspDesignTargetId);
        return;
      }
      // Repli hérité (ne devrait plus servir).
      const modal = document.getElementById('bsp-design-modal');
      if (!modal) return;
      modal.hidden = false;
      bspTextEditKind = (typeof bspScreenContentKind === 'function' && bspScreenContentKind() === 'songs') ? 'songs' : 'bible';
      bspRenderScreenDesignPanel();
      document.addEventListener('keydown', bspDesignModalKeydown, true);
    }

    function bspCloseDesignModal() {
      const modal = document.getElementById('bsp-design-modal');
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      document.removeEventListener('keydown', bspDesignModalKeydown, true);
      const btn = document.getElementById('bsp-design-btn');
      if (btn && !btn.hidden) btn.focus();
    }

    function bspDesignModalKeydown(e) {
      // Capture phase + stopPropagation so Escape closes the modal without also
      // cancelling an active projection (the Screens bar listens for Escape too).
      if (e.key === 'Escape' && bspIsDesignModalOpen()) {
        e.preventDefault();
        e.stopPropagation();
        bspCloseDesignModal();
      }
    }

    function bspResetScreenDesign() {
      if (!bspDesignTargetId) return;
      bspClearOutputDesign(bspDesignTargetId);
      bspRenderScreenDesignPanel();
    }

    // ── Rendering ──────────────────────────────────────────────────────────────
    function bspSegButton(label, active, onClick, title) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bsp-sde-seg' + (active ? ' is-active' : '');
      b.textContent = label;
      if (title) b.title = title;
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      b.addEventListener('click', onClick);
      return b;
    }

    function bspSdeField(labelText, controlEl) {
      const wrap = document.createElement('div');
      wrap.className = 'bsp-sde-field';
      const label = document.createElement('span');
      label.className = 'bsp-sde-field__label';
      label.textContent = labelText;
      wrap.appendChild(label);
      wrap.appendChild(controlEl);
      return wrap;
    }

    function bspSdeSection(title) {
      const h = document.createElement('div');
      h.className = 'bsp-sde-section';
      h.textContent = title;
      return h;
    }

    // Header only (name + override count + reset visibility). Cheap, and it touches no
    // control, so an open colour picker survives.
    function bspUpdateDesignHeader() {
      const nameEl = document.getElementById('bsp-screen-design-name');
      const countEl = document.getElementById('bsp-screen-design-count');
      const resetBtn = document.getElementById('bsp-screen-design-reset');
      if (!bspDesignTargetId) return;
      const n = Object.keys(bspGetOutputDesign(bspDesignTargetId) || {}).length;
      if (nameEl) nameEl.textContent = bspDesignTargetLabel(bspDesignTargetId);
      if (countEl) {
        countEl.textContent = n
          ? t('screen_design_override_count').replace('{n}', String(n))
          : t('screen_design_inherits');
      }
      if (resetBtn) resetBtn.hidden = n === 0;
    }

    function bspSdeToggle(on, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bsp-sde-toggle' + (on ? ' is-on' : '');
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.textContent = on ? t('sde_on') : t('sde_off');
      b.addEventListener('click', onClick);
      return b;
    }

    // `onChange` receives (value, opts) and must forward opts to bspScreenDesignApply.
    // Both `input` (live, while the picker is open) and `change` (picker committed) pass
    // rerender:false so the element is never rebuilt under an open picker.
    function bspSdeColor(value, fallback, onChange, title) {
      const c = document.createElement('input');
      c.type = 'color';
      c.className = 'bsp-sde-color';
      c.value = value || fallback;
      if (title) c.title = title;
      const emit = () => onChange(c.value, { rerender: false });
      c.addEventListener('input', emit);
      c.addEventListener('change', emit);
      return c;
    }

    // Parse any CSS colour to { hex6, alpha }. Accepts #rgb, #rrggbb, #rrggbbaa, rgb()/rgba().
    function bspColorParse(value) {
      const v = String(value == null ? '' : value).trim();
      let m;
      if ((m = v.match(/^#([0-9a-fA-F]{3})$/))) {
        const c = m[1];
        return { hex6: ('#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2]).toUpperCase(), alpha: 1 };
      }
      if ((m = v.match(/^#([0-9a-fA-F]{6})$/))) return { hex6: ('#' + m[1]).toUpperCase(), alpha: 1 };
      if ((m = v.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/))) {
        return { hex6: ('#' + m[1]).toUpperCase(), alpha: parseInt(m[2], 16) / 255 };
      }
      if ((m = v.match(/^rgba?\(([^)]+)\)$/i))) {
        const p = m[1].split(',').map(s => s.trim());
        const to2 = (n) => ('0' + Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16)).slice(-2);
        if (p.length >= 3) return { hex6: ('#' + to2(p[0]) + to2(p[1]) + to2(p[2])).toUpperCase(), alpha: p[3] != null ? Number(p[3]) : 1 };
      }
      return { hex6: '#000000', alpha: 1 };
    }

    // hex6 + alpha(0..1) -> "#RRGGBB" (alpha 1) or "#RRGGBBAA". CSS renders both directly,
    // and the display applies these colours as-is (style.color / inline CSS).
    function bspColorCompose(hex6, alpha) {
      const a = Math.max(0, Math.min(1, Number(alpha)));
      const base = String(hex6 || '#000000').toUpperCase();
      if (a >= 0.999) return base;
      const aa = ('0' + Math.round(a * 255).toString(16)).slice(-2).toUpperCase();
      return base + aa;
    }

    // Compound colour control: swatch + editable HEX field + optional OPACITY slider.
    // Emits a CSS-valid colour ("#RRGGBB" or "#RRGGBBAA") the display renders directly.
    // opts: { alpha (default true), title }.
    function bspSdeColorA(value, fallback, onChange, opts = {}) {
      const withAlpha = opts.alpha !== false;
      const parsed = bspColorParse(value || fallback);
      let alphaState = withAlpha ? parsed.alpha : 1;

      const wrap = document.createElement('div');
      wrap.className = 'bsp-sde-color-ctl';

      const sw = document.createElement('input');
      sw.type = 'color';
      sw.className = 'bsp-sde-color';
      sw.value = parsed.hex6;
      if (opts.title) sw.title = opts.title;

      const hex = document.createElement('input');
      hex.type = 'text';
      hex.className = 'bsp-sde-color-hex';
      hex.spellcheck = false;
      hex.maxLength = 9;
      hex.value = bspColorCompose(sw.value, alphaState);

      let opRange = null, opBubble = null;

      const emit = () => onChange(bspColorCompose(sw.value.toUpperCase(), withAlpha ? alphaState : 1), { rerender: false });
      const refreshHex = () => { hex.value = bspColorCompose(sw.value.toUpperCase(), withAlpha ? alphaState : 1); };

      sw.addEventListener('input', () => { refreshHex(); emit(); });
      hex.addEventListener('change', () => {
        const p = bspColorParse(hex.value);
        sw.value = p.hex6;
        if (withAlpha) {
          alphaState = p.alpha;
          if (opRange) opRange.value = String(Math.round(alphaState * 100));
          if (opBubble) opBubble.textContent = Math.round(alphaState * 100) + '%';
        }
        emit();
      });

      wrap.appendChild(sw);
      wrap.appendChild(hex);

      if (withAlpha) {
        const slider = document.createElement('div');
        slider.className = 'bsp-sde-slider';
        opRange = document.createElement('input');
        opRange.type = 'range';
        opRange.className = 'bsp-sde-slider__range';
        opRange.min = '0'; opRange.max = '100'; opRange.step = '1';
        opRange.value = String(Math.round(alphaState * 100));
        opRange.title = opts.title ? (opts.title + ' — opacity') : 'Opacity';
        opBubble = document.createElement('span');
        opBubble.className = 'bsp-sde-slider__val';
        opBubble.textContent = Math.round(alphaState * 100) + '%';
        opRange.addEventListener('input', () => {
          alphaState = Number(opRange.value) / 100;
          opBubble.textContent = opRange.value + '%';
          refreshHex();
          emit();
        });
        slider.appendChild(opRange);
        slider.appendChild(opBubble);
        wrap.appendChild(slider);
      }
      return wrap;
    }

    // Background image/video value: a preview of the current pick + a button that opens
    // the media gallery (browse bank / drag-drop / paste link / choose). Selecting sets
    // the source to 'url' so both bank refs ("bank:<id>") and plain links flow through the
    // same resolution path.
    // onApply receives a plain-key patch ({ bgImageSource, bgImageUrl }); the caller
    // decides how it is stored (kind-suffixed for the design panel).
    function bspMediaPickerControl(isVideo, current, onApply, urlKey, srcKey) {
      const wrap = document.createElement('div');
      wrap.className = 'bsp-media-pick';

      const prev = document.createElement('span');
      prev.className = 'bsp-media-pick__preview';
      const hasBankImg = current && typeof bspIsMediaRef === 'function' && bspIsMediaRef(current) &&
        !isVideo && typeof bspMediaGet === 'function' && bspMediaGet(String(current).slice(5));
      if (hasBankImg) {
        const img = document.createElement('img');
        img.src = hasBankImg.dataUrl; img.alt = '';
        prev.appendChild(img);
      } else if (current) {
        prev.classList.add('has-value');
        prev.textContent = isVideo ? '▶' : '🖼';
      } else {
        prev.classList.add('is-empty');
        prev.textContent = '—';
      }
      wrap.appendChild(prev);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bsp-media-pick__btn';
      btn.textContent = current ? t('sde_media_change') : t('sde_media_choose');
      btn.addEventListener('click', () => {
        if (typeof bspOpenMediaGallery !== 'function') return;
        bspOpenMediaGallery({
          kind: isVideo ? 'video' : 'image',
          onPick: (ref) => onApply({ [srcKey]: 'url', [urlKey]: ref })
        });
      });
      wrap.appendChild(btn);

      if (current) {
        const clr = document.createElement('button');
        clr.type = 'button';
        clr.className = 'bsp-media-pick__clear';
        clr.title = t('sde_media_clear');
        clr.textContent = '✕';
        clr.addEventListener('click', () => onApply({ [urlKey]: '' }));
        wrap.appendChild(clr);
      }
      return wrap;
    }

    function bspSdeUrl(value, placeholder, onChange) {
      const u = document.createElement('input');
      u.type = 'text';
      u.className = 'bsp-sde-url';
      u.placeholder = placeholder;
      u.value = value || '';
      // rerender:false so the field isn't rebuilt out from under the caret.
      u.addEventListener('change', () => onChange(u.value.trim(), { rerender: false }));
      return u;
    }

    function bspSdeNumber(value, min, max, onChange, step = 1) {
      const n = document.createElement('input');
      n.type = 'number';
      n.className = 'bsp-sde-number';
      n.min = String(min); n.max = String(max); n.step = String(step);
      n.value = Number(value) || 0;
      // rerender:false keeps focus in the field; numbers never reveal other controls.
      n.addEventListener('change', () => {
        onChange(Math.max(min, Math.min(max, Number(n.value) || 0)), { rerender: false });
      });
      return n;
    }

    // Range slider with a live value bubble. Emits continuously on 'input' with
    // rerender:false (like colours) so dragging never rebuilds the panel under the thumb.
    // opts: { step, unit, fallback }.
    function bspSdeSlider(value, min, max, onChange, opts = {}) {
      const step = opts.step != null ? opts.step : 1;
      const unit = opts.unit || '';
      const wrap = document.createElement('div');
      wrap.className = 'bsp-sde-slider';
      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'bsp-sde-slider__range';
      range.min = String(min); range.max = String(max); range.step = String(step);
      const start = (value == null || value === '') ? (opts.fallback != null ? opts.fallback : min) : value;
      range.value = String(Number(start));
      const bubble = document.createElement('span');
      bubble.className = 'bsp-sde-slider__val';
      const fmt = (v) => (step < 1 ? Number(v).toFixed(2) : String(Math.round(Number(v)))) + unit;
      bubble.textContent = fmt(range.value);
      range.addEventListener('input', () => {
        bubble.textContent = fmt(range.value);
        onChange(Number(range.value), { rerender: false });
      });
      wrap.appendChild(range);
      wrap.appendChild(bubble);
      return wrap;
    }

    function bspSdeSelect(options, value, onChange) {
      const sel = document.createElement('select');
      sel.className = 'bsp-sde-select';
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      sel.value = value;
      // If the stored value isn't among the options (e.g. a system font not yet loaded),
      // add it so the picker still shows the real selection.
      if (sel.value !== value && value != null && value !== '') {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = bspFontLabelForValue(value);
        sel.insertBefore(o, sel.firstChild);
        sel.value = value;
      }
      // rerender:false — font/weight never reveal other controls, and rebuilding would
      // steal focus right after the user picked an option.
      sel.addEventListener('change', () => onChange(sel.value, { rerender: false }));
      return sel;
    }

    // The size/alignment/transform a screen actually uses depends on its own mode
    // (full vs lower-third) and the live content kind, so the panel edits the matching
    // profile key — otherwise setting "size" while a screen is in LT would do nothing.
    function bspScreenContentKind() {
      if (typeof livePointer !== 'undefined' && livePointer && livePointer.kind) {
        return livePointer.kind === 'songs' ? 'songs' : 'bible';
      }
      return (typeof sidebarTab !== 'undefined' && sidebarTab === 'songs') ? 'songs' : 'bible';
    }
    function bspSizeKey(mode, kind) {
      return mode === '16-9' ? (kind === 'songs' ? 'ltFontSongs' : 'ltFontBible') : 'fontSizeFull';
    }
    function bspHAlignKey(mode, kind) {
      return mode === '16-9' ? (kind === 'songs' ? 'hAlignLTSongs' : 'hAlignLTBible') : 'hAlignFull';
    }
    function bspVAlignKey(mode, kind) {
      return mode === '16-9' ? (kind === 'songs' ? 'vAlignLTSongs' : 'vAlignLTBible') : 'vAlignFull';
    }
    function bspTransformKey(mode) {
      return mode === '16-9' ? 'ltTextTransform' : 'fullTextTransform';
    }
    // The reference size is a different key per mode: buildLivePayload uses
    // `ltRefSize = ltRefFontSize || refFontSize` in lower-third, so writing refFontSize
    // alone never changes the reference there — ltRefFontSize always wins.
    function bspRefSizeKey(mode) {
      return mode === '16-9' ? 'ltRefFontSize' : 'refFontSize';
    }
    // Padding is per box: the full-screen box and the lower-third box keep their own
    // four sides, so switching mode doesn't drag the other layout's spacing with it.
    function bspPadKeys(mode) {
      return (mode === '16-9')
        ? { t: 'padTopLT', r: 'padRightLT', b: 'padBottomLT', l: 'padLeftLT' }
        : { t: 'padTopFull', r: 'padRightFull', b: 'padBottomFull', l: 'padLeftFull' };
    }

    function bspRenderScreenDesignPanel() {
      const banner = document.getElementById('bsp-screen-design-banner');
      const body = document.getElementById('bsp-sde-body');
      const nameEl = document.getElementById('bsp-screen-design-name');
      const countEl = document.getElementById('bsp-screen-design-count');
      const resetBtn = document.getElementById('bsp-screen-design-reset');
      if (!banner || !body) return;

      // Visibility belongs to the modal (bspOpenDesignModal/bspCloseDesignModal); this
      // function only fills in the content for the current target.
      if (!bspDesignTargetId) {
        body.innerHTML = '';
        return;
      }

      // Same panel for every output, the live output ('obs') included: it carries its own
      // override on top of the base (the normal settings), like any screen.
      const id = bspDesignTargetId;
      const base = bspScreenDesignBase();
      const override = bspGetOutputDesign(id) || {};
      const n = Object.keys(override).length;

      if (nameEl) nameEl.textContent = bspDesignTargetLabel(id);
      if (countEl) {
        countEl.textContent = n
          ? t('screen_design_override_count').replace('{n}', String(n))
          : t('screen_design_inherits');
      }
      if (resetBtn) resetBtn.hidden = n === 0;

      body.innerHTML = '';
      const kind = bspScreenContentKind();

      // ══ CONTENT KIND — top-level ══
      // This selector governs EVERYTHING below: each kind (Bible / Songs) carries its own
      // mode, background, fonts, colours, shadow, contour… So it sits first and large, above
      // the layout, instead of being buried inside it.
      {
        const topKind = (bspTextEditKind === 'songs') ? 'songs' : 'bible';
        const kindTop = document.createElement('div');
        kindTop.className = 'bsp-sde-seg-group bsp-sde-kind-top';
        kindTop.appendChild(bspSegButton(t('sde_kind_bible'), topKind === 'bible',
          () => { bspTextEditKind = 'bible'; bspRenderScreenDesignPanel(); }));
        kindTop.appendChild(bspSegButton(t('sde_kind_songs'), topKind === 'songs',
          () => { bspTextEditKind = 'songs'; bspRenderScreenDesignPanel(); }));
        body.appendChild(kindTop);
      }

      body.appendChild(bspSdeSection(t('sde_section_layout')));

      // ── Mode (FS / LT) ── per content kind, writing the SAME activeRatio__<kind>
      // key as the bottom Screen Mode Zone so the two controls are one source of
      // truth: changing FS/LT here moves the zone and vice versa.
      const modeKind = (bspTextEditKind === 'songs') ? 'songs' : 'bible';
      const modeKindBase = bspScreenDesignBaseForKind(modeKind);
      // rawMode is the true selection (full / 16-9 / sd-left / sd-right); `mode` collapses
      // SD to 'full' because SD is full-like for every downstream key (size, align,
      // padding, transform all use the FS keys). Only the buttons + SD-width slider read
      // rawMode.
      const rawMode = bspKindEffective(id, 'activeRatio', modeKind, modeKindBase);
      const isSd = (rawMode === 'sd-left' || rawMode === 'sd-right');
      const mode = rawMode === '16-9' ? '16-9' : 'full';
      const applyMode = (v) => {
        bspScreenDesignApply(id,
          { ['activeRatio__' + modeKind]: v },
          { base: { ['activeRatio__' + modeKind]: modeKindBase.activeRatio } });
        // For the LIVE output, the override alone doesn't switch the projection (it reads
        // liveRatio). Drive the live mode too — same helper the Mode/screen zone uses, so
        // FS/LT here works exactly like the zone. Fixes the modal doing nothing on 'obs'.
        if (id === 'obs' && typeof bspDriveObsLiveMode === 'function') {
          bspDriveObsLiveMode(modeKind, v);
        }
      };
      const modeSeg = document.createElement('div');
      modeSeg.className = 'bsp-sde-seg-group';
      modeSeg.appendChild(bspSegButton('FS', (mode === 'full' && !isSd), () => applyMode('full'), t('sde_mode_fs')));
      modeSeg.appendChild(bspSegButton('LT', mode === '16-9', () => applyMode('16-9'), t('sde_mode_lt')));
      modeSeg.appendChild(bspSegButton('SD-G', rawMode === 'sd-left', () => applyMode('sd-left'), t('sde_mode_sd_left')));
      modeSeg.appendChild(bspSegButton('SD-D', rawMode === 'sd-right', () => applyMode('sd-right'), t('sde_mode_sd_right')));
      body.appendChild(bspSdeField(t('sde_mode'), modeSeg));

      // ── SD width ── only meaningful in SD mode: how wide the side-screen half is
      // (15–90% of the display). Writes the per-kind sdWidth key resolved at build time.
      if (isSd) {
        const sdwBase = Number(bspScreenDesignBaseForKind(modeKind).sdWidth) || 50;
        const sdwVal = Math.max(15, Math.min(90,
          Number(bspKindEffective(id, 'sdWidth', modeKind, { sdWidth: sdwBase })) || 50));
        const sdwSlider = bspSdeSlider(sdwVal, 15, 90, (val) => {
          const v = Math.max(15, Math.min(90, Number(val) || 50));
          bspScreenDesignApply(id, { ['sdWidth__' + modeKind]: v },
            { base: { ['sdWidth__' + modeKind]: sdwBase }, rerender: false });
        }, { step: 1, unit: '%', fallback: 50 });
        body.appendChild(bspSdeField(t('sde_sd_width'), sdwSlider));

        // ── SD margins (4 sides) ── Top/Bottom are % of the panel HEIGHT, Left/Right % of the
        // panel WIDTH. Left/Right fall back to the legacy single sdMargin for designs saved
        // before the split, so nothing shifts on old configs.
        const sdKindBase = bspScreenDesignBaseForKind(modeKind);
        const legacyM = Number.isFinite(Number(sdKindBase.sdMargin)) ? Number(sdKindBase.sdMargin) : 6;
        const marginSpecs = [
          { key: 'sdMarginTop',    label: t('sde_sd_margin_top'),    def: 4 },
          { key: 'sdMarginRight',  label: t('sde_sd_margin_right'),  def: legacyM },
          { key: 'sdMarginBottom', label: t('sde_sd_margin_bottom'), def: 4 },
          { key: 'sdMarginLeft',   label: t('sde_sd_margin_left'),   def: legacyM }
        ];
        marginSpecs.forEach((spec) => {
          const baseV = Number.isFinite(Number(sdKindBase[spec.key])) ? Number(sdKindBase[spec.key]) : spec.def;
          const cur = Math.max(0, Math.min(40,
            Number(bspKindEffective(id, spec.key, modeKind, { [spec.key]: baseV })) || 0));
          const slider = bspSdeSlider(cur, 0, 40, (val) => {
            const v = Math.max(0, Math.min(40, Number(val) || 0));
            bspScreenDesignApply(id, { [spec.key + '__' + modeKind]: v },
              { base: { [spec.key + '__' + modeKind]: baseV }, rerender: false });
          }, { step: 1, unit: '%', fallback: spec.def });
          body.appendChild(bspSdeField(t('sde_sd_margins') + ' · ' + spec.label, slider));
        });

        // ── Inner-edge slant ── the edge of the panel facing the screen centre becomes a
        // full-height diagonal. Signed % of the panel width: 0 = vertical, + tilts one way,
        // − the other.
        const sdsBase = Number(bspScreenDesignBaseForKind(modeKind).sdSlant);
        const sdsBaseVal = Number.isFinite(sdsBase) ? sdsBase : 0;
        const sdsVal = Math.max(-40, Math.min(40,
          Number(bspKindEffective(id, 'sdSlant', modeKind, { sdSlant: sdsBaseVal })) || 0));
        const sdsSlider = bspSdeSlider(sdsVal, -40, 40, (val) => {
          const v = Math.max(-40, Math.min(40, Number(val) || 0));
          bspScreenDesignApply(id, { ['sdSlant__' + modeKind]: v },
            { base: { ['sdSlant__' + modeKind]: sdsBaseVal }, rerender: false });
        }, { step: 1, unit: '%', fallback: 0 });
        body.appendChild(bspSdeField(t('sde_sd_slant'), sdsSlider));

        // ── Edge stroke ── a coloured line drawn along that inclined inner edge. Width 0
        // turns it off. Colour carries its own opacity (#RRGGBBAA).
        const sdswBase = Number(bspScreenDesignBaseForKind(modeKind).sdStrokeWidth);
        const sdswBaseVal = Number.isFinite(sdswBase) ? sdswBase : 0;
        const sdswVal = Math.max(0, Math.min(40,
          Number(bspKindEffective(id, 'sdStrokeWidth', modeKind, { sdStrokeWidth: sdswBaseVal })) || 0));
        const sdswSlider = bspSdeSlider(sdswVal, 0, 40, (val) => {
          const v = Math.max(0, Math.min(40, Number(val) || 0));
          bspScreenDesignApply(id, { ['sdStrokeWidth__' + modeKind]: v },
            { base: { ['sdStrokeWidth__' + modeKind]: sdswBaseVal }, rerender: false });
        }, { step: 1, unit: 'px', fallback: 0 });
        body.appendChild(bspSdeField(t('sde_sd_stroke'), sdswSlider));

        const sdscBase = bspScreenDesignBaseForKind(modeKind).sdStrokeColor || '#FFD24AFF';
        const sdscVal = bspKindEffective(id, 'sdStrokeColor', modeKind, { sdStrokeColor: sdscBase }) || sdscBase;
        const sdscCtl = bspSdeColorA(sdscVal, '#FFD24AFF', (v) => {
          bspScreenDesignApply(id, { ['sdStrokeColor__' + modeKind]: v },
            { base: { ['sdStrokeColor__' + modeKind]: sdscBase }, rerender: false });
        }, { title: t('sde_sd_stroke_color') });
        body.appendChild(bspSdeField(t('sde_sd_stroke_color'), sdscCtl));
      }

      // ── Lines ── On the LIVE output this IS the footer's line control: the buttons call
      // the very same setLines() the footer #line-picker uses, and read the same global
      // linesPerPage — so the two are one instance, maximally synced (setLines updates the
      // footer picker AND, via its modal-refresh, this panel). On other screens it stays a
      // per-output override.
      const linesIsLive = (id === BSP_DEFAULT_OUTPUT_ID);
      const lines = linesIsLive
        ? Math.max(1, Math.min(6, Number(typeof linesPerPage !== 'undefined' ? linesPerPage : 1) || 1))
        : Math.max(1, Math.min(6, Number(bspScreenEffective(id, 'linesPerPage', base)) || 1));
      const linesSeg = document.createElement('div');
      linesSeg.className = 'bsp-sde-seg-group';
      for (let i = 1; i <= 6; i++) {
        linesSeg.appendChild(bspSegButton(String(i), lines === i, () => {
          if (linesIsLive && typeof setLines === 'function') setLines(i); // same function as the footer
          else bspScreenDesignApply(id, { linesPerPage: i });
        }));
      }
      body.appendChild(bspSdeField(t('sde_lines'), linesSeg));

      // Content kind resolved from the top-level selector (rendered at the top of the panel).
      // Bible verses and songs each get their own background AND text formatting on this output.
      const tk = (bspTextEditKind === 'songs') ? 'songs' : 'bible';
      const kindBase = bspScreenDesignBaseForKind(tk);

      // Helpers scoped to the selected kind. Suffixed keys (bgColor__bible…) are resolved
      // at build time; plain per-kind keys (ltFontBible, verseShadow*) are stored as-is.
      // Both diff against this kind's own inherited value.
      const applyKindPatch = (patch, o) => {
        const suff = {}, baseMap = {};
        Object.keys(patch).forEach((k) => {
          suff[k + '__' + tk] = patch[k];
          baseMap[k + '__' + tk] = kindBase[k];
        });
        bspScreenDesignApply(id, suff, { ...(o || {}), base: baseMap });
      };
      const readSuffixed = (baseKey) => bspKindEffective(id, baseKey, tk, kindBase);
      const applySuffixed = (baseKey, v, o) => applyKindPatch({ [baseKey]: v }, o);
      const readPlain = (storageKey) => {
        const ov = bspGetOutputDesign(id) || {};
        return ov[storageKey] != null ? ov[storageKey] : kindBase[storageKey];
      };
      const applyPlain = (storageKey, v, o) => bspScreenDesignApply(id,
        { [storageKey]: v }, { ...(o || {}), base: { [storageKey]: kindBase[storageKey] } });

      body.appendChild(bspSdeSection(t('sde_section_background')));

      // ── Background enable (per kind) ──
      const bgOn = !!readSuffixed('bgToggle');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'bsp-sde-toggle' + (bgOn ? ' is-on' : '');
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', bgOn ? 'true' : 'false');
      toggle.textContent = bgOn ? t('sde_on') : t('sde_off');
      toggle.addEventListener('click', () => applySuffixed('bgToggle', !bgOn));
      body.appendChild(bspSdeField(t('sde_bg'), toggle));

      // ── Background type (per kind) ──
      const effBgType = readSuffixed('bgType') || 'color';
      const effType = effBgType === 'image' ? 'image'
        : effBgType === 'video' ? 'video'
        : ((readSuffixed('bgMode') || 'solid') === 'gradient' ? 'gradient' : 'color');
      const typeSeg = document.createElement('div');
      typeSeg.className = 'bsp-sde-seg-group bsp-sde-seg-group--wrap';
      const setType = (kind) => {
        if (kind === 'color') applyKindPatch({ bgType: 'color', bgMode: 'solid' });
        else if (kind === 'gradient') applyKindPatch({ bgType: 'color', bgMode: 'gradient' });
        else if (kind === 'image') applyKindPatch({ bgType: 'image' });
        else if (kind === 'video') applyKindPatch({ bgType: 'video' });
      };
      typeSeg.appendChild(bspSegButton(t('sde_type_color'), effType === 'color', () => setType('color')));
      typeSeg.appendChild(bspSegButton(t('sde_type_gradient'), effType === 'gradient', () => setType('gradient')));
      typeSeg.appendChild(bspSegButton(t('sde_type_image'), effType === 'image', () => setType('image')));
      typeSeg.appendChild(bspSegButton(t('sde_type_video'), effType === 'video', () => setType('video')));
      body.appendChild(bspSdeField(t('sde_bg_type'), typeSeg));

      // ── Background value (depends on type, per kind) ──
      const valueWrap = document.createElement('div');
      valueWrap.className = 'bsp-sde-bg-value';
      if (effType === 'color') {
        valueWrap.appendChild(bspSdeColorA(readSuffixed('bgColor'), '#111CB0',
          (v, o) => applySuffixed('bgColor', v, o), { alpha: false, title: t('sde_bg_value') }));
      } else if (effType === 'gradient') {
        valueWrap.appendChild(bspSdeColor(readSuffixed('bgGradientShadow'), '#AD0000',
          (v, o) => applySuffixed('bgGradientShadow', v, o), t('sde_gradient_from')));
        valueWrap.appendChild(bspSdeColor(readSuffixed('bgGradientHighlight'), '#000000',
          (v, o) => applySuffixed('bgGradientHighlight', v, o), t('sde_gradient_to')));
      } else if (effType === 'image' || effType === 'video') {
        const isVideo = effType === 'video';
        const urlKey = isVideo ? 'bgVideoUrl' : 'bgImageUrl';
        const srcKey = isVideo ? 'bgVideoSource' : 'bgImageSource';
        valueWrap.appendChild(bspMediaPickerControl(isVideo, readSuffixed(urlKey),
          (patch) => applyKindPatch(patch), urlKey, srcKey));
      }
      if (valueWrap.children.length) body.appendChild(bspSdeField(t('sde_bg_value'), valueWrap));

      // ══ TEXT (formatted separately for Bible verses and songs) ══
      body.appendChild(bspSdeSection(t('sde_section_text')));

      // ── Font family ──
      const fontOptions = (typeof bspAllFontOptions === 'function') ? bspAllFontOptions() : [];
      const fontRow = document.createElement('div');
      fontRow.className = 'bsp-sde-font-row';
      fontRow.appendChild(bspSdeSelect(fontOptions, readSuffixed('fontFamily') || '',
        (v, o) => applySuffixed('fontFamily', v, o)));
      const sysBtn = document.createElement('button');
      sysBtn.type = 'button';
      sysBtn.className = 'bsp-sde-sysfonts';
      sysBtn.textContent = (typeof bspSystemFonts !== 'undefined' && bspSystemFonts.length)
        ? t('sde_system_fonts_reload') : t('sde_system_fonts');
      sysBtn.title = t('sde_system_fonts_hint');
      if (typeof bspSystemFontsSupported === 'function' && !bspSystemFontsSupported()) {
        sysBtn.disabled = true;
        sysBtn.title = t('fonts_system_unsupported');
      }
      sysBtn.addEventListener('click', () => { if (typeof bspLoadSystemFonts === 'function') bspLoadSystemFonts(); });
      fontRow.appendChild(sysBtn);
      body.appendChild(bspSdeField(t('sde_font'), fontRow));

      // ── Weight ──
      body.appendChild(bspSdeField(t('sde_weight'), bspSdeSelect([
        { value: '400', label: t('sde_weight_regular') },
        { value: '500', label: t('sde_weight_medium') },
        { value: '600', label: t('sde_weight_semibold') },
        { value: '700', label: t('sde_weight_bold') },
        { value: '800', label: t('sde_weight_extrabold') },
        { value: '900', label: t('sde_weight_black') }
      ], String(readSuffixed('fontWeight') || '700'), (v, o) => applySuffixed('fontWeight', v, o))));

      // ── Size ── (LT uses the pre-existing per-kind key; FS uses a suffixed one)
      if (mode === '16-9') {
        const ltSizeKey = tk === 'bible' ? 'ltFontBible' : 'ltFontSongs';
        body.appendChild(bspSdeField(t('sde_size'),
          bspSdeNumber(readPlain(ltSizeKey), 8, 400, (v, o) => applyPlain(ltSizeKey, v, o))));
      } else {
        body.appendChild(bspSdeField(t('sde_size'),
          bspSdeNumber(readSuffixed('fontSizeFull'), 8, 400, (v, o) => applySuffixed('fontSizeFull', v, o))));
      }

      // ── Case ──
      const caseBaseKey = mode === '16-9' ? 'ltTextTransform' : 'fullTextTransform';
      const tVal = readSuffixed(caseBaseKey) || 'uppercase';
      const tSeg = document.createElement('div');
      tSeg.className = 'bsp-sde-seg-group';
      [['none', '—', t('sde_tf_none')], ['uppercase', 'AA', t('sde_tf_upper')],
       ['lowercase', 'aa', t('sde_tf_lower')], ['capitalize', 'Aa', t('sde_tf_cap')]].forEach(([val, lbl, title]) => {
        tSeg.appendChild(bspSegButton(lbl, tVal === val, () => applySuffixed(caseBaseKey, val), title));
      });
      body.appendChild(bspSdeField(t('sde_transform'), tSeg));

      // ── Text color ──
      body.appendChild(bspSdeField(t('sde_color'),
        bspSdeColorA(readSuffixed('textColor'), '#ffffff', (v, o) => applySuffixed('textColor', v, o), { title: t('sde_color') })));

      // ── Line spacing (interligne) ── per kind, mode-specific key (the display reads
      // lineHeightFull in FS, lineHeightLT in LT). Step 0.05 for fine control.
      const lhKey = (mode === '16-9') ? 'lineHeightLT' : 'lineHeightFull';
      body.appendChild(bspSdeField(t('sde_line_height'),
        bspSdeNumber(Number(readSuffixed(lhKey)) || 1.1, 0.5, 3, (v, o) => applySuffixed(lhKey, v, o), 0.05)));

      // ── Letter spacing ── per kind, applied on the text container display-side.
      body.appendChild(bspSdeField(t('sde_letter_spacing'),
        bspSdeNumber(Number(readSuffixed('letterSpacing')) || 0, -20, 60, (v, o) => applySuffixed('letterSpacing', v, o), 0.5)));

      // ── Drop shadow (per kind, plain verse*/song* keys) ──
      const shEnabledKey = tk === 'bible' ? 'verseShadowEnabled' : 'songShadowEnabled';
      const shColorKey = tk === 'bible' ? 'verseShadowColor' : 'songShadowColor';
      const shBlurKey = tk === 'bible' ? 'verseShadowBlur' : 'songShadowBlur';
      const shXKey = tk === 'bible' ? 'verseShadowOffsetX' : 'songShadowOffsetX';
      const shYKey = tk === 'bible' ? 'verseShadowOffsetY' : 'songShadowOffsetY';
      const shOn = !!readPlain(shEnabledKey);
      body.appendChild(bspSdeField(t('sde_shadow'),
        bspSdeToggle(shOn, () => applyPlain(shEnabledKey, !shOn))));
      if (shOn) {
        const shWrap = document.createElement('div');
        shWrap.className = 'bsp-sde-bg-value';
        shWrap.appendChild(bspSdeColor(readPlain(shColorKey) || '#000000', '#000000',
          (v, o) => applyPlain(shColorKey, v, o), t('sde_shadow_color')));
        const blur = bspSdeNumber(readPlain(shBlurKey), 0, 80, (v, o) => applyPlain(shBlurKey, v, o));
        blur.title = t('sde_shadow_blur'); blur.style.width = '54px';
        shWrap.appendChild(blur);
        const sx = bspSdeNumber(readPlain(shXKey), -40, 40, (v, o) => applyPlain(shXKey, v, o));
        sx.title = t('sde_shadow_x'); sx.style.width = '48px';
        shWrap.appendChild(sx);
        const sy = bspSdeNumber(readPlain(shYKey), -40, 40, (v, o) => applyPlain(shYKey, v, o));
        sy.title = t('sde_shadow_y'); sy.style.width = '48px';
        shWrap.appendChild(sy);
        body.appendChild(bspSdeField(t('sde_shadow_style'), shWrap));

        // ── Shadow opacity (per kind) ── 0–100 %
        const shOpacityKey = tk === 'bible' ? 'verseShadowOpacity' : 'songShadowOpacity';
        const shOpVal = readPlain(shOpacityKey);
        body.appendChild(bspSdeField(t('sde_shadow_opacity'),
          bspSdeSlider(Math.round(((shOpVal == null ? 0.85 : Number(shOpVal))) * 100), 0, 100,
            (v, o) => applyPlain(shOpacityKey, Math.max(0, Math.min(1, v / 100)), o), { unit: '%', fallback: 85 })));
      }

      // ── Progressive contour (per kind) ── soft outline around the content text, size + colour.
      const ctEnabledKey = tk === 'bible' ? 'verseContourEnabled' : 'songContourEnabled';
      const ctColorKey = tk === 'bible' ? 'verseContourColor' : 'songContourColor';
      const ctSizeKey = tk === 'bible' ? 'verseContourSize' : 'songContourSize';
      const ctOn = !!readPlain(ctEnabledKey);
      body.appendChild(bspSdeField(t('sde_contour'),
        bspSdeToggle(ctOn, () => applyPlain(ctEnabledKey, !ctOn))));
      if (ctOn) {
        body.appendChild(bspSdeField(t('sde_contour_size'),
          bspSdeSlider(Number(readPlain(ctSizeKey)) || 0, 0, 20,
            (v, o) => applyPlain(ctSizeKey, v, o), { unit: 'px', fallback: 4 })));
        body.appendChild(bspSdeField(t('sde_contour_color'),
          bspSdeColorA(readPlain(ctColorKey) || '#000000FF', '#000000FF',
            (v) => applyPlain(ctColorKey, v, { rerender: false }), { title: t('sde_contour_color') })));
      }

      // ── Simple stroke (per kind) ── crisp text outline, size + colour.
      const stEnabledKey = tk === 'bible' ? 'verseStrokeEnabled' : 'songStrokeEnabled';
      const stColorKey = tk === 'bible' ? 'verseStrokeColor' : 'songStrokeColor';
      const stSizeKey = tk === 'bible' ? 'verseStrokeSize' : 'songStrokeSize';
      const stOn = !!readPlain(stEnabledKey);
      body.appendChild(bspSdeField(t('sde_stroke'),
        bspSdeToggle(stOn, () => applyPlain(stEnabledKey, !stOn))));
      if (stOn) {
        body.appendChild(bspSdeField(t('sde_stroke_size'),
          bspSdeSlider(Number(readPlain(stSizeKey)) || 0, 0, 20,
            (v, o) => applyPlain(stSizeKey, v, o), { unit: 'px', fallback: 2 })));
        body.appendChild(bspSdeField(t('sde_stroke_color'),
          bspSdeColorA(readPlain(stColorKey) || '#000000FF', '#000000FF',
            (v) => applyPlain(stColorKey, v, { rerender: false }), { title: t('sde_stroke_color') })));
      }

      // ══ ALIGNMENT ══
      body.appendChild(bspSdeSection(t('sde_section_align')));

      const hKey = bspHAlignKey(mode, kind);
      const hVal = bspScreenEffective(id, hKey, base) || 'center';
      const hSeg = document.createElement('div');
      hSeg.className = 'bsp-sde-seg-group';
      [['left', '⇤', t('sde_align_left')], ['center', '↔', t('sde_align_center')],
       ['right', '⇥', t('sde_align_right')]].forEach(([val, lbl, title]) => {
        hSeg.appendChild(bspSegButton(lbl, hVal === val, () => bspScreenDesignApply(id, { [hKey]: val }), title));
      });
      body.appendChild(bspSdeField(t('sde_align_h'), hSeg));

      const vKey = bspVAlignKey(mode, kind);
      const vVal = bspScreenEffective(id, vKey, base) || 'middle';
      const vSeg = document.createElement('div');
      vSeg.className = 'bsp-sde-seg-group';
      [['top', '⤒', t('sde_align_top')], ['middle', '↕', t('sde_align_middle')],
       ['bottom', '⤓', t('sde_align_bottom')]].forEach(([val, lbl, title]) => {
        vSeg.appendChild(bspSegButton(lbl, vVal === val, () => bspScreenDesignApply(id, { [vKey]: val }), title));
      });
      body.appendChild(bspSdeField(t('sde_align_v'), vSeg));

      // ══ PADDING (of the box the current mode uses) ══
      body.appendChild(bspSdeSection(t('sde_section_padding')));

      const pk = bspPadKeys(mode);
      const linked = bspScreenEffective(id, 'padLinked', base) !== false;
      body.appendChild(bspSdeField(t('sde_pad_linked'),
        bspSdeToggle(linked, () => bspScreenDesignApply(id, { padLinked: !linked }))));

      if (linked) {
        // One value drives all four sides.
        const cur = Number(bspScreenEffective(id, pk.t, base)) || 0;
        body.appendChild(bspSdeField(t('sde_pad_all'),
          bspSdeNumber(cur, 0, 600, (v, o) => bspScreenDesignApply(id,
            { [pk.t]: v, [pk.r]: v, [pk.b]: v, [pk.l]: v }, o))));
      } else {
        const row = document.createElement('div');
        row.className = 'bsp-sde-bg-value';
        [['t', t('sde_pad_top')], ['r', t('sde_pad_right')],
         ['b', t('sde_pad_bottom')], ['l', t('sde_pad_left')]].forEach(([side, title]) => {
          const inp = bspSdeNumber(Number(bspScreenEffective(id, pk[side], base)) || 0, 0, 600,
            (v, o) => bspScreenDesignApply(id, { [pk[side]]: v }, o));
          inp.title = title;
          inp.style.width = '58px';
          row.appendChild(inp);
        });
        body.appendChild(bspSdeField(t('sde_pad_sides'), row));
      }

      // ══ REFERENCE (Bible only) ══
      // Songs have no reference badge, so this whole section is Bible-only.
      if (kind === 'bible') {
        body.appendChild(bspSdeSection(t('sde_section_reference')));

        const refSizeKey = bspRefSizeKey(mode);
        body.appendChild(bspSdeField(t('sde_ref_size'),
          bspSdeNumber(bspScreenEffective(id, refSizeKey, base) || 32, 8, 200,
            (v, o) => bspScreenDesignApply(id, { [refSizeKey]: v }, o))));

        body.appendChild(bspSdeField(t('sde_ref_color'),
          bspSdeColorA(bspScreenEffective(id, 'refColor', base), '#ffffff',
            (v, o) => bspScreenDesignApply(id, { refColor: v }, o), { title: t('sde_ref_color') })));

        // ── Reference case (uppercase / lowercase / capitalize) ── existing per-mode keys,
        // already honoured by buildFullBibleSegment / buildLtBibleSegment.
        const refTfKey = (mode === '16-9') ? 'ltRefTextTransform' : 'fullRefTextTransform';
        const refTfVal = bspScreenEffective(id, refTfKey, base) || 'uppercase';
        const refTfSeg = document.createElement('div');
        refTfSeg.className = 'bsp-sde-seg-group';
        [['none', '—', t('sde_tf_none')], ['uppercase', 'AA', t('sde_tf_upper')],
         ['lowercase', 'aa', t('sde_tf_lower')], ['capitalize', 'Aa', t('sde_tf_cap')]].forEach(([val, lbl, title]) => {
          refTfSeg.appendChild(bspSegButton(lbl, refTfVal === val, () => bspScreenDesignApply(id, { [refTfKey]: val }), title));
        });
        body.appendChild(bspSdeField(t('sde_ref_transform'), refTfSeg));

        // ── Reference bold / italic ── refBold defaults on (matches the historic 800 weight).
        const refBoldOn = bspScreenEffective(id, 'refBold', base) !== false;
        const refItalicOn = !!bspScreenEffective(id, 'refItalic', base);
        const refBiSeg = document.createElement('div');
        refBiSeg.className = 'bsp-sde-seg-group';
        refBiSeg.appendChild(bspSegButton('B', refBoldOn, () => bspScreenDesignApply(id, { refBold: !refBoldOn }), t('sde_ref_bold')));
        refBiSeg.appendChild(bspSegButton('I', refItalicOn, () => bspScreenDesignApply(id, { refItalic: !refItalicOn }), t('sde_ref_italic')));
        body.appendChild(bspSdeField(t('sde_ref_style'), refBiSeg));

        // ── Reference alignment ── FS uses its own hAlignFullRef; in LT the reference line
        // follows the bible text alignment, so the control is shown for FS only.
        if (mode !== '16-9') {
          const refAlignVal = bspScreenEffective(id, 'hAlignFullRef', base) || 'center';
          const refAlignSeg = document.createElement('div');
          refAlignSeg.className = 'bsp-sde-seg-group';
          [['left', '⇤', t('sde_align_left')], ['center', '↔', t('sde_align_center')],
           ['right', '⇥', t('sde_align_right')]].forEach(([val, lbl, title]) => {
            refAlignSeg.appendChild(bspSegButton(lbl, refAlignVal === val, () => bspScreenDesignApply(id, { hAlignFullRef: val }), title));
          });
          body.appendChild(bspSdeField(t('sde_ref_align'), refAlignSeg));
        }

        // Box on/off — off gives a bare reference with no filled background.
        const boxOn = bspScreenEffective(id, 'refBgEnabled', base) !== false;
        body.appendChild(bspSdeField(t('sde_ref_box'),
          bspSdeToggle(boxOn, () => bspScreenDesignApply(id, { refBgEnabled: !boxOn }))));

        if (boxOn) {
          body.appendChild(bspSdeField(t('sde_ref_bg_color'),
            bspSdeColorA(bspScreenEffective(id, 'refBgColor', base), '#FFD500',
              (v, o) => bspScreenDesignApply(id, { refBgColor: v }, o), { title: t('sde_ref_bg_color') })));

          body.appendChild(bspSdeField(t('sde_ref_radius'),
            bspSdeSlider(bspScreenEffective(id, 'refBorderRadius', base) ?? 12, 0, 120,
              (v, o) => bspScreenDesignApply(id, { refBorderRadius: v }, o), { unit: 'px', fallback: 12 })));

          // ── Reference border: stroke (px) + colour with opacity ──
          body.appendChild(bspSdeField(t('sde_ref_border'),
            bspSdeSlider(bspScreenEffective(id, 'refBorderWidth', base) ?? 0, 0, 20,
              (v, o) => bspScreenDesignApply(id, { refBorderWidth: v }, o), { unit: 'px', fallback: 0 })));

          body.appendChild(bspSdeField(t('sde_ref_border_color'),
            bspSdeColorA(bspScreenEffective(id, 'refBorderColor', base) || '#FFFFFF', '#FFFFFF',
              (v, o) => bspScreenDesignApply(id, { refBorderColor: v }, o), { title: t('sde_ref_border_color') })));
        }

        // Underline the reference text — usable with or without the box.
        const ulOn = !!bspScreenEffective(id, 'refUnderlineEnabled', base);
        body.appendChild(bspSdeField(t('sde_ref_underline'),
          bspSdeToggle(ulOn, () => bspScreenDesignApply(id, { refUnderlineEnabled: !ulOn }))));

        if (ulOn) {
          const ulWrap = document.createElement('div');
          ulWrap.className = 'bsp-sde-bg-value';
          ulWrap.appendChild(bspSdeColor(bspScreenEffective(id, 'refUnderlineColor', base), '#FFD500',
            (v, o) => bspScreenDesignApply(id, { refUnderlineColor: v }, o), t('sde_line_color')));
          ulWrap.appendChild(bspSdeNumber(bspScreenEffective(id, 'refUnderlineThickness', base) ?? 3, 0, 40,
            (v, o) => bspScreenDesignApply(id, { refUnderlineThickness: v }, o)));
          body.appendChild(bspSdeField(t('sde_line_style'), ulWrap));
        }

        // ── Progressive contour on the reference (soft outline), size + colour. ──
        const rcOn = !!bspScreenEffective(id, 'refContourEnabled', base);
        body.appendChild(bspSdeField(t('sde_ref_contour'),
          bspSdeToggle(rcOn, () => bspScreenDesignApply(id, { refContourEnabled: !rcOn }))));
        if (rcOn) {
          body.appendChild(bspSdeField(t('sde_contour_size'),
            bspSdeSlider(Number(bspScreenEffective(id, 'refContourSize', base)) || 0, 0, 20,
              (v, o) => bspScreenDesignApply(id, { refContourSize: v }, o), { unit: 'px', fallback: 3 })));
          body.appendChild(bspSdeField(t('sde_contour_color'),
            bspSdeColorA(bspScreenEffective(id, 'refContourColor', base) || '#000000FF', '#000000FF',
              (v) => bspScreenDesignApply(id, { refContourColor: v }, { rerender: false }), { title: t('sde_contour_color') })));
        }

        // ── Simple stroke on the reference (crisp outline), size + colour. ──
        const rsOn = !!bspScreenEffective(id, 'refStrokeEnabled', base);
        body.appendChild(bspSdeField(t('sde_ref_stroke'),
          bspSdeToggle(rsOn, () => bspScreenDesignApply(id, { refStrokeEnabled: !rsOn }))));
        if (rsOn) {
          body.appendChild(bspSdeField(t('sde_stroke_size'),
            bspSdeSlider(Number(bspScreenEffective(id, 'refStrokeSize', base)) || 0, 0, 20,
              (v, o) => bspScreenDesignApply(id, { refStrokeSize: v }, o), { unit: 'px', fallback: 2 })));
          body.appendChild(bspSdeField(t('sde_stroke_color'),
            bspSdeColorA(bspScreenEffective(id, 'refStrokeColor', base) || '#000000FF', '#000000FF',
              (v) => bspScreenDesignApply(id, { refStrokeColor: v }, { rerender: false }), { title: t('sde_stroke_color') })));
        }
      }

      // ══ LT BOX (both Bible and songs, only meaningful in lower-third mode) ══
      if (mode === '16-9') {
        body.appendChild(bspSdeSection(t('sde_section_ltbox')));

        body.appendChild(bspSdeField(t('sde_lt_radius'),
          bspSdeSlider(bspScreenEffective(id, 'ltBorderRadius', base) ?? 0, 0, 120,
            (v, o) => bspScreenDesignApply(id, { ltBorderRadius: v }, o), { unit: 'px', fallback: 0 })));

        const barOn = !!bspScreenEffective(id, 'ltBoxUnderlineEnabled', base);
        body.appendChild(bspSdeField(t('sde_lt_accent'),
          bspSdeToggle(barOn, () => bspScreenDesignApply(id, { ltBoxUnderlineEnabled: !barOn }))));

        if (barOn) {
          const barWrap = document.createElement('div');
          barWrap.className = 'bsp-sde-bg-value';
          barWrap.appendChild(bspSdeColor(bspScreenEffective(id, 'ltBoxUnderlineColor', base), '#FFD500',
            (v, o) => bspScreenDesignApply(id, { ltBoxUnderlineColor: v }, o), t('sde_line_color')));
          barWrap.appendChild(bspSdeNumber(bspScreenEffective(id, 'ltBoxUnderlineThickness', base) ?? 4, 0, 40,
            (v, o) => bspScreenDesignApply(id, { ltBoxUnderlineThickness: v }, o)));
          body.appendChild(bspSdeField(t('sde_line_style'), barWrap));
        }
      }
    }

    // Kept for the Screens bar, which re-renders chips when live state changes.
    function bspUpdateScreenDesignBanner() {
      bspRenderScreenDesignPanel();
    }

    function bspInitScreenDesignEditor() {
      bspRenderScreenDesignPanel();
    }
