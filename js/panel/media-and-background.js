    function getActiveBgOpacityValue() {
      return (activeRatio === 'full') ? bgOpacityFull : bgOpacityLT;
    }

    function syncBgOpacitySlider() {
      const fullSlider = document.getElementById('bg-opacity-full');
      const ltSlider = document.getElementById('bg-opacity-lt');
      if (fullSlider) {
        fullSlider.value = bgOpacityFull;
        updateSliderValue(fullSlider, '%');
        updateSliderFill(fullSlider);
      }
      if (ltSlider) {
        ltSlider.value = bgOpacityLT;
        updateSliderValue(ltSlider, '%');
        updateSliderFill(ltSlider);
      }
    }

    function applyLtBgDefaultForTab(tab) {
      if (activeRatio !== '16-9') return false;
      const bgToggle = document.getElementById('bg-toggle');
      if (!bgToggle) return false;
      let desired = !!bgToggle.checked;
      if (tab === 'bible') {
        desired = true;
      } else if (tab === 'songs') {
        desired = !!songBgUserOn;
      }
      if (bgToggle.checked === desired) return false;
      bgToggle.checked = desired;
      return true;
    }

    function getEffectiveContentTab() {
      if (isLive && livePointer && livePointer.kind) {
        return livePointer.kind === 'bible' ? 'bible' : 'songs';
      }
      if (currentItem && getIsBibleItem(currentItem)) return 'bible';
      if (sidebarTab === 'schedule') return 'schedule';
      return sidebarTab === 'bible' ? 'bible' : 'songs';
    }

    function updateBgModeUi() {
      const label = document.getElementById('bg-mode-label');
      const quick = document.getElementById('bg-color-quick');
      const split = document.getElementById('bg-color-split');
      if (label) {
        label.textContent = (bgMode === 'gradient') ? 'GB' : 'BG';
        label.classList.toggle('active', bgMode === 'gradient');
        label.title = (bgMode === 'gradient') ? 'Gradient Background' : 'Background';
      }
      if (quick) quick.style.display = (bgMode === 'gradient') ? 'none' : 'inline-block';
      if (split) split.style.display = (bgMode === 'gradient') ? 'inline-flex' : 'none';
      updateBgModePicker();
    }

    function setBgMode(mode, opts = {}) {
      bgMode = (mode === 'gradient') ? 'gradient' : 'solid';
      updateBgModeUi();
      if (!opts.silent) onAnyControlChange();
    }

    function toggleBgMode(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (bgMode !== 'gradient') {
        setBgMode('gradient');
      } else {
        setBgMode('solid');
      }
    }

    // Footer background controls and the Edit Design modal are two views of the same
    // design. When a DISCRETE footer control changes (mode BG/GB/OFF, type Color/Image/
    // Video, on/off — NOT a continuous colour drag, which would destroy the modal's
    // colour input mid-move), refresh the open modal so both sides stay parallel — the
    // same pattern used for the Mode/screen zone.
    function bspSyncDesignModalFromFooter() {
      if (typeof bspIsDesignModalOpen === 'function' && bspIsDesignModalOpen() &&
          typeof bspRenderScreenDesignPanel === 'function') {
        bspRenderScreenDesignPanel();
      }
    }

    function setBgModeFromPicker(mode) {
      const bgToggle = document.getElementById('bg-toggle');
      if (bgToggle && !bgToggle.checked) {
        bgToggle.checked = true;
        if (sidebarTab === 'songs' && activeRatio === '16-9') songBgUserOn = true;
      }
      setBgMode(mode);
      updateBgModePicker();
      bspSyncDesignModalFromFooter();
    }

    function toggleBgOnOff(on) {
      const bgToggle = document.getElementById('bg-toggle');
      if (!bgToggle) return;
      if (on === undefined) on = !bgToggle.checked;
      bgToggle.checked = on;
      if (sidebarTab === 'songs' && activeRatio === '16-9') songBgUserOn = on;
      updateBgModePicker();
      onAnyControlChange();
      bspSyncDesignModalFromFooter();
    }

    function updateBgModePicker() {
      const bgToggle = document.getElementById('bg-toggle');
      const isOn = bgToggle && bgToggle.checked;
      const solidBtn = document.getElementById('bg-mode-solid');
      const gradBtn = document.getElementById('bg-mode-gradient');
      const offBtn = document.getElementById('bg-off-btn');
      if (solidBtn) solidBtn.classList.toggle('active', isOn && bgMode === 'solid');
      if (gradBtn) gradBtn.classList.toggle('active', isOn && bgMode === 'gradient');
      if (offBtn) {
        offBtn.classList.toggle('active', !isOn);
        offBtn.textContent = isOn ? 'OFF' : 'OFF ✓';
      }
    }


    function handleBgTypeChange() {
      const t = document.getElementById('bg-type').value;
      document.getElementById('bg-image-settings').style.display = (t === 'image') ? 'block' : 'none';
      document.getElementById('bg-video-settings').style.display = (t === 'video') ? 'block' : 'none';
      document.getElementById('bg-media-effects').style.display = (t === 'image' || t === 'video') ? 'block' : 'none';
      if (t === 'image') handleBgImageSourceChange();
      if (t === 'video') handleBgVideoSourceChange();
      updateBgTypePicker();
    }

    // Applies a media-gallery pick to the footer/live background. Stores the RAW ref
    // ("bank:<id>" or a URL) in the url field with source='url' — the background pipeline
    // resolves bank:<id> to a real URL only at send time (see songs-and-bible.js), so the
    // stored/persisted value stays a few bytes, never a multi-MB data URL.
    function bspFooterApplyMediaPick(isVideo, ref) {
      const srcSel = document.getElementById(isVideo ? 'bg-video-source' : 'bg-image-source');
      const urlInput = document.getElementById(isVideo ? 'bg-video-url' : 'bg-image-url');
      if (srcSel) srcSel.value = 'url';
      if (urlInput) urlInput.value = String(ref || '');
      if (isVideo) { if (typeof handleBgVideoSourceChange === 'function') handleBgVideoSourceChange(); }
      else { if (typeof handleBgImageSourceChange === 'function') handleBgImageSourceChange(); }
      onAnyControlChange();
      bspSyncDesignModalFromFooter();
    }

    function setBgTypePicker(type, opts = {}) {
      const sel = document.getElementById('bg-type');
      if (sel) {
        sel.value = type;
        handleBgTypeChange();
        onAnyControlChange();
      }
      bspSyncDesignModalFromFooter();
      // Image/Video: open the SAME media popup Edit Design uses (import / paste a link /
      // pick from the bank). The pick applies to the live background here and re-syncs the
      // modal. opts.noGallery lets programmatic callers set the type without popping it.
      if (!opts.noGallery && (type === 'image' || type === 'video') &&
          typeof bspOpenMediaGallery === 'function') {
        bspOpenMediaGallery({ kind: type, onPick: (ref) => bspFooterApplyMediaPick(type === 'video', ref) });
      }
    }

    function updateBgTypePicker() {
      const val = document.getElementById('bg-type').value;
      document.getElementById('bgtype-color').classList.toggle('active', val === 'color');
      document.getElementById('bgtype-image').classList.toggle('active', val === 'image');
      document.getElementById('bgtype-video').classList.toggle('active', val === 'video');
    }
    
    function handleBgImageSourceChange() {
      const src = document.getElementById('bg-image-source').value;
      document.getElementById('bg-url-row').style.display = (src === 'url') ? 'block' : 'none';
      document.getElementById('bg-upload-row').style.display = (src === 'upload') ? 'block' : 'none';
    }

    function handleBgVideoSourceChange() {
      const src = document.getElementById('bg-video-source').value;
      document.getElementById('bg-video-url-row').style.display = (src === 'url') ? 'block' : 'none';
      document.getElementById('bg-video-upload-row').style.display = (src === 'upload') ? 'block' : 'none';
    }
    
    // Routes an uploaded background through the media bank instead of embedding a multi-MB
    // data URL in every live payload. The bank stores it once, uploads it to the server,
    // and the payload then carries only a light "bank:<id>" ref (resolved to a server URL
    // at send time). Huge latency win for remote screens + far less RAM/localStorage.
    // Without a server (pure OBS/BroadcastChannel), bspResolveMediaRef falls back to the
    // data URL — but that path is same-machine and instant anyway.
    async function bspRouteBgUploadThroughBank(input, isVideo) {
      const file = input.files && input.files[0];
      if (!file) return;
      const hintId = isVideo ? 'bg-video-upload-hint' : 'bg-upload-hint';
      const srcId = isVideo ? 'bg-video-source' : 'bg-image-source';
      const urlId = isVideo ? 'bg-video-url' : 'bg-image-url';
      try {
        const dataUrl = await bspReadFileAsDataUrl(file);
        const rec = await bspMediaAdd({ name: file.name, type: isVideo ? 'video' : 'image', dataUrl });
        if (!rec || !rec.id) throw new Error('bank add failed');
        // Reference the bank item via the light url path (source='url' resolves bank:<id>).
        const srcSel = document.getElementById(srcId);
        const urlInput = document.getElementById(urlId);
        if (srcSel) srcSel.value = 'url';
        if (urlInput) urlInput.value = BSP_MEDIA_REF_PREFIX + rec.id;
        if (isVideo) { if (typeof handleBgVideoSourceChange === 'function') handleBgVideoSourceChange(); }
        else { if (typeof handleBgImageSourceChange === 'function') handleBgImageSourceChange(); }
        const hint = document.getElementById(hintId);
        if (hint) hint.innerText = (isVideo ? 'Vidéo' : 'Image') + ' ajoutée à la banque ✓';
        saveToStorageDebounced();
        onAnyControlChange();
        persistBackgroundState();
        showToast(isVideo ? 'Fond vidéo ajouté (léger)' : 'Fond image ajouté (léger)');
        if (typeof bspSyncDesignModalFromFooter === 'function') bspSyncDesignModalFromFooter();
      } catch (err) {
        // Fallback to the legacy data-URL path so an upload never silently fails.
        const reader = new FileReader();
        reader.onload = () => {
          if (isVideo) bgVideoUploadDataUrl = reader.result; else bgUploadDataUrl = reader.result;
          const hint = document.getElementById(hintId);
          if (hint) hint.innerText = (isVideo ? 'Video' : 'Image') + ' selected ✓';
          saveToStorageDebounced();
          onAnyControlChange();
          persistBackgroundState();
        };
        reader.readAsDataURL(file);
      }
    }

    function handleBgUpload(input) { bspRouteBgUploadThroughBank(input, false); }
    function handleBgVideoUpload(input) { bspRouteBgUploadThroughBank(input, true); }

    function clearBgUrl(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      onAnyControlChange();
    }
    
    function calculateLtHeightPctFromLines(lineCount, referenceCount = 1) {
      const lines = Math.max(1, lineCount);
      const baseRefHeight = Math.max(1, referenceCount) * 46;
      const basePx = Math.max(0, baseRefHeight + 168 - 40);
      const perLinePx = 44;
      const totalPx = basePx + (perLinePx * lines);
      const pct = (totalPx / 1080) * 100;
      return Math.max(28, Math.min(100, pct));
    }

    function countLtWords(text = '') {
      const normalized = String(text || '')
        .replace(/<\/?[^>]+>/g, ' ')
        .replace(/[\n\r]+/g, ' ')
        .replace(/[\uFEFF\u00A0]+/g, ' ')
        .trim();
      if (!normalized) return 0;
      return normalized.split(/\s+/).filter(Boolean).length;
    }

    function getDualModeLineTarget(primaryRaw = '', secondaryRaw = '') {
      const totalWords = countLtWords(primaryRaw) + countLtWords(secondaryRaw);
      const wordsPerLine = 12;
      const linesNeeded = totalWords ? Math.ceil(totalWords / wordsPerLine) : 3;
      return Math.min(3, Math.max(3, linesNeeded));
    }

    function getScheduleLineHint(entry) {
      if (!entry) return null;
      const clamp = (value) => Math.max(1, Math.min(getMaxLinesForCurrentTab('bible'), value));
      if (Number.isFinite(entry.linesPerPage)) {
        return clamp(Number(entry.linesPerPage));
      }
      if (entry.pageSnapshot) {
        const snapshot = entry.pageSnapshot;
        const verseCount = Number(snapshot.verseCount);
        if (Number.isFinite(verseCount) && verseCount >= 1) {
          return clamp(verseCount);
        }
        const rawText = String(snapshot.raw || snapshot.text || '');
        const lines = rawText
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean).length;
        if (lines) return clamp(lines);
      }
      return null;
    }

    function getLtBgHeightPct(verseCount) {
      if (activeRatio === 'custom') return 220 / 1080 * 100;
      if (autoAdjustLtHeight && getEffectiveContentTab() === 'bible') {
        const lineHeight = Number(document.getElementById('line-height-lt').value || 1.1);
        const fontSize = getEffectiveLtFont();
        const baseHeight = 15;
        const heightPerVerse = 3;
        const calculatedHeight = baseHeight + (verseCount * heightPerVerse);
        return Math.max(15, Math.min(45, calculatedHeight));
      }
      return calculateLtHeightPctFromLines(linesPerPage);
    }
    
