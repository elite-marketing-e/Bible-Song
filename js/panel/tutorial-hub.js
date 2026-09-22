(function () {
  'use strict';

  const TUTORIAL_SOCIAL_LINKS = {
    youtube: 'https://www.youtube.com/johnsonolakotan',
    instagram: 'https://www.instagram.com/johnsonolakotan',
    tiktok: 'https://www.tiktok.com/@johnsonolakotan'
  };

  const TUTORIAL_PLAYLIST_ID = 'PLGaYNJW-HZ6i_4TYYmRJ8GtdtUJtGEAyk';
  const TUTORIAL_PLAYLIST_FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${TUTORIAL_PLAYLIST_ID}`;
  const TUTORIAL_CACHE_KEY = 'bsp:tutorial-platform-cache:v2';
  const TUTORIAL_OLD_CACHE_KEY = 'bsp:tutorial-videos-cache:v1';
  const TUTORIAL_PLATFORMS = ['youtube', 'instagram', 'tiktok'];
  const TUTORIAL_YOUTUBE_FEED_SOURCES = [
    { url: TUTORIAL_PLAYLIST_FEED_URL, format: 'xml' },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(TUTORIAL_PLAYLIST_FEED_URL)}`, format: 'allorigins-get' },
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(TUTORIAL_PLAYLIST_FEED_URL)}`, format: 'xml' },
    { url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(TUTORIAL_PLAYLIST_FEED_URL)}`, format: 'rss2json' },
    { url: `https://r.jina.ai/http://www.youtube.com/feeds/videos.xml?playlist_id=${TUTORIAL_PLAYLIST_ID}`, format: 'xml' }
  ];
  const TUTORIAL_STATIC_STATS = {
    'c1yMdg-qEf0': { viewCount: 897, likeCount: 17, commentCount: 0 },
    '4SVs5jyYx3o': { viewCount: 10530, likeCount: 345, commentCount: 0 }
  };

  const TUTORIAL_SEED_DATA = {
    youtube: [
      {
        platform: 'youtube',
        title: 'Import Bible in Bible Song Pro - OBS',
        publishedAt: '2026-03-22T07:16:59+00:00',
        videoId: 'c1yMdg-qEf0',
        videoUrl: 'https://www.youtube.com/shorts/c1yMdg-qEf0',
        thumbnailUrl: 'https://i4.ytimg.com/vi/c1yMdg-qEf0/hqdefault.jpg',
        description: 'How to import Bible in Bible Song Pro for OBS workflow.',
        channelName: 'Johnson Olakotan',
        channelAvatarUrl: 'https://unavatar.io/youtube/@johnsonolakotan',
        viewCount: 897,
        likeCount: 17,
        commentCount: 0
      },
      {
        platform: 'youtube',
        title: 'This OBS Tool Will Transform Your Church Live Stream | Bible Song Pro',
        publishedAt: '2026-05-10T12:59:54+00:00',
        videoId: '4SVs5jyYx3o',
        videoUrl: 'https://www.youtube.com/watch?v=4SVs5jyYx3o',
        thumbnailUrl: 'https://i4.ytimg.com/vi/4SVs5jyYx3o/hqdefault.jpg',
        description: 'Bible Song Pro tutorial for church livestream workflows in OBS.',
        channelName: 'Johnson Olakotan',
        channelAvatarUrl: 'https://unavatar.io/youtube/@johnsonolakotan',
        viewCount: 10530,
        likeCount: 345,
        commentCount: 0
      }
    ],
    instagram: [],
    tiktok: []
  };

  const TUTORIAL_PAGE_META = {
    youtube: {
      title: 'Bible Song Pro YouTube Tutorials',
      subtitle: 'Learn the fastest ways to build polished scripture, lyrics, and livestream screens for every service.',
      socialLabel: 'YouTube Channel',
      channelName: 'Johnson Olakotan',
      channelAvatar: 'https://unavatar.io/youtube/@johnsonolakotan',
      emptyText: 'YouTube tutorials are temporarily unavailable. Open the channel for the latest Bible Song Pro walkthroughs.'
    },
    instagram: {
      title: 'Bible Song Pro Tutorials on Instagram',
      subtitle: 'Quick visual tips, short demos, and setup ideas you can watch between services.',
      socialLabel: 'Instagram Profile',
      channelName: '@johnsonolakotan',
      channelAvatar: 'https://unavatar.io/instagram/johnsonolakotan',
      emptyText: 'Instagram may require sign-in before showing posts here. Open the profile in your browser for the latest Bible Song Pro reels and updates.'
    },
    tiktok: {
      title: 'Bible Song Pro Tutorials on TikTok',
      subtitle: 'Short, practical Bible Song Pro clips for learning a feature without stopping your workflow.',
      socialLabel: 'TikTok Profile',
      channelName: '@johnsonolakotan',
      channelAvatar: 'https://unavatar.io/tiktok/johnsonolakotan',
      emptyText: 'TikTok may require sign-in before showing posts here. Open the profile in your browser for the latest Bible Song Pro clips.'
    }
  };

  let tutorialDataLoaded = false;
  let tutorialRefreshPromise = null;
  let tutorialItemsByPlatform = clonePlatformData(TUTORIAL_SEED_DATA);
  let activeTutorialPlatform = 'youtube';
  let tutorialNavResizeBound = false;

  function safeText(text) {
    return String(text || '').trim();
  }

  function clonePlatformData(data) {
    return TUTORIAL_PLATFORMS.reduce((out, platform) => {
      out[platform] = Array.isArray(data && data[platform])
        ? data[platform].map(item => normalizeTutorialItem(item)).filter(Boolean)
        : [];
      return out;
    }, {});
  }

  function normalizeCount(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
    const compact = String(value).trim().toUpperCase().replace(/,/g, '');
    const match = compact.match(/([0-9]+(?:\.[0-9]+)?)([KMB])?/);
    if (!match) return null;
    const base = Number(match[1]);
    if (!Number.isFinite(base)) return null;
    const multiplier = match[2] === 'K' ? 1000 : match[2] === 'M' ? 1000000 : match[2] === 'B' ? 1000000000 : 1;
    return Math.round(base * multiplier);
  }

  function shortDate(isoOrDate) {
    const date = new Date(isoOrDate);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatCompactNumber(value) {
    const num = normalizeCount(value);
    if (num === null) return '0';
    if (num < 1000) return String(Math.round(num));
    if (num < 1000000) return `${(num / 1000).toFixed(num >= 100000 ? 0 : 1)}K`;
    if (num < 1000000000) return `${(num / 1000000).toFixed(num >= 100000000 ? 0 : 1)}M`;
    return `${(num / 1000000000).toFixed(1)}B`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function readCachedTutorialData() {
    try {
      const raw = localStorage.getItem(TUTORIAL_CACHE_KEY);
      if (!raw) {
        const oldRaw = localStorage.getItem(TUTORIAL_OLD_CACHE_KEY);
        if (!oldRaw) return null;
        const oldItems = JSON.parse(oldRaw);
        if (!Array.isArray(oldItems)) return null;
        return { youtube: oldItems.map(normalizeTutorialItem).filter(Boolean), instagram: [], tiktok: [] };
      }
      const parsed = JSON.parse(raw);
      const data = parsed && parsed.items ? parsed.items : parsed;
      const normalized = clonePlatformData(data);
      const hasAny = TUTORIAL_PLATFORMS.some(platform => normalized[platform].length > 0);
      return hasAny ? normalized : null;
    } catch (_) {
      return null;
    }
  }

  function writeCachedTutorialData(data) {
    try {
      const compact = clonePlatformData(data);
      TUTORIAL_PLATFORMS.forEach(platform => {
        compact[platform] = compact[platform].slice(0, 80);
      });
      localStorage.setItem(TUTORIAL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: compact }));
    } catch (_) {}
  }

  function pickFirstText(parent, selectors) {
    if (!parent || !Array.isArray(selectors)) return '';
    for (let i = 0; i < selectors.length; i += 1) {
      const node = parent.querySelector(selectors[i]);
      const text = safeText(node && node.textContent);
      if (text) return text;
    }
    return '';
  }

  function pickFirstAttribute(parent, selectors, attrName) {
    if (!parent || !Array.isArray(selectors) || !attrName) return '';
    for (let i = 0; i < selectors.length; i += 1) {
      const node = parent.querySelector(selectors[i]);
      const value = safeText(node && node.getAttribute && node.getAttribute(attrName));
      if (value) return value;
    }
    return '';
  }

  function setTutorialStatus(message) {
    const el = getElement('tutorial-status');
    if (el) el.textContent = safeText(message);
  }

  function setTutorialBanner(platformKey) {
    const meta = TUTORIAL_PAGE_META[platformKey] || TUTORIAL_PAGE_META.youtube;
    const titleEl = getElement('tutorial-banner-title');
    const subtitleEl = getElement('tutorial-banner-subtitle');
    if (titleEl) titleEl.textContent = meta.title;
    if (subtitleEl) subtitleEl.textContent = meta.subtitle;
  }

  function updateTutorialNavIndicator() {
    const shell = getElement('tutorial-nav-shell');
    const indicator = getElement('tutorial-nav-indicator');
    if (!shell || !indicator) return;
    const activeBtn = shell.querySelector('.tutorial-nav-btn.active');
    if (!activeBtn) {
      indicator.style.opacity = '0';
      return;
    }
    indicator.style.opacity = '1';
    indicator.style.width = `${activeBtn.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
  }

  function getPlatformVideos(platformKey) {
    const platform = TUTORIAL_PAGE_META[platformKey] ? platformKey : 'youtube';
    return Array.isArray(tutorialItemsByPlatform[platform]) ? tutorialItemsByPlatform[platform] : [];
  }

  function ensureTutorialPlayerDialog() {
    let overlay = getElement('tutorial-player-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'tutorial-player-overlay';
    overlay.className = 'tutorial-player-overlay';
    overlay.innerHTML = [
      '<div class="tutorial-player-dialog" role="dialog" aria-modal="true" aria-label="Tutorial video player">',
      '  <div class="tutorial-player-head">',
      '    <div class="tutorial-player-title" id="tutorial-player-title"></div>',
      '    <button type="button" class="tutorial-player-close" id="tutorial-player-close" aria-label="Close tutorial video">&times;</button>',
      '  </div>',
      '  <div class="tutorial-player-frame-wrap">',
      '    <iframe id="tutorial-player-frame" class="tutorial-player-frame" src="about:blank" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    const closeBtn = getElement('tutorial-player-close');
    if (closeBtn) closeBtn.addEventListener('click', closeTutorialPlayer);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeTutorialPlayer();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeTutorialPlayer();
    });
    return overlay;
  }

  function closeTutorialPlayer() {
    const overlay = getElement('tutorial-player-overlay');
    const frame = getElement('tutorial-player-frame');
    if (frame) frame.src = 'about:blank';
    if (overlay) overlay.classList.remove('visible');
  }

  function playTutorialVideo(videoId, title, videoUrl) {
    if (!videoId) return;
    const item = getPlatformVideos('youtube').find(video => video.videoId === videoId);
    const link = safeText(videoUrl) || (item && item.videoUrl ? item.videoUrl : `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
    openExternal(link);
  }

  async function openExternal(url) {
    if (!url) return;
    if (window.BSPDesktop && typeof window.BSPDesktop.openExternalUrl === 'function') {
      const result = await window.BSPDesktop.openExternalUrl(url);
      if (result && result.ok) return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function renderEmptyPlatform(platformKey, meta, socialUrl) {
    const safeTextValue = escapeHtml(meta.emptyText || 'No tutorials are available right now.');
    const safeLabel = escapeHtml(meta.socialLabel || 'Open Profile');
    const safeUrl = escapeHtml(socialUrl);
    return [
      '<div class="tutorial-empty-state">',
      `  <div class="tutorial-empty-title">${safeTextValue}</div>`,
      `  <button type="button" class="tutorial-social-link tutorial-empty-link" data-action="open-social" data-link="${safeUrl}">${safeLabel}</button>`,
      '</div>'
    ].join('');
  }

  function renderTutorialCards(platformKey) {
    const grid = getElement('tutorial-grid');
    if (!grid) return;
    const platform = TUTORIAL_PAGE_META[platformKey] ? platformKey : 'youtube';
    const items = getPlatformVideos(platform);
    const meta = TUTORIAL_PAGE_META[platform] || TUTORIAL_PAGE_META.youtube;
    const socialUrl = TUTORIAL_SOCIAL_LINKS[platform] || TUTORIAL_SOCIAL_LINKS.youtube;
    const fallbackAvatar = meta.channelAvatar || '';
    const fallbackChannelName = meta.channelName || 'Bible Song Pro';

    if (!items.length) {
      grid.innerHTML = renderEmptyPlatform(platform, meta, socialUrl);
      setTutorialStatus('');
      return;
    }

    grid.innerHTML = items.map(item => {
      const published = shortDate(item.publishedAt);
      const safeTitle = escapeHtml(item.title);
      const safeThumb = escapeHtml(item.thumbnailUrl);
      const safeLink = escapeHtml(item.videoUrl);
      const safeVideoId = escapeHtml(item.videoId);
      const safeDesc = escapeHtml(item.description || 'Bible Song Pro tutorial video.');
      const safeAvatar = escapeHtml(item.channelAvatarUrl || fallbackAvatar);
      const safeChannel = escapeHtml(item.channelName || fallbackChannelName);
      const safeLikes = escapeHtml(formatCompactNumber(item.likeCount));
      const safeComments = escapeHtml(formatCompactNumber(item.commentCount));
      const safeViews = escapeHtml(formatCompactNumber(item.viewCount));
      const safePublished = escapeHtml(published || 'Recent');
      const thumbAction = platform === 'youtube' ? 'play' : 'open-video';
      const safeOpenLabel = platform === 'youtube' ? 'Open' : `Open ${platform === 'tiktok' ? 'TikTok' : 'Instagram'}`;

      return [
        '<article class="tutorial-card">',
        `  <div class="tutorial-thumb-wrap" data-action="${thumbAction}" data-video-id="${safeVideoId}" data-video-title="${safeTitle}" data-link="${safeLink}">`,
        `    <img class="tutorial-thumb" src="${safeThumb}" alt="${safeTitle}" loading="lazy" />`,
        `    <span class="tutorial-tag">${platform.toUpperCase()}</span>`,
        platform === 'youtube' ? '    <span class="tutorial-play-btn">▶</span>' : '',
        `    <button type="button" class="tutorial-open-chip" data-action="open-video" data-link="${safeLink}">${safeOpenLabel}</button>`,
        '  </div>',
        '  <div class="tutorial-card-body">',
        '    <div class="tutorial-channel-row">',
        `      <img class="tutorial-channel-avatar" src="${safeAvatar}" alt="${safeChannel}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';"/>`,
        `      <span class="tutorial-channel-fallback">${safeChannel.slice(0, 2).toUpperCase()}</span>`,
        '      <div class="tutorial-channel-meta">',
        `        <div class="tutorial-channel-name">${safeChannel}</div>`,
        `        <div class="tutorial-channel-date">${safePublished}</div>`,
        '      </div>',
        '    </div>',
        `    <div class="tutorial-card-title">${safeTitle}</div>`,
        `    <div class="tutorial-card-desc">${safeDesc}</div>`,
        '    <div class="tutorial-stats-row">',
        `      <span class="tutorial-stat"><span class="tutorial-stat-icon tutorial-stat-icon-like"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/><path d="M7 11l4.1-8.2A2 2 0 0 1 15 3.6V9h4.5a2 2 0 0 1 2 2.3l-1.4 8a2 2 0 0 1-2 1.7H7V11z"/></svg></span>${safeLikes}</span>`,
        `      <span class="tutorial-stat"><span class="tutorial-stat-icon tutorial-stat-icon-comment"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg></span>${safeComments}</span>`,
        `      <span class="tutorial-stat"><span class="tutorial-stat-icon tutorial-stat-icon-eye"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></span>${safeViews}</span>`,
        `      <button type="button" class="tutorial-social-link" data-action="open-social" data-link="${escapeHtml(socialUrl)}">${escapeHtml(meta.socialLabel)}</button>`,
        '    </div>',
        '  </div>',
        '</article>'
      ].join('');
    }).join('');

    const loadingSuffix = tutorialRefreshPromise ? ' Refreshing...' : '';
    if (platform === 'youtube') {
      setTutorialStatus(`${items.length} tutorials loaded from your YouTube playlist.${loadingSuffix}`);
      return;
    }
    setTutorialStatus(`${items.length} native ${platform === 'tiktok' ? 'TikTok' : 'Instagram'} tutorial posts shown.${loadingSuffix}`);
  }

  function bindTutorialInteractions() {
    const topbar = document.querySelector('.tutorial-topbar');
    if (topbar && !topbar.dataset.bound) {
      topbar.dataset.bound = '1';
      topbar.addEventListener('click', function (event) {
        const btn = event.target.closest('.tutorial-nav-btn');
        if (!btn) return;
        const platform = safeText(btn.dataset.tutorialPlatform) || 'youtube';
        switchTutorialPlatform(platform);
      });
      if (!tutorialNavResizeBound) {
        tutorialNavResizeBound = true;
        window.addEventListener('resize', function () {
          window.requestAnimationFrame(updateTutorialNavIndicator);
        });
      }
    }

    const grid = getElement('tutorial-grid');
    if (grid && !grid.dataset.bound) {
      grid.dataset.bound = '1';
      grid.addEventListener('click', function (event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        const action = safeText(target.dataset.action);
        const link = safeText(target.dataset.link);
        const videoId = safeText(target.dataset.videoId);
        const title = safeText(target.dataset.videoTitle);
        if (action === 'play') {
          playTutorialVideo(videoId, title, link);
          return;
        }
        if (action === 'open-video' && link) {
          openExternal(link);
          return;
        }
        if (action === 'open-social') openExternal(link);
      });
    }
  }

  async function fetchRemoteText(url, timeoutMs) {
    const effectiveTimeout = Math.max(2500, Math.min(15000, Number(timeoutMs) || 6500));
    if (window.BSPDesktop && typeof window.BSPDesktop.fetchRemoteText === 'function') {
      const result = await window.BSPDesktop.fetchRemoteText(url, { timeoutMs: effectiveTimeout });
      if (!result || result.ok !== true) {
        const message = result && result.error ? String(result.error) : `Request failed${result && result.status ? ` (${result.status})` : ''}.`;
        throw new Error(message);
      }
      return String(result.text || '');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-cache',
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error(`Request failed (${response.status}).`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function parseRss2JsonPayload(jsonText) {
    const parsed = JSON.parse(String(jsonText || '{}'));
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items.map(item => {
      const link = safeText(item.link);
      const matched = link.match(/(?:v=|\/shorts\/)([A-Za-z0-9_-]{6,})/);
      const videoId = safeText(matched && matched[1]);
      if (!videoId) return null;
      return normalizeTutorialItem({
        platform: 'youtube',
        title: safeText(item.title),
        publishedAt: safeText(item.pubDate),
        videoId,
        videoUrl: link || `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        thumbnailUrl: safeText(item.thumbnail) || `https://i4.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
        description: safeText(item.description),
        channelName: TUTORIAL_PAGE_META.youtube.channelName,
        channelAvatarUrl: TUTORIAL_PAGE_META.youtube.channelAvatar
      });
    }).filter(Boolean);
  }

  function normalizeTutorialItem(item) {
    if (!item || !item.title || !item.videoUrl) return null;
    const videoId = safeText(item.videoId);
    const staticStats = TUTORIAL_STATIC_STATS[videoId] || {};
    let viewCount = normalizeCount(item.viewCount);
    let likeCount = normalizeCount(item.likeCount);
    let commentCount = normalizeCount(item.commentCount);
    if ((viewCount === null || viewCount === 0) && normalizeCount(staticStats.viewCount) > 0) {
      viewCount = normalizeCount(staticStats.viewCount);
    }
    if ((likeCount === null || likeCount === 0) && normalizeCount(staticStats.likeCount) > 0) {
      likeCount = normalizeCount(staticStats.likeCount);
    }
    if (commentCount === null && staticStats.commentCount !== undefined) {
      commentCount = normalizeCount(staticStats.commentCount);
    }
    return {
      platform: safeText(item.platform || 'youtube'),
      title: safeText(item.title),
      publishedAt: safeText(item.publishedAt),
      videoId,
      videoUrl: safeText(item.videoUrl),
      thumbnailUrl: safeText(item.thumbnailUrl) || 'assets/showcase/rendered/interface-01-card.png',
      description: safeText(item.description),
      channelName: safeText(item.channelName),
      channelAvatarUrl: safeText(item.channelAvatarUrl),
      viewCount,
      likeCount,
      commentCount
    };
  }

  function parseYouTubePlaylistXml(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    if (xmlDoc.querySelector('parsererror')) throw new Error('Unable to parse playlist feed.');

    const entries = Array.from(xmlDoc.querySelectorAll('entry'));
    return entries.map(entry => {
      const title = pickFirstText(entry, ['title', 'media\\:title']);
      const publishedAt = pickFirstText(entry, ['published', 'updated']);
      const videoId = pickFirstText(entry, ['yt\\:videoId', 'videoId']);
      const videoUrl = pickFirstAttribute(entry, ['link[rel="alternate"]', 'link'], 'href') || `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      const description = pickFirstText(entry, ['media\\:description', 'description']);
      const thumbFromFeed = pickFirstAttribute(entry, ['media\\:thumbnail', 'thumbnail'], 'url');
      const channelName = pickFirstText(entry, ['author > name', 'name']) || TUTORIAL_PAGE_META.youtube.channelName;
      const viewCountRaw = pickFirstAttribute(entry, ['media\\:community > media\\:statistics', 'media\\:statistics', 'statistics'], 'views');
      const ratingCountRaw = pickFirstAttribute(entry, ['media\\:community > media\\:starRating', 'media\\:starRating', 'starRating'], 'count');
      const commentCountRaw = pickFirstAttribute(entry, ['media\\:community > media\\:comments', 'media\\:comments', 'comments'], 'count');
      return normalizeTutorialItem({
        platform: 'youtube',
        title,
        publishedAt,
        videoId,
        videoUrl,
        thumbnailUrl: videoId ? (thumbFromFeed || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`) : '',
        description,
        channelName,
        channelAvatarUrl: TUTORIAL_PAGE_META.youtube.channelAvatar,
        viewCount: viewCountRaw,
        likeCount: ratingCountRaw,
        commentCount: commentCountRaw
      });
    }).filter(Boolean);
  }

  function parseSourcePayload(source, rawText) {
    if (source.format === 'rss2json') return parseRss2JsonPayload(rawText);
    if (source.format === 'allorigins-get') {
      const wrapped = JSON.parse(String(rawText || '{}'));
      return parseYouTubePlaylistXml(safeText(wrapped && wrapped.contents));
    }
    return parseYouTubePlaylistXml(rawText);
  }

  function hasYouTubeStats(items) {
    return Array.isArray(items) && items.some(item => (
      normalizeCount(item && item.viewCount) > 0 ||
      normalizeCount(item && item.likeCount) > 0 ||
      normalizeCount(item && item.commentCount) > 0
    ));
  }

  async function fetchPlaylistVideos() {
    return await new Promise((resolve, reject) => {
      let failures = 0;
      const errors = [];
      let statlessResult = null;
      TUTORIAL_YOUTUBE_FEED_SOURCES.forEach(source => {
        fetchRemoteText(source.url, 6500)
          .then(rawText => {
            const parsed = parseSourcePayload(source, rawText);
            if (!parsed.length) throw new Error('Source returned no entries.');
            if (hasYouTubeStats(parsed)) {
              resolve(parsed);
              return;
            }
            statlessResult = statlessResult || parsed;
            failures += 1;
            if (failures >= TUTORIAL_YOUTUBE_FEED_SOURCES.length) {
              resolve(statlessResult);
            }
          })
          .catch(error => {
            failures += 1;
            errors.push(error && error.message ? String(error.message) : 'Source failed.');
            if (failures >= TUTORIAL_YOUTUBE_FEED_SOURCES.length) {
              if (statlessResult) {
                resolve(statlessResult);
                return;
              }
              reject(new Error(`Unable to load playlist feed. ${errors.join(' | ')}`));
            }
          });
      });
    });
  }

  function extractJsonScript(html, id) {
    const re = new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i');
    const match = String(html || '').match(re);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch (_) {
      return null;
    }
  }

  function isBspRelated(text) {
    const haystack = safeText(text).toLowerCase();
    return haystack.includes('bible song pro') || haystack.includes('biblesongpro') || haystack.includes('#biblesongpro');
  }

  function parseTikTokProfile(htmlText) {
    const data = extractJsonScript(htmlText, '__UNIVERSAL_DATA_FOR_REHYDRATION__');
    const scope = data && data.__DEFAULT_SCOPE__;
    const detail = scope && (scope['webapp.user-detail'] || scope['webapp.user-detail.UserModule']);
    const userInfo = detail && detail.userInfo;
    const itemList = Array.isArray(userInfo && userInfo.itemList) ? userInfo.itemList : [];
    return itemList.map(item => {
      const desc = safeText(item.desc);
      if (!isBspRelated(`${item.title || ''} ${desc}`)) return null;
      const id = safeText(item.id);
      const stats = item.stats || item.statsV2 || {};
      const author = safeText(item.author && (item.author.uniqueId || item.author.nickname)) || TUTORIAL_PAGE_META.tiktok.channelName;
      const cover = item.video && (item.video.cover || item.video.dynamicCover || item.video.originCover);
      return normalizeTutorialItem({
        platform: 'tiktok',
        title: desc || 'Bible Song Pro TikTok tutorial',
        publishedAt: item.createTime ? new Date(Number(item.createTime) * 1000).toISOString() : '',
        videoId: id,
        videoUrl: id ? `https://www.tiktok.com/@johnsonolakotan/video/${id}` : TUTORIAL_SOCIAL_LINKS.tiktok,
        thumbnailUrl: safeText(cover) || 'assets/showcase/rendered/auto-lyrics-02-card.png',
        description: desc,
        channelName: author.startsWith('@') ? author : `@${author}`,
        channelAvatarUrl: TUTORIAL_PAGE_META.tiktok.channelAvatar,
        viewCount: stats.playCount,
        likeCount: stats.diggCount,
        commentCount: stats.commentCount
      });
    }).filter(Boolean);
  }

  function parseInstagramProfile(htmlText) {
    const items = [];
    const text = String(htmlText || '');
    const shortcodeRe = /"shortcode"\s*:\s*"([^"]+)"/g;
    let match;
    while ((match = shortcodeRe.exec(text)) && items.length < 24) {
      const code = safeText(match[1]);
      const start = Math.max(0, match.index - 2500);
      const end = Math.min(text.length, match.index + 3500);
      const chunk = text.slice(start, end);
      if (!isBspRelated(chunk)) continue;
      const likeMatch = chunk.match(/"like_count"\s*:\s*(\d+)|"edge_liked_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
      const commentMatch = chunk.match(/"comment_count"\s*:\s*(\d+)|"edge_media_to_comment"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
      const imageMatch = chunk.match(/"display_url"\s*:\s*"([^"]+)"/);
      items.push(normalizeTutorialItem({
        platform: 'instagram',
        title: 'Bible Song Pro Instagram tutorial',
        videoId: code,
        videoUrl: `https://www.instagram.com/p/${code}/`,
        thumbnailUrl: imageMatch ? imageMatch[1].replace(/\\u0026/g, '&') : 'assets/showcase/rendered/languages-card.png',
        description: 'Bible Song Pro tutorial from Instagram.',
        channelName: TUTORIAL_PAGE_META.instagram.channelName,
        channelAvatarUrl: TUTORIAL_PAGE_META.instagram.channelAvatar,
        likeCount: likeMatch && (likeMatch[1] || likeMatch[2]),
        commentCount: commentMatch && (commentMatch[1] || commentMatch[2])
      }));
    }
    return items.filter(Boolean);
  }

  async function fetchTikTokVideos() {
    const html = await fetchRemoteText('https://www.tiktok.com/@johnsonolakotan', 6500);
    return parseTikTokProfile(html);
  }

  async function fetchInstagramVideos() {
    const html = await fetchRemoteText('https://www.instagram.com/johnsonolakotan/', 6500);
    return parseInstagramProfile(html);
  }

  function parseYouTubeStats(htmlText) {
    const text = String(htmlText || '');
    const likeMatch = text.match(/"likeCount"\s*:\s*"(\d+)"/) || text.match(/"accessibilityData"\s*:\s*\{\s*"label"\s*:\s*"([0-9.,KMB]+)\s+likes?"/i);
    const viewMatch = text.match(/"viewCount"\s*:\s*"(\d+)"/) || text.match(/"simpleText"\s*:\s*"([0-9.,KMB]+)\s+views?"/i);
    const commentMatch = text.match(/"commentCount"\s*:\s*"(\d+)"/) || text.match(/"commentCount"\s*:\s*(\d+)/);
    return {
      likeCount: normalizeCount(likeMatch && likeMatch[1]),
      viewCount: normalizeCount(viewMatch && viewMatch[1]),
      commentCount: normalizeCount(commentMatch && commentMatch[1])
    };
  }

  async function fetchYouTubeStatsHtml(videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const sources = [
      watchUrl,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(watchUrl)}`,
      `https://api.allorigins.win/get?url=${encodeURIComponent(watchUrl)}`,
      `https://r.jina.ai/http://r.jina.ai/http://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    ];

    for (let i = 0; i < sources.length; i += 1) {
      try {
        const raw = await fetchRemoteText(sources[i], 5000);
        if (sources[i].includes('api.allorigins.win/get')) {
          const wrapped = JSON.parse(String(raw || '{}'));
          const contents = String((wrapped && wrapped.contents) || '');
          if (contents) return contents;
        } else if (raw) {
          return raw;
        }
      } catch (_) {}
    }
    return '';
  }

  async function enrichYouTubeStats(items) {
    const targets = items.slice(0, 24);
    const enriched = await Promise.all(targets.map(async item => {
      if (!item.videoId) return item;
      try {
        const html = await fetchYouTubeStatsHtml(item.videoId);
        const stats = parseYouTubeStats(html);
        return {
          ...item,
          viewCount: stats.viewCount !== null ? stats.viewCount : item.viewCount,
          likeCount: stats.likeCount !== null ? stats.likeCount : item.likeCount,
          commentCount: stats.commentCount !== null ? stats.commentCount : item.commentCount
        };
      } catch (_) {
        return item;
      }
    }));
    return enriched.concat(items.slice(targets.length));
  }

  async function refreshTutorialData() {
    if (tutorialRefreshPromise) return tutorialRefreshPromise;
    tutorialRefreshPromise = (async () => {
      try {
        const next = clonePlatformData(tutorialItemsByPlatform);
        const settle = promise => promise
          .then(value => ({ status: 'fulfilled', value }))
          .catch(reason => ({ status: 'rejected', reason }));
        const [youtubeResult, instagramResult, tiktokResult] = await Promise.all([
          settle(fetchPlaylistVideos()),
          settle(fetchInstagramVideos()),
          settle(fetchTikTokVideos())
        ]);
        if (youtubeResult.status === 'fulfilled' && youtubeResult.value.length) {
          next.youtube = youtubeResult.value;
          renderTutorialCards(activeTutorialPlatform);
          next.youtube = await enrichYouTubeStats(next.youtube);
        }
        if (instagramResult.status === 'fulfilled') next.instagram = instagramResult.value;
        if (tiktokResult.status === 'fulfilled') next.tiktok = tiktokResult.value;
        tutorialItemsByPlatform = next;
        tutorialDataLoaded = true;
        writeCachedTutorialData(tutorialItemsByPlatform);
      } finally {
        tutorialRefreshPromise = null;
        renderTutorialCards(activeTutorialPlatform);
      }
    })();
    renderTutorialCards(activeTutorialPlatform);
    return tutorialRefreshPromise;
  }

  function ensureTutorialData() {
    if (!tutorialDataLoaded) {
      const cached = readCachedTutorialData();
      if (cached) {
        tutorialItemsByPlatform = cached;
      }
      tutorialDataLoaded = true;
    }
    refreshTutorialData().catch(() => {});
  }

  async function switchTutorialPlatform(platformKey) {
    activeTutorialPlatform = (platformKey || 'youtube').toLowerCase();
    document.querySelectorAll('.tutorial-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tutorialPlatform === activeTutorialPlatform);
    });
    window.requestAnimationFrame(updateTutorialNavIndicator);
    setTutorialBanner(activeTutorialPlatform);
    ensureTutorialData();
    renderTutorialCards(activeTutorialPlatform);
  }

  async function initTutorialHub() {
    if (!getElement('tutorial-shell')) return;
    bindTutorialInteractions();
    window.requestAnimationFrame(updateTutorialNavIndicator);
    await switchTutorialPlatform(activeTutorialPlatform);
  }

  window.switchTutorialPlatform = switchTutorialPlatform;
  window.initTutorialHub = initTutorialHub;

  document.addEventListener('DOMContentLoaded', function () {
    initTutorialHub();
  });
})();
