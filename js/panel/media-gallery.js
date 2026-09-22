    // ===== MEDIA GALLERY MODAL =====
    // Opened from the design panel's Image/Video background. Lets the operator browse the
    // bank, import by drag-and-drop or file picker, paste a link (not saved to the bank),
    // or pick an existing item. bspOpenMediaGallery({ kind, onPick }) resolves a choice to
    // either "bank:<id>" (a stored item) or a plain URL, and hands it back via onPick.

    let bspGalleryKind = 'image';
    let bspGalleryOnPick = null;

    function bspGalleryEls() {
      return {
        modal: document.getElementById('bsp-gallery-modal'),
        grid: document.getElementById('bsp-gallery-grid'),
        title: document.getElementById('bsp-gallery-title'),
        link: document.getElementById('bsp-gallery-link'),
        drop: document.getElementById('bsp-gallery-drop'),
        fileInput: document.getElementById('bsp-gallery-file'),
        empty: document.getElementById('bsp-gallery-empty')
      };
    }

    function bspOpenMediaGallery(opts = {}) {
      const els = bspGalleryEls();
      if (!els.modal) return;
      bspGalleryKind = opts.kind === 'video' ? 'video' : 'image';
      bspGalleryOnPick = typeof opts.onPick === 'function' ? opts.onPick : null;
      if (els.title) els.title.textContent = t(bspGalleryKind === 'video' ? 'gallery_title_video' : 'gallery_title_image');
      if (els.link) {
        els.link.value = '';
        els.link.placeholder = t(bspGalleryKind === 'video' ? 'sde_video_url' : 'sde_image_url');
      }
      if (els.fileInput) els.fileInput.accept = bspGalleryKind === 'video' ? 'video/*' : 'image/*';
      els.modal.hidden = false;
      bspRenderGallery();
      document.addEventListener('keydown', bspGalleryKeydown, true);
    }

    function bspCloseMediaGallery() {
      const { modal } = bspGalleryEls();
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      bspGalleryOnPick = null;
      document.removeEventListener('keydown', bspGalleryKeydown, true);
    }

    function bspGalleryKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); bspCloseMediaGallery(); }
    }

    function bspGalleryPick(ref) {
      const cb = bspGalleryOnPick;
      bspCloseMediaGallery();
      if (cb) cb(ref);
    }

    function bspRenderGallery() {
      const { grid, empty } = bspGalleryEls();
      if (!grid) return;
      grid.innerHTML = '';
      const items = (typeof bspMediaList === 'function' ? bspMediaList() : []).filter(m => m.type === bspGalleryKind);

      if (empty) empty.hidden = items.length > 0;

      items.forEach((item) => {
        const cell = document.createElement('div');
        cell.className = 'bsp-gallery__cell';

        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'bsp-gallery__pick';
        pick.title = item.name;
        if (item.type === 'image') {
          const img = document.createElement('img');
          img.className = 'bsp-gallery__thumb';
          img.loading = 'lazy';
          img.src = item.dataUrl;
          img.alt = item.name;
          pick.appendChild(img);
        } else {
          // Video: a real <video> poster is costly for a grid; show a plain tile + badge.
          const badge = document.createElement('div');
          badge.className = 'bsp-gallery__video';
          badge.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"/></svg>';
          pick.appendChild(badge);
        }
        const name = document.createElement('span');
        name.className = 'bsp-gallery__name';
        name.textContent = item.name;
        pick.appendChild(name);
        pick.addEventListener('click', () => bspGalleryPick(BSP_MEDIA_REF_PREFIX + item.id));
        cell.appendChild(pick);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'bsp-gallery__del';
        del.title = t('gallery_delete');
        del.setAttribute('aria-label', t('gallery_delete') + ': ' + item.name);
        del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          await bspMediaDelete(item.id);
          bspRenderGallery();
        });
        cell.appendChild(del);

        grid.appendChild(cell);
      });
    }

    async function bspGalleryImport(files) {
      if (!files || !files.length) return;
      const res = await bspMediaImportFiles(files);
      bspRenderGallery();
      if (typeof showToast === 'function') {
        if (res.added) showToast(t('gallery_imported').replace('{n}', String(res.added)));
        else if (res.skipped) showToast(t('gallery_import_skipped'));
      }
    }

    function bspGalleryUseLink() {
      const { link } = bspGalleryEls();
      const url = (link && link.value || '').trim();
      if (!url) return;
      // A pasted link is used as-is and NOT stored in the bank, by request.
      bspGalleryPick(url);
    }

    function bspInitMediaGallery() {
      const { drop, fileInput, link } = bspGalleryEls();
      if (fileInput) fileInput.addEventListener('change', () => { bspGalleryImport(fileInput.files); fileInput.value = ''; });
      if (drop) {
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
          e.preventDefault(); e.stopPropagation(); drop.classList.add('is-over');
        }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
          e.preventDefault(); e.stopPropagation(); if (ev === 'dragleave') drop.classList.remove('is-over');
        }));
        drop.addEventListener('drop', (e) => {
          drop.classList.remove('is-over');
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files.length) bspGalleryImport(dt.files);
        });
      }
      if (link) link.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); bspGalleryUseLink(); } });
    }
