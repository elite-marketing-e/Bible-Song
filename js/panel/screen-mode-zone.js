    // ===== SCREEN MODE ZONE (bottom bar) =====
    // Per-screen, per-kind FS/LT chooser living in the bottom control bar. It writes the
    // kind-suffixed mode keys (activeRatio__bible / activeRatio__songs) resolved at build
    // time, so one screen can show Bible in FS and songs in LT.
    //
    // Target = the output selected in the Screens bar (bspDesignTargetId); when none is
    // selected it edits the live/OBS output ('obs'), which is what the operator sees on
    // the main program feed. The base each choice diffs against is that KIND's settings
    // profile — so the zone stays in sync with the FS/LT configured in Settings.

    function bspSmzTargetId() {
      return (typeof bspDesignTargetId !== 'undefined' && bspDesignTargetId) ? bspDesignTargetId : 'obs';
    }

    function bspSmzKindMode(id, kind, kindBase) {
      // Effective FS/LT for this output+kind. Pour la sortie Live ('obs'), la SOURCE UNIQUE
      // est le profil de base (kindBase) — on ignore toute surcharge 'obs' de mode, sinon la
      // barre du bas et Settings divergent. Pour un écran, sa surcharge fait foi.
      if (id !== 'obs') {
        const ov = (typeof bspGetOutputDesign === 'function' && bspGetOutputDesign(id)) || {};
        if (ov['activeRatio__' + kind] != null) return ov['activeRatio__' + kind];
        if (ov.activeRatio != null) return ov.activeRatio;
      }
      return kindBase.activeRatio || 'full';
    }

    function bspRenderScreenModeZone() {
      const zone = document.getElementById('bsp-screen-mode-zone');
      if (!zone) return;
      const id = bspSmzTargetId();

      const label = document.getElementById('bsp-smz-target');
      if (label) {
        label.textContent = (typeof bspDesignTargetLabel === 'function')
          ? bspDesignTargetLabel(id)
          : (id === 'obs' ? 'Live' : id);
      }

      ['bible', 'songs'].forEach((kind) => {
        const kindBase = (typeof bspScreenDesignBaseForKind === 'function')
          ? bspScreenDesignBaseForKind(kind) : { activeRatio: 'full' };
        // Custom ratio has no button; treat it as FS for reflection. SD-G/SD-D reflect
        // their own buttons.
        const raw = bspSmzKindMode(id, kind, kindBase);
        const current = (raw === '16-9' || raw === 'sd-left' || raw === 'sd-right') ? raw : 'full';
        zone.querySelectorAll(`.bsp-smz-btn[data-kind="${kind}"]`).forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.mode === current);
        });
      });
    }

    function bspSetScreenKindMode(kind, mode) {
      // Source UNIQUE partagée avec le sélecteur des Settings : Live → profil de base,
      // écran → sa surcharge. Fini le double stockage qui faisait « conflit » entre les
      // deux sélecteurs. La fonction re-render les deux et pousse la mise à jour live.
      if (typeof bspApplyKindModeForOutput === 'function') {
        bspApplyKindModeForOutput(bspSmzTargetId(), kind, mode);
      }
    }

    function bspInitScreenModeZone() {
      const zone = document.getElementById('bsp-screen-mode-zone');
      if (!zone) return;
      zone.querySelectorAll('.bsp-smz-btn').forEach((btn) => {
        btn.addEventListener('click', () => bspSetScreenKindMode(btn.dataset.kind, btn.dataset.mode));
      });
      bspRenderScreenModeZone();
    }
