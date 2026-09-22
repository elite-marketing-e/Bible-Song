    // ===== LIVE PREVIEW (bottom-right) =====
    // A small always-on-top preview of what a screen is actually projecting. It is just
    // BSP_display.html in an <iframe> with ?outputId=<selected screen>: same origin, so it
    // receives the very same BroadcastChannel updates as the real display and renders that
    // output's design — live, with no server involved. It follows the SELECTED screen
    // (bspDesignTargetId), or the live/OBS output when nothing is selected.
    //
    // Kept out of the way: fixed bottom-right, mouse-resizable from its top-left corner,
    // collapsible, and its size/visibility persist. It overlays nothing interactive because
    // it sits in the corner and can be collapsed or closed.

    const BSP_PREVIEW_LS = 'bsp-preview-v1';

    function bspPreviewState() {
      try { return JSON.parse(localStorage.getItem(BSP_PREVIEW_LS) || '{}') || {}; }
      catch (_) { return {}; }
    }
    function bspPreviewSaveState(patch) {
      const s = { ...bspPreviewState(), ...patch };
      try { localStorage.setItem(BSP_PREVIEW_LS, JSON.stringify(s)); } catch (_) {}
    }

    function bspPreviewTargetId() {
      return (typeof bspDesignTargetId !== 'undefined' && bspDesignTargetId) ? bspDesignTargetId : 'obs';
    }

    // Reloads the iframe for the current target. Called on open and whenever the selected
    // screen changes; selection changes are rare, so a reload is cheap enough and keeps the
    // preview a faithful, self-contained copy of the display.
    let bspPreviewLoadedTarget = '';
    function bspPreviewUpdateTarget(force) {
      const frame = document.getElementById('bsp-preview-frame');
      const wrap = document.getElementById('bsp-preview');
      if (!frame || !wrap || wrap.hidden) return;
      const id = bspPreviewTargetId();
      if (!force && id === bspPreviewLoadedTarget) return;
      bspPreviewLoadedTarget = id;
      // preview=1 tells the display it's an embedded preview (no fullscreen prompts).
      frame.src = `BSP_display.html?outputId=${encodeURIComponent(id)}&preview=1`;
      const title = document.getElementById('bsp-preview-title');
      if (title) {
        title.textContent = (typeof bspDesignTargetLabel === 'function')
          ? bspDesignTargetLabel(id)
          : (id === 'obs' ? 'Live' : id);
      }
    }

    function bspPreviewIsOpen() {
      const wrap = document.getElementById('bsp-preview');
      return wrap && !wrap.hidden;
    }

    function bspTogglePreview(forceOn) {
      const wrap = document.getElementById('bsp-preview');
      if (!wrap) return;
      const open = (typeof forceOn === 'boolean') ? forceOn : wrap.hidden;
      wrap.hidden = !open;
      bspPreviewSaveState({ open });
      const btn = document.getElementById('bsp-preview-btn');
      if (btn) btn.classList.toggle('is-active', open);
      if (open) {
        bspPreviewApplySize();
        bspPreviewUpdateTarget(true);
      } else {
        // Drop the iframe so it stops rendering/receiving in the background.
        const frame = document.getElementById('bsp-preview-frame');
        if (frame) { frame.src = 'about:blank'; bspPreviewLoadedTarget = ''; }
      }
    }

    function bspPreviewApplySize() {
      const wrap = document.getElementById('bsp-preview');
      if (!wrap) return;
      const s = bspPreviewState();
      const w = Math.max(180, Math.min(window.innerWidth - 40, Number(s.w) || 320));
      const h = Math.max(110, Math.min(window.innerHeight - 40, Number(s.h) || 190));
      wrap.style.width = w + 'px';
      wrap.style.setProperty('--bsp-preview-body-h', (s.collapsed ? 0 : h) + 'px');
      wrap.classList.toggle('is-collapsed', !!s.collapsed);
    }

    function bspPreviewToggleCollapse() {
      const s = bspPreviewState();
      bspPreviewSaveState({ collapsed: !s.collapsed });
      bspPreviewApplySize();
    }

    function bspInitLivePreview() {
      const wrap = document.getElementById('bsp-preview');
      if (!wrap) return;

      const collapseBtn = document.getElementById('bsp-preview-collapse');
      const closeBtn = document.getElementById('bsp-preview-close');
      if (collapseBtn) collapseBtn.addEventListener('click', bspPreviewToggleCollapse);
      if (closeBtn) closeBtn.addEventListener('click', () => bspTogglePreview(false));

      // Resize from the top-left grip (the box is anchored bottom-right, so dragging the
      // grip up/left grows it).
      const grip = document.getElementById('bsp-preview-resize');
      if (grip) {
        let dragging = false, startX = 0, startY = 0, startW = 0, startH = 0;
        const onMove = (e) => {
          if (!dragging) return;
          const w = Math.max(180, Math.min(window.innerWidth - 40, startW + (startX - e.clientX)));
          const h = Math.max(110, Math.min(window.innerHeight - 40, startH + (startY - e.clientY)));
          wrap.style.width = w + 'px';
          wrap.style.setProperty('--bsp-preview-body-h', h + 'px');
        };
        const onUp = () => {
          if (!dragging) return;
          dragging = false;
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          const w = parseFloat(wrap.style.width) || 320;
          const h = parseFloat(getComputedStyle(wrap).getPropertyValue('--bsp-preview-body-h')) || 190;
          bspPreviewSaveState({ w: Math.round(w), h: Math.round(h) });
        };
        grip.addEventListener('pointerdown', (e) => {
          dragging = true;
          startX = e.clientX; startY = e.clientY;
          startW = parseFloat(wrap.style.width) || 320;
          startH = parseFloat(getComputedStyle(wrap).getPropertyValue('--bsp-preview-body-h')) || 190;
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
          e.preventDefault();
        });
      }

      // Restore last size/visibility.
      bspPreviewApplySize();
      const s = bspPreviewState();
      if (s.open) bspTogglePreview(true); else wrap.hidden = true;
    }
