    // ===== SCREENS BAR =====
    // "Écrans" button next to Project Live: opens a popover listing the displays
    // connected to this PC. Picking one adds it as a chip beside the button; clicking
    // a chip selects it (which is what the per-output design editor will hang off);
    // the project icon on a selected chip starts projection on that display.
    //
    // Detection itself is not reimplemented here: refreshOutputScreenList() in
    // output-and-streaming.js already walks BSPDesktop.getDisplays() -> getScreenDetails()
    // -> current-screen fallback, and populates `outputScreenList`.
    //
    // Icons are inline SVG, matching the shapes of the Font Awesome equivalents.
    // Font Awesome is not bundled in this project (no reference anywhere) and the panel
    // must keep working offline from file://, so a CDN link is not an option.

    let bspScreensAdded = [];        // snapshots, so chips survive a detection blip
    let bspScreensSelectedId = '';
    // Outputs whose content is temporarily hidden (play/Stop): the connection stays open,
    // only the projected content is blanked. Transient (not persisted), like freeze.
    let bspScreensBlanked = {};      // outputId -> true
    let bspScreensPopoverOpen = false;
    let bspScreensDetecting = false;
    let bspScreensLastError = '';
    let bspScreensBound = false;
    let bspScreensProjectingId = '';

    const BSP_SCREENS_STORAGE_KEY = 'bsp-screens-added-v1';

    const BSP_SCREEN_ICONS = {
      // fa-display
      screens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      // fa-plus
      add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
      // fa-play (project)
      project: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"/></svg>',
      // fa-stop
      stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
      // fa-xmark
      remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      // fa-tower-broadcast (live)
      live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
      // fa-link (copy remote screen link)
      link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.08-7.08l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.08 7.08l1.71-1.71"/></svg>',
      // fa-globe (remote screen)
      remote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
      // fa-pen (rename)
      rename: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
    };

    function bspScreensEls() {
      return {
        root: document.getElementById('bsp-screens'),
        btn: document.getElementById('bsp-screens-btn'),
        chips: document.getElementById('bsp-screens-chips'),
        popover: document.getElementById('bsp-screens-popover'),
        list: document.getElementById('bsp-screens-list'),
        note: document.getElementById('bsp-screens-note')
      };
    }

    function bspScreensAvailable() {
      return Array.isArray(outputScreenList) ? outputScreenList : [];
    }

    function bspScreenSnapshot(screen) {
      return {
        id: String(screen.id),
        label: screen.label || 'Display',
        width: Number(screen.width) || 0,
        height: Number(screen.height) || 0,
        isPrimary: !!screen.isPrimary,
        isInternal: !!screen.isInternal,
        // A remote screen is a user-created output (not a physically detected display):
        // any device that opens its link becomes this screen, with its own design.
        isRemote: !!screen.isRemote
      };
    }

    // ── Remote screens ─────────────────────────────────────────────────────────
    // Next free remote_<n> id, so ids stay stable and never collide with the
    // positional screen_<n> ids that getScreenDetails() hands out.
    function bspScreensNextRemoteId() {
      let max = 0;
      bspScreensAdded.forEach((s) => {
        const m = /^remote_(\d+)$/.exec(s.id || '');
        if (m) max = Math.max(max, Number(m[1]));
      });
      return 'remote_' + (max + 1);
    }

    function bspScreensAddRemote() {
      if (bspScreensAdded.length >= 16) return; // sane ceiling
      const id = bspScreensNextRemoteId();
      const n = id.slice('remote_'.length);
      bspScreensAdded.push({
        id,
        label: t('screens_remote_default_name').replace('{n}', n),
        width: 0, height: 0, isPrimary: false, isInternal: false, isRemote: true
      });
      bspScreensPersist();
      bspScreensSelect(id);           // select it so its design can be edited at once
      bspScreensSetPopoverOpen(false);
      bspScreensRenderChips();
    }

    // Share link for a remote screen. Built from the CURRENT resolved server host, so a
    // network change is reflected automatically — the saved screen stores no IP. Matches
    // the panel's own scheme (https panel → https link).
    function bspScreensRemoteLink(id) {
      // Prefer the SERVER-reported LAN address (fresh, authoritative), then the relay host.
      const host = (typeof resolveShareUrlHost === 'function' && resolveShareUrlHost())
        || (typeof resolveRelayHost === 'function' && resolveRelayHost()) || '';
      // Remote screens are DISPLAYS → always plain http on the http port, so OBS and any
      // browser open them with no certificate. Never the page's https port.
      const port = (typeof bspHttpPortForLinks === 'function' && bspHttpPortForLinks())
        || (typeof getHttpPort === 'function' && getHttpPort()) || '';
      const pair = (typeof getRemoteShowPairCode === 'function' && getRemoteShowPairCode()) || '';
      if (!host || !port) return '';
      let url = `http://${host}:${port}/?outputId=${encodeURIComponent(id)}`;
      if (pair) url += `&pair=${encodeURIComponent(pair)}`;
      return url;
    }

    // Inline rename of a remote screen. Swaps the chip's pick button for a text field;
    // Enter/blur saves (and persists), Escape cancels. The new label rides along in
    // localStorage and the config export, since both already carry bspScreensAdded.
    function bspScreensBeginRename(id) {
      const els = bspScreensEls();
      const chip = els.chips && els.chips.querySelector(`[data-screen-id="${id}"]`);
      const screen = bspScreensAdded.find((s) => s.id === id);
      if (!chip || !screen) return;
      const pick = chip.querySelector('.bsp-screens__chip-pick');
      if (!pick) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'bsp-screens__chip-rename';
      input.value = screen.label;
      input.maxLength = 40;
      input.setAttribute('aria-label', t('screens_rename'));
      input.style.cssText = 'width:96px;min-width:60px;font:inherit;padding:2px 6px;border-radius:6px;' +
        'border:1px solid var(--accent,#4a9);background:var(--bg-dark,#111);color:var(--text,#fff)';
      pick.style.display = 'none';
      chip.insertBefore(input, pick);
      input.focus();
      input.select();

      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        if (save) {
          const v = input.value.trim().slice(0, 40);
          if (v) { screen.label = v; bspScreensPersist(); }
        }
        bspScreensRenderChips();
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation(); // keep panel-wide hotkeys from firing while renaming
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    }

    function bspScreensIsBlanked(id) {
      return !!(id && bspScreensBlanked[id]);
    }

    // Play/Stop for a remote screen: hide or show its projected content WITHOUT closing
    // the connection — the remote device stays connected, only the content blanks. Same
    // idea as the Live chip's clear, but scoped to one output via the designs map.
    function bspScreensToggleBlank(id) {
      if (!id) return;
      if (bspScreensBlanked[id]) delete bspScreensBlanked[id];
      else bspScreensBlanked[id] = true;
      bspScreensRenderChips();
      if (typeof isLive !== 'undefined' && isLive && typeof scheduleLiveUpdate === 'function') {
        scheduleLiveUpdate();
      }
    }

    async function bspScreensCopyRemoteLink(id) {
      // Pull the server's current LAN address + http port first, so the link is correct
      // even from the https panel (where the page port is 5443, not the http port).
      if (typeof bspRefreshServerLanIps === 'function') { try { await bspRefreshServerLanIps(); } catch (_) {} }
      const url = bspScreensRemoteLink(id);
      if (!url) { showToast(t('screens_link_needs_server')); return; }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          showToast(t('screens_link_copied'));
          return;
        }
      } catch (_) { /* fall through to showing the URL */ }
      showToast(url); // no clipboard access — surface the link so it can be copied by hand
    }

    function bspScreensIsAdded(id) {
      return bspScreensAdded.some(s => s.id === id);
    }

    // Screen ids from getScreenDetails() are positional (`screen_0`, `screen_1`), so a
    // stored chip is only trusted when a live display still matches on id AND geometry.
    function bspScreensIsConnected(id) {
      const added = bspScreensAdded.find(s => s.id === id);
      // A remote screen has no local geometry to match — it is "available" whenever the
      // link can be shared; the actual connection lives on the remote device.
      if (added && added.isRemote) return true;
      const live = bspScreensAvailable().find(s => s.id === id);
      if (!added || !live) return false;
      return live.width === added.width && live.height === added.height;
    }

    function bspScreensPersist() {
      try {
        localStorage.setItem(BSP_SCREENS_STORAGE_KEY, JSON.stringify(bspScreensAdded));
      } catch (_) {}
    }

    function bspScreensRestore() {
      try {
        const raw = localStorage.getItem(BSP_SCREENS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) {
          bspScreensAdded = parsed
            .filter(s => s && typeof s.id === 'string')
            .map(bspScreenSnapshot)
            .slice(0, 8);
        }
      } catch (_) {
        bspScreensAdded = [];
      }
    }

    async function bspScreensDetect(opts = {}) {
      if (bspScreensDetecting) return;
      bspScreensDetecting = true;
      bspScreensLastError = '';
      bspScreensRenderPopover();
      try {
        await refreshOutputScreenList({ forcePrompt: !!opts.forcePrompt });
      } catch (err) {
        bspScreensLastError = (err && err.message) ? err.message : 'Display detection failed';
      }
      bspScreensDetecting = false;
      bspScreensRenderPopover();
      bspScreensRenderChips();
    }

    function bspScreensPositionPopover() {
      const { btn, popover } = bspScreensEls();
      // Docked at the bottom of the panel, so the list opens upward.
      bspPositionFloatingPanel(btn, popover, {
        preferAbove: true,
        minHeight: 140,
        maxHeight: 300,
        matchTriggerWidth: false // the popover sets its own 260px in CSS
      });
    }

    function bspScreensOnViewportChange() {
      if (bspScreensPopoverOpen) bspScreensPositionPopover();
    }

    function bspScreensSetPopoverOpen(next) {
      const { root, btn, popover } = bspScreensEls();
      if (!root || !btn || !popover) return;
      bspScreensPopoverOpen = !!next;
      root.classList.toggle('is-open', bspScreensPopoverOpen);
      btn.setAttribute('aria-expanded', bspScreensPopoverOpen ? 'true' : 'false');
      popover.hidden = !bspScreensPopoverOpen;
      if (bspScreensPopoverOpen) {
        bspDdPortalToBody(popover);
        bspScreensRenderPopover();
        bspScreensPositionPopover();
        window.addEventListener('scroll', bspScreensOnViewportChange, true);
        window.addEventListener('resize', bspScreensOnViewportChange);
        bspScreensDetect({ forcePrompt: true });
      } else {
        window.removeEventListener('scroll', bspScreensOnViewportChange, true);
        window.removeEventListener('resize', bspScreensOnViewportChange);
      }
    }

    function bspScreensRenderPopover() {
      const { list, note } = bspScreensEls();
      if (!list) return;
      list.innerHTML = '';

      if (bspScreensDetecting) {
        const p = document.createElement('div');
        p.className = 'bsp-screens__placeholder';
        p.textContent = t('screens_detecting');
        list.appendChild(p);
        if (note) note.textContent = '';
        bspScreensPositionPopover();
        return;
      }

      const available = bspScreensAvailable();
      if (!available.length) {
        const p = document.createElement('div');
        p.className = 'bsp-screens__placeholder';
        p.textContent = bspScreensLastError || t('screens_none_found');
        list.appendChild(p);
      }

      available.forEach(screen => {
        const added = bspScreensIsAdded(screen.id);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'bsp-screens__option' + (added ? ' is-added' : '');
        row.disabled = added;

        const info = document.createElement('span');
        info.className = 'bsp-screens__option-info';

        const name = document.createElement('strong');
        name.className = 'bsp-screens__option-name';
        name.textContent = screen.label || 'Display';

        const meta = document.createElement('span');
        meta.className = 'bsp-screens__option-meta';
        const bits = [screen.isInternal ? t('screens_internal') : t('screens_external')];
        if (screen.isPrimary) bits.push(t('screens_primary'));
        bits.push(`${screen.width}×${screen.height}`);
        meta.textContent = bits.join(' • ');

        info.appendChild(name);
        info.appendChild(meta);
        row.appendChild(info);

        const mark = document.createElement('span');
        mark.className = 'bsp-screens__option-mark';
        if (added) mark.textContent = t('screens_already_added');
        else mark.innerHTML = BSP_SCREEN_ICONS.add;
        row.appendChild(mark);

        if (!added) row.addEventListener('click', () => bspScreensAdd(screen.id));
        list.appendChild(row);
      });

      // Remote-screen adder — always available, independent of any physical detection.
      // This is how you add screens on OTHER devices (a second PC, a TV, a tablet): they
      // open the link this creates and render this output's design.
      const remoteRow = document.createElement('button');
      remoteRow.type = 'button';
      remoteRow.className = 'bsp-screens__option bsp-screens__option--remote';
      const rInfo = document.createElement('span');
      rInfo.className = 'bsp-screens__option-info';
      const rName = document.createElement('strong');
      rName.className = 'bsp-screens__option-name';
      rName.textContent = t('screens_add_remote');
      const rMeta = document.createElement('span');
      rMeta.className = 'bsp-screens__option-meta';
      rMeta.textContent = t('screens_remote_hint');
      rInfo.appendChild(rName);
      rInfo.appendChild(rMeta);
      remoteRow.appendChild(rInfo);
      const rMark = document.createElement('span');
      rMark.className = 'bsp-screens__option-mark';
      rMark.innerHTML = BSP_SCREEN_ICONS.add;
      remoteRow.appendChild(rMark);
      remoteRow.addEventListener('click', () => bspScreensAddRemote());
      list.appendChild(remoteRow);

      // The detection path actually used is worth surfacing: it is the difference
      // between real multi-display support and a single-screen fallback.
      if (note) {
        const viaDesktop = (typeof hasDesktopOutputBridge === 'function') && hasDesktopOutputBridge();
        const single = available.length === 1 && available[0].id === 'current';
        if (viaDesktop) note.textContent = t('screens_via_desktop');
        else if (single) note.textContent = t('screens_permission_hint');
        else note.textContent = '';
      }

      bspScreensPositionPopover();
    }

    function bspScreensAdd(id) {
      const screen = bspScreensAvailable().find(s => s.id === id);
      if (!screen || bspScreensIsAdded(id)) return;
      bspScreensAdded.push(bspScreenSnapshot(screen));
      bspScreensPersist();
      bspScreensSelect(id);
      bspScreensSetPopoverOpen(false);
      bspScreensRenderChips();
    }

    function bspScreensRemove(id) {
      if (bspScreensProjectingId === id) bspScreensStopProjection(id);
      bspScreensAdded = bspScreensAdded.filter(s => s.id !== id);
      if (bspScreensSelectedId === id) bspScreensSelectedId = '';
      bspScreensPersist();
      bspScreensRenderChips();
      bspScreensRenderPopover();
    }

    // Greys out / re-enables the per-output design controls (Mode FS/LT, Lines, Background,
    // Background type) depending on whether an output chip is selected. With NOTHING
    // selected these controls used to silently edit the live/OBS output, which then
    // conflicted with a screen selected afterwards. Now: no selection → locked (you must
    // pick a chip — the Live chip to edit the live design, or a screen for its own).
    function bspUpdateDesignControlsEnabled() {
      const locked = !(typeof bspScreensSelectedId !== 'undefined' && bspScreensSelectedId);
      const lock = (el) => { if (el) el.classList.toggle('bsp-ctl-locked', locked); };
      // Only the FS/LT rows of the zone — not the whole zone (its label / Get-Lyrics stay).
      document.querySelectorAll('#bsp-screen-mode-zone .bsp-smz-row').forEach(lock);
      lock(document.getElementById('line-picker'));
      lock(document.getElementById('bg-mode-picker'));
      lock(document.getElementById('bg-type-picker'));
    }
    window.bspUpdateDesignControlsEnabled = bspUpdateDesignControlsEnabled;

    function bspScreensSelect(id) {
      bspScreensSelectedId = (bspScreensSelectedId === id) ? '' : id;
      bspScreensRenderChips();
      bspUpdateDesignControlsEnabled();
      // Hook for the per-output design editor, wired when the design map lands.
      if (typeof window.bspOnScreenSelectionChange === 'function') {
        window.bspOnScreenSelectionChange(bspScreensSelectedId);
      }
    }

    async function bspScreensProject(id) {
      const screen = bspScreensAdded.find(s => s.id === id);
      if (!screen) return;
      if (!bspScreensIsConnected(id)) {
        showToast(t('screens_disconnected').replace('{display}', screen.label));
        return;
      }
      // Application desktop (Electron) : chaque écran devient une VRAIE fenêtre OS,
      // ouverte plein écran sur son moniteur et chargée sur /?outputId=<id>. Fini la
      // fenêtre unique réutilisée : chaque fenêtre porte son propre outputId, donc son
      // propre design (FS/LT/SD G-D). Le contenu arrive par BroadcastChannel (même
      // origine http://127.0.0.1) + la carte `designs` du payload, et la nouvelle
      // fenêtre se resynchronise seule via son HELLO.
      if (window.bspDesktop && window.bspDesktop.isElectron && !screen.isRemote) {
        const entry = bspScreensAvailable().find(s => s.id === id);
        const displayId = entry && entry.desktopDisplayId;
        const res = await window.bspDesktop.openOutput(id, { displayId }).catch(() => null);
        if (!res || !res.ok) {
          showToast(t('output_open_failed'));
          return;
        }
        bspScreensProjectingId = id;
        if (typeof sendSyncState === 'function') sendSyncState();
        if (isLive && livePointer) pushLiveUpdate();
        bspScreensRenderChips();
        showToast(t('screens_projecting_on').replace('{display}', screen.label));
        return;
      }
      // Target this exact display. The legacy #output-screen-select is absent from the
      // markup, so setting it would be a no-op and the window would land on whichever
      // display 'auto' prefers — not the one that was clicked.
      bspOutputScreenOverride = id;
      const select = document.getElementById('output-screen-select');
      if (select) select.value = id;
      const opened = await openStandaloneOutputWindow({ moveAfterOpen: true, requestFullscreen: true });
      if (!opened) {
        bspOutputScreenOverride = '';
        return;
      }
      bspScreensProjectingId = id;
      if (typeof setOutputLiveState === 'function') setOutputLiveState(true);
      if (isLive && livePointer) pushLiveUpdate();
      bspScreensRenderChips();
      showToast(t('screens_projecting_on').replace('{display}', screen.label));
    }

    function bspScreensStopProjection(id) {
      if (bspScreensProjectingId && (!id || bspScreensProjectingId === id)) {
        const screen = bspScreensAdded.find(s => s.id === bspScreensProjectingId);
        const stoppingId = bspScreensProjectingId;
        bspScreensProjectingId = '';
        bspOutputScreenOverride = ''; // back to 'auto' for the legacy output flows
        // Electron : fermer la fenêtre OS de CE seul écran, sans toucher aux autres.
        if (window.bspDesktop && window.bspDesktop.isElectron) {
          window.bspDesktop.closeOutput(stoppingId).catch(() => {});
          bspScreensRenderChips();
          if (screen) showToast(t('screens_projection_stopped').replace('{display}', screen.label));
          return true;
        }
        if (typeof endOutputLive === 'function') endOutputLive();
        bspScreensRenderChips();
        if (screen) showToast(t('screens_projection_stopped').replace('{display}', screen.label));
        return true;
      }
      return false;
    }

    // The OBS/live output as an always-present chip. It has no physical screen and can
    // never be removed: it is the default output every install already has, and the one
    // that must stay selectable so its design can be customised even when no external
    // display is detected. Projecting it means going live to the OBS browser source.
    function bspScreensRenderLiveChip(chips) {
      const id = BSP_DEFAULT_OUTPUT_ID;
      const selected = bspScreensSelectedId === id;
      const projecting = (typeof isLive !== 'undefined') && !!isLive;

      const frozen = (typeof bspIsOutputFrozen === 'function') && bspIsOutputFrozen(id);
      const chip = document.createElement('div');
      chip.className = 'bsp-screens__chip bsp-screens__chip--live' +
        (selected ? ' is-selected' : '') +
        (projecting ? ' is-projecting' : '') +
        (frozen ? ' is-frozen' : '');
      chip.dataset.screenId = id;

      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'bsp-screens__chip-pick';
      pick.setAttribute('aria-pressed', selected ? 'true' : 'false');
      pick.title = t('screens_live_title');

      const icon = document.createElement('span');
      icon.className = 'bsp-screens__chip-live-icon';
      icon.innerHTML = BSP_SCREEN_ICONS.live;

      const name = document.createElement('span');
      name.className = 'bsp-screens__chip-name';
      name.textContent = t('screens_live_label');

      pick.appendChild(icon);
      pick.appendChild(name);
      pick.addEventListener('click', () => bspScreensSelect(id));
      chip.appendChild(pick);

      if (selected) {
        const act = document.createElement('button');
        act.type = 'button';
        act.className = 'bsp-screens__chip-act' + (projecting ? ' is-stop' : '');
        act.innerHTML = projecting ? BSP_SCREEN_ICONS.stop : BSP_SCREEN_ICONS.project;
        act.title = projecting ? t('screens_live_clear') : t('screens_live_project');
        act.setAttribute('aria-label', projecting ? t('screens_live_clear') : t('screens_live_project'));
        act.addEventListener('click', (e) => {
          e.stopPropagation();
          // Projecting the live chip = drive the OBS browser source: go live, or clear it.
          if (projecting) {
            if (typeof clearOutput === 'function') clearOutput();
          } else if (typeof projectLive === 'function') {
            projectLive(true);
          }
          bspScreensRenderChips();
        });
        chip.appendChild(act);
      }

      chips.appendChild(chip);
    }

    function bspScreensRenderChips() {
      const { chips } = bspScreensEls();
      if (!chips) return;
      chips.innerHTML = '';

      bspScreensRenderLiveChip(chips);

      bspScreensAdded.forEach(screen => {
        const selected = bspScreensSelectedId === screen.id;
        const projecting = bspScreensProjectingId === screen.id;
        const connected = bspScreensIsConnected(screen.id);

        const frozen = (typeof bspIsOutputFrozen === 'function') && bspIsOutputFrozen(screen.id);
        const chip = document.createElement('div');
        chip.className = 'bsp-screens__chip' +
          (selected ? ' is-selected' : '') +
          (projecting ? ' is-projecting' : '') +
          (frozen ? ' is-frozen' : '') +
          (connected ? '' : ' is-offline');
        chip.dataset.screenId = screen.id;

        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'bsp-screens__chip-pick';
        pick.setAttribute('aria-pressed', selected ? 'true' : 'false');
        pick.title = screen.isRemote
          ? `${screen.label} — ${t('screens_remote_label')}`
          : (connected
            ? `${screen.label} — ${screen.width}×${screen.height}`
            : t('screens_disconnected').replace('{display}', screen.label));

        const dot = document.createElement('span');
        dot.className = 'bsp-screens__chip-dot';

        const name = document.createElement('span');
        name.className = 'bsp-screens__chip-name';
        name.textContent = screen.label;

        pick.appendChild(dot);
        pick.appendChild(name);
        pick.addEventListener('click', () => bspScreensSelect(screen.id));
        chip.appendChild(pick);

        // Project / stop only shows on the selected chip, per the requested flow.
        if (selected) {
          if (screen.isRemote) {
            // Play/Stop: hide or show this remote screen's content without cutting its
            // connection (like the Live chip's clear, scoped to this output).
            const blanked = bspScreensIsBlanked(screen.id);
            const playStop = document.createElement('button');
            playStop.type = 'button';
            playStop.className = 'bsp-screens__chip-act' + (blanked ? '' : ' is-stop');
            playStop.innerHTML = blanked ? BSP_SCREEN_ICONS.project : BSP_SCREEN_ICONS.stop;
            playStop.title = blanked ? t('screens_remote_show') : t('screens_remote_hide');
            playStop.setAttribute('aria-label', (blanked ? t('screens_remote_show') : t('screens_remote_hide')) + ': ' + screen.label);
            playStop.addEventListener('click', (e) => {
              e.stopPropagation();
              bspScreensToggleBlank(screen.id);
            });
            chip.appendChild(playStop);

            // Rename (pencil): remote screens are user-named, so let the operator relabel
            // them. Persisted with the screen; saved in the config export.
            const renameBtn = document.createElement('button');
            renameBtn.type = 'button';
            renameBtn.className = 'bsp-screens__chip-act';
            renameBtn.innerHTML = BSP_SCREEN_ICONS.rename;
            renameBtn.title = t('screens_rename');
            renameBtn.setAttribute('aria-label', `${t('screens_rename')}: ${screen.label}`);
            renameBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              bspScreensBeginRename(screen.id);
            });
            chip.appendChild(renameBtn);

            // A remote screen isn't projected from this PC — you share its link, and the
            // remote device opens it. Copy-link replaces the project/stop action.
            const linkBtn = document.createElement('button');
            linkBtn.type = 'button';
            linkBtn.className = 'bsp-screens__chip-act';
            linkBtn.innerHTML = BSP_SCREEN_ICONS.link;
            linkBtn.title = t('screens_copy_link');
            linkBtn.setAttribute('aria-label', `${t('screens_copy_link')}: ${screen.label}`);
            linkBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              bspScreensCopyRemoteLink(screen.id);
            });
            chip.appendChild(linkBtn);
          } else {
            const act = document.createElement('button');
            act.type = 'button';
            act.className = 'bsp-screens__chip-act' + (projecting ? ' is-stop' : '');
            act.innerHTML = projecting ? BSP_SCREEN_ICONS.stop : BSP_SCREEN_ICONS.project;
            act.title = projecting ? t('screens_stop_projection') : t('screens_project_on');
            act.setAttribute('aria-label', `${projecting ? t('screens_stop_projection') : t('screens_project_on')}: ${screen.label}`);
            act.disabled = !connected && !projecting;
            act.addEventListener('click', (e) => {
              e.stopPropagation();
              if (projecting) bspScreensStopProjection(screen.id);
              else bspScreensProject(screen.id);
            });
            chip.appendChild(act);
          }

          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'bsp-screens__chip-rm';
          rm.innerHTML = BSP_SCREEN_ICONS.remove;
          rm.title = t('screens_remove');
          rm.setAttribute('aria-label', `${t('screens_remove')}: ${screen.label}`);
          rm.addEventListener('click', (e) => {
            e.stopPropagation();
            bspScreensRemove(screen.id);
          });
          chip.appendChild(rm);
        }

        chips.appendChild(chip);
      });
      // Keep the Settings output selector in sync when screens are added/removed/renamed.
      if (typeof updateSettingsOutputSelect === 'function') updateSettingsOutputSelect();
    }

    function bspScreensOnEscape(e) {
      if (e.key !== 'Escape') return false;
      if (bspScreensPopoverOpen) {
        bspScreensSetPopoverOpen(false);
        return true;
      }
      // Escape cancels an active projection. Guarded against firing while the operator
      // is typing in a field, which would kill the output mid-service.
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing) return false;
      return bspScreensStopProjection('');
    }

    function bspInitScreensBar() {
      const { btn, popover } = bspScreensEls();
      if (!btn || !popover || bspScreensBound) return;
      bspScreensBound = true;

      bspScreensRestore();
      bspScreensRenderChips();
      bspUpdateDesignControlsEnabled(); // locked until a chip is selected

      btn.addEventListener('click', () => bspScreensSetPopoverOpen(!bspScreensPopoverOpen));

      document.addEventListener('click', (e) => {
        if (!bspScreensPopoverOpen) return;
        const { root, popover: openPop } = bspScreensEls();
        if (!bspDdClickIsInside(e, root, openPop)) bspScreensSetPopoverOpen(false);
      });

      document.addEventListener('keydown', bspScreensOnEscape);

      // Keep chips honest when displays are plugged or unplugged.
      if (typeof window.getScreenDetails === 'function') {
        bspScreensDetect().catch(() => {});
      }
    }
