    // ===== SIDEBAR DROPDOWN CORE =====
    // Shared by the Bible category dropdown and the Bible version dropdown.
    //
    // Why panels are moved to <body> while open: the sidebar sits inside several
    // `overflow: hidden` ancestors (#workspace-top, #app-container, #app-body-row,
    // #page-projection), which clip an absolutely positioned panel in a short OBS
    // dock. `position: fixed` alone does not help either, because the sidebar carries
    // a transform in some layouts and a transformed ancestor becomes the containing
    // block for fixed children, leaving them clipped all the same.

    const BSP_DD_MARGIN = 8;
    const BSP_DD_MIN_PANEL_H = 160;
    const BSP_DD_MAX_PANEL_H = 320;

    function bspDdPortalToBody(panel) {
      if (panel && panel.parentElement !== document.body) document.body.appendChild(panel);
    }

    // Positions `panel` against `trigger` in viewport coordinates, flipping above
    // when the space below is too cramped, and clamping to stay on screen.
    function bspPositionFloatingPanel(trigger, panel, opts = {}) {
      if (!trigger || !panel || panel.hidden) return;
      const minH = Number(opts.minHeight) || BSP_DD_MIN_PANEL_H;
      const maxH = Number(opts.maxHeight) || BSP_DD_MAX_PANEL_H;
      const t = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const spaceBelow = vh - t.bottom - BSP_DD_MARGIN;
      const spaceAbove = t.top - BSP_DD_MARGIN;
      // `preferAbove` flips the default side (used by controls docked at the bottom of
      // the panel); either way the opposite side still wins when the preferred one is
      // too cramped, so the panel never opens into a few pixels.
      const placeAbove = opts.preferAbove
        ? !(spaceAbove < minH && spaceBelow > spaceAbove)
        : (spaceBelow < minH && spaceAbove > spaceBelow);
      const available = Math.max(minH, placeAbove ? spaceAbove : spaceBelow);

      panel.style.maxHeight = `${Math.min(maxH, available)}px`;
      // Dropdowns mirror their trigger's width; a popover that declares its own width
      // in CSS (matchTriggerWidth: false) keeps it.
      if (opts.matchTriggerWidth !== false) panel.style.width = `${Math.round(t.width)}px`;

      // Measure after sizing so a flipped panel is anchored by its real size.
      const h = panel.offsetHeight;
      const w = panel.offsetWidth || t.width;
      let top = placeAbove ? (t.top - BSP_DD_MARGIN / 2 - h) : (t.bottom + BSP_DD_MARGIN / 2);
      top = Math.max(BSP_DD_MARGIN, Math.min(top, vh - h - BSP_DD_MARGIN));

      let left = Math.max(BSP_DD_MARGIN, Math.min(t.left, vw - w - BSP_DD_MARGIN));

      panel.style.top = `${Math.round(top)}px`;
      panel.style.left = `${Math.round(left)}px`;
      panel.classList.toggle('is-above', placeAbove);
    }

    // A click is "inside" when it lands on the trigger's root or on the portaled
    // panel, which no longer shares an ancestor with it.
    function bspDdClickIsInside(event, root, panel) {
      const target = event && event.target;
      if (!target) return false;
      return !!((root && root.contains(target)) || (panel && panel.contains(target)));
    }
