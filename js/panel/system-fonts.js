    // ===== SYSTEM FONTS =====
    // Pulls the fonts installed on the PC via the Local Font Access API so they can be
    // chosen per screen (and globally). Requires a secure context, a user gesture, and
    // the local-fonts permission — none guaranteed in the OBS CEF browser, so every path
    // degrades to a clear message rather than a broken control.

    let bspSystemFonts = [];
    const BSP_SYSTEM_FONTS_STORAGE_KEY = 'bsp-system-fonts-v1';

    function bspSystemFontsSupported() {
      return typeof window.queryLocalFonts === 'function';
    }

    function bspPersistSystemFonts() {
      try {
        // Cap the stored list: some machines expose thousands of faces and we only need
        // family names for the pickers.
        localStorage.setItem(BSP_SYSTEM_FONTS_STORAGE_KEY, JSON.stringify(bspSystemFonts.slice(0, 2000)));
      } catch (_) {}
    }

    function bspRestoreSystemFonts() {
      try {
        const raw = localStorage.getItem(BSP_SYSTEM_FONTS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        bspSystemFonts = Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
      } catch (_) {
        bspSystemFonts = [];
      }
    }

    async function bspLoadSystemFonts(opts = {}) {
      if (!bspSystemFontsSupported()) {
        if (!opts.silent) showToast(t('fonts_system_unsupported'));
        return false;
      }
      try {
        const fonts = await window.queryLocalFonts();
        const families = [...new Set((fonts || []).map(f => f && f.family).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b));
        if (!families.length) {
          if (!opts.silent) showToast(t('fonts_system_none'));
          return false;
        }
        bspSystemFonts = families;
        bspPersistSystemFonts();
        if (typeof renderFontFamilyOptions === 'function') renderFontFamilyOptions();
        if (typeof bspRenderScreenDesignPanel === 'function') bspRenderScreenDesignPanel();
        if (!opts.silent) showToast(t('fonts_system_loaded').replace('{n}', String(families.length)));
        return true;
      } catch (err) {
        // NotAllowedError (permission denied / no gesture) or SecurityError.
        if (!opts.silent) showToast(t('fonts_system_denied'));
        return false;
      }
    }

    // Single source of truth for every font picker: built-in + uploaded + system fonts,
    // de-duplicated by CSS value so the same family never appears twice.
    function bspAllFontOptions() {
      const out = [];
      const seen = new Set();
      const push = (label, value) => {
        if (!value || seen.has(value)) return;
        seen.add(value);
        out.push({ label, value });
      };
      (typeof baseFontOptions !== 'undefined' ? baseFontOptions : []).forEach(o => push(o.label, o.value));
      (typeof customFonts !== 'undefined' ? customFonts : []).forEach(f => push(f.name, `'${f.name}',sans-serif`));
      bspSystemFonts.forEach(fam => push(fam, `'${fam.replace(/'/g, '')}',sans-serif`));
      return out;
    }

    // Best-effort label for a stored fontFamily CSS value (strips quotes / fallback).
    function bspFontLabelForValue(value) {
      const m = String(value || '').match(/^\s*'?([^',]+)'?/);
      return m ? m[1] : String(value || '');
    }
