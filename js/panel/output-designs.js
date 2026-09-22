    // ===== PER-OUTPUT DESIGNS =====
    // Each output (the OBS browser source, plus every projection screen) can carry its
    // own full design. A design is a PROJECTION_SETTINGS_PROFILE_KEYS-shaped profile —
    // the same ~70-key container the panel already uses for its per-tab settings
    // profiles — so "full design per screen" needs no parallel schema.
    //
    // How an override is made to stick while a payload is built:
    //   1. bspDesignProfileOverride is consulted by getProjectionSettingsSnapshotForTab(),
    //      which captureLiveRenderUiSnapshot() and getEffectiveLiveBackgroundState() read
    //      BEFORE falling back to the DOM. That covers every field those two expose.
    //   2. applyProjectionRuntimeSnapshot() swaps the runtime globals that
    //      buildLivePayload() reads directly (ltFontSongs, activeRatio, fullHAlign, ...).
    //      It touches globals only — no DOM — so nothing flickers and the swap is
    //      synchronous, with no chance of interleaving.
    // Together they cover the whole profile.

    const BSP_DEFAULT_OUTPUT_ID = 'obs';

    // outputId -> partial profile (only the keys that differ from the live design).
    let bspOutputDesigns = {};

    const BSP_OUTPUT_DESIGNS_STORAGE_KEY = 'bsp-output-designs-v1';

    function bspOutputDesignsPersist() {
      try {
        localStorage.setItem(BSP_OUTPUT_DESIGNS_STORAGE_KEY, JSON.stringify(bspOutputDesigns));
      } catch (_) {}
    }

    function bspOutputDesignsRestore() {
      try {
        const raw = localStorage.getItem(BSP_OUTPUT_DESIGNS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        bspOutputDesigns = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
      } catch (_) {
        bspOutputDesigns = {};
      }
    }

    function bspGetOutputDesign(outputId) {
      const design = bspOutputDesigns[outputId];
      return (design && typeof design === 'object') ? design : null;
    }

    function bspSetOutputDesign(outputId, partialProfile) {
      // 'obs' (the live output) is allowed its own override now — it is a selectable
      // output with its own design, like any screen.
      if (!outputId) return;
      if (!partialProfile || !Object.keys(partialProfile).length) {
        delete bspOutputDesigns[outputId];
      } else {
        bspOutputDesigns[outputId] = { ...(bspOutputDesigns[outputId] || {}), ...partialProfile };
      }
      bspOutputDesignsPersist();
      if (typeof isLive !== 'undefined' && isLive && typeof livePointer !== 'undefined' && livePointer) {
        scheduleLiveUpdate();
      }
    }

    function bspClearOutputDesign(outputId) {
      if (!bspOutputDesigns[outputId]) return;
      delete bspOutputDesigns[outputId];
      bspOutputDesignsPersist();
      if (typeof isLive !== 'undefined' && isLive && livePointer) scheduleLiveUpdate();
    }

    // Drives the LIVE ('obs') output's FS/LT so the projection actually switches. The flat
    // live payload's mode is `liveRatio || activeRatio`, and ONLY setRatio() moves those —
    // and only while the sidebar shows the on-air kind. Writing an activeRatio__<kind>
    // override on 'obs' alone (which is what the zone/modal do) does NOT change liveRatio,
    // so without this the live output never switched. Called by BOTH the Mode/screen zone
    // and the Edit Design modal so they behave identically on the live output.
    function bspDriveObsLiveMode(kind, mode) {
      const r = (mode === '16-9' || mode === 'sd-left' || mode === 'sd-right') ? mode : 'full';
      const panelKind = (typeof getCurrentPanelContentKind === 'function') ? getCurrentPanelContentKind() : null;
      if (panelKind === kind && typeof setRatio === 'function') {
        setRatio(r); // full side effects + liveRatio (when the on-air kind is this one)
        return;
      }
      // Sidebar is on the other kind: still move the live mode if THIS kind is on air.
      if (typeof isLive !== 'undefined' && isLive && typeof livePointer !== 'undefined' &&
          livePointer && livePointer.kind === kind) {
        liveRatio = r;
        if (typeof scheduleLiveUpdate === 'function') scheduleLiveUpdate();
      }
    }

    // Replaces a screen's whole override at once. Unlike bspSetOutputDesign (which only
    // merges), this can DROP a key: the per-screen panel needs that so a control set back
    // to the inherited value stops overriding and re-follows the base design.
    function bspReplaceOutputDesign(outputId, override) {
      if (!outputId) return; // 'obs' allowed — see bspSetOutputDesign
      const clean = {};
      Object.keys(override || {}).forEach((k) => {
        if (override[k] != null) clean[k] = override[k];
      });
      if (Object.keys(clean).length) bspOutputDesigns[outputId] = clean;
      else delete bspOutputDesigns[outputId];
      bspOutputDesignsPersist();
      if (typeof isLive !== 'undefined' && isLive && typeof livePointer !== 'undefined' && livePointer) {
        scheduleLiveUpdate();
      }
    }

    // Outputs that need their own rendering pass: only those with a design of their own.
    // An output with no override renders identically to the default, so it reads the
    // flat/default payload and costs nothing. 'obs' is always eligible when it carries an
    // override — its designs['obs'] entry then overwrites the flat base for the OBS
    // browser source, which reads outputId 'obs'.
    function bspGetDesignedOutputs() {
      const ids = Object.keys(bspOutputDesigns);
      if (!ids.length) return [];
      const live = (typeof bspScreensAdded !== 'undefined' && Array.isArray(bspScreensAdded))
        ? bspScreensAdded.map(s => s.id)
        : [];
      return ids
        .filter(id => id === BSP_DEFAULT_OUTPUT_ID || live.includes(id))
        .map(id => ({ id, profile: bspOutputDesigns[id] }));
    }

    // ===== FREEZE =====
    // A frozen output keeps showing exactly what it showed when it was frozen, while every
    // other output carries on. Implemented by replaying that output's last sent payload
    // instead of a freshly built one — the display needs no special case, and the operator
    // can retune a design or line up the next slide without it appearing on that screen.
    let bspFrozenOutputs = {};   // outputId -> frozen payload snapshot
    let bspLastSentDesigns = {}; // outputId -> last payload actually sent

    function bspIsOutputFrozen(outputId) {
      return !!(outputId && bspFrozenOutputs[outputId]);
    }

    function bspToggleOutputFreeze(outputId) {
      if (!outputId) return false;
      if (bspFrozenOutputs[outputId]) {
        delete bspFrozenOutputs[outputId];
        // Let it catch up with whatever is live now.
        if (typeof isLive !== 'undefined' && isLive && typeof livePointer !== 'undefined' && livePointer &&
            typeof scheduleLiveUpdate === 'function') {
          scheduleLiveUpdate();
        }
        return false;
      }
      // Freeze on the last payload this output actually received. Falling back to a fresh
      // build would freeze on what it is ABOUT to show, not what is on screen.
      const snapshot = bspLastSentDesigns[outputId];
      if (!snapshot) return false;
      bspFrozenOutputs[outputId] = JSON.parse(JSON.stringify(snapshot));
      return true;
    }

    function bspClearAllFreezes() {
      bspFrozenOutputs = {};
    }

    // Text-formatting keys that can differ between Bible verses and songs on the same
    // output. The design panel stores them suffixed (`textColor__bible`, `textColor__songs`);
    // this resolves the pair to the plain key for whichever content is live, so the rest
    // of the pipeline (which reads plain keys) needs no per-kind awareness.
    const BSP_KIND_SPLIT_KEYS = [
      'fontFamily', 'fontWeight', 'fontSizeFull', 'textColor', 'fullTextTransform', 'ltTextTransform',
      // Background is separable too: Bible and songs can carry different backgrounds on the
      // same output.
      'bgToggle', 'bgType', 'bgMode', 'bgColor', 'bgGradientShadow', 'bgGradientHighlight',
      'bgImageSource', 'bgImageUrl', 'bgVideoSource', 'bgVideoUrl',
      // Display MODE (FS vs LT) and line count, per kind: a screen can show Bible in FS and
      // songs in LT. Resolved to the live kind's value in bspBuildLivePayloadForProfile,
      // which then swaps liveRatio/liveLinesPerPage from these plain keys.
      'activeRatio', 'linesPerPage', 'sdWidth', 'sdMargin',
      'sdMarginTop', 'sdMarginRight', 'sdMarginBottom', 'sdMarginLeft',
      'sdSlant', 'sdStrokeWidth', 'sdStrokeColor',
      // Line spacing (interligne) and letter spacing, per kind: Bible verses and songs can
      // read at different densities on the same output.
      'lineHeightFull', 'lineHeightLT', 'letterSpacing'
    ];

    function bspResolveKindKeys(profile) {
      const kind = (typeof livePointer !== 'undefined' && livePointer && livePointer.kind === 'bible') ? 'bible' : 'songs';
      const out = { ...profile };
      BSP_KIND_SPLIT_KEYS.forEach((base) => {
        const v = out[base + '__' + kind];
        if (v != null) out[base] = v;
        // Strip the suffixed variants: normalize() would drop them anyway (not in the
        // fixed key list), but removing them keeps the merged profile clean.
        delete out[base + '__bible'];
        delete out[base + '__songs'];
      });
      return out;
    }

    // Builds a payload with `profileOverride` in force, then restores the previous
    // state. The restore runs in a finally block: if the build throws, the panel must
    // not be left rendering with another screen's design.
    function bspBuildLivePayloadForProfile(profileOverride) {
      if (!profileOverride || !Object.keys(profileOverride).length) return buildLivePayload();

      const saved = captureProjectionSettingsSnapshot();
      const merged = normalizeProjectionSettingsSnapshot(bspResolveKindKeys(profileOverride), saved);

      // These three are locked in when the operator goes live and deliberately shadow
      // the settings profile — `effectiveLiveRatio = liveRatio || activeRatio` means
      // liveRatio always wins, so applyProjectionRuntimeSnapshot()'s activeRatio alone
      // would never change an output's FS/LT mode. They must be swapped by hand.
      const savedLive = {
        liveRatio,
        liveLinesPerPage,
        liveTextTransformState,
        liveBackgroundState
      };

      try {
        bspDesignProfileOverride = merged;
        applyProjectionRuntimeSnapshot(merged);
        if (merged.activeRatio) liveRatio = merged.activeRatio;
        if (merged.linesPerPage != null) liveLinesPerPage = Math.max(1, Number(merged.linesPerPage) || 1);
        liveTextTransformState = {
          full: merged.fullTextTransform || savedLive.liveTextTransformState?.full || 'uppercase',
          lt: merged.ltTextTransform || savedLive.liveTextTransformState?.lt || 'uppercase'
        };
        return buildLivePayload();
      } catch (err) {
        console.error('[BSP] per-output payload build failed', err);
        return null;
      } finally {
        bspDesignProfileOverride = null;
        applyProjectionRuntimeSnapshot(saved);
        liveRatio = savedLive.liveRatio;
        liveLinesPerPage = savedLive.liveLinesPerPage;
        liveTextTransformState = savedLive.liveTextTransformState;
        liveBackgroundState = savedLive.liveBackgroundState;
      }
    }
