    function remoteShowLog(event, details) {
      const ts = new Date().toISOString();
      const line = `[${ts}] ${event}${details ? ` | ${details}` : ''}`;
      remoteShowDebugLog.push(line);
      if (remoteShowDebugLog.length > 100) remoteShowDebugLog.shift();
      console.log('[RemoteShow]', event, details || '');
      const logEl = document.getElementById('remote-show-debug-log');
      if (logEl) logEl.textContent = remoteShowDebugLog.slice(-25).join('\n') || 'No events yet.';
    }

    function normalizePairCode(raw) {
      const cleaned = String(raw || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 32).toUpperCase();
      return cleaned;
    }

    function generatePairCode() {
      const randomSix = String(Math.floor(100000 + Math.random() * 900000));
      return randomSix.slice(0, REMOTE_SHOW_PAIR_CODE_LENGTH);
    }

    function ensureRemoteShowCredentials() {
      const pairCodeInput = document.getElementById('remote-show-pair-code');
      if (!pairCodeInput) return;
      // When the panel is served by the BSP server (/panel?pair=CODE), the URL carries
      // the server's pairing code — it wins over anything stored, so the page arrives
      // already paired instead of being kicked in a loop by the strict relay.
      let urlCode = '';
      try { urlCode = normalizePairCode(new URLSearchParams(window.location.search).get('pair') || ''); } catch (_) {}
      let code = urlCode || normalizePairCode(pairCodeInput.value);
      if (!code) code = generatePairCode();
      pairCodeInput.value = code;
      remoteShowSessionId = `session_${code.toLowerCase()}`;
    }

    function getRemoteShowPairCode() {
      ensureRemoteShowCredentials();
      const value = document.getElementById('remote-show-pair-code')?.value || '';
      return normalizePairCode(value);
    }

    function setRemoteShowConnectionState(nextState, reason = '') {
      remoteShowConnectionState = nextState;
      if (reason) remoteShowLastError = reason;
      if (nextState === 'connected') remoteShowLastError = '';
      const map = {
        idle: 'disabled',
        resolving: 'connecting',
        connecting: 'connecting',
        connected: 'connected',
        degraded: 'error',
        error: 'error'
      };
      relayStatus = map[nextState] || 'disconnected';
      updateRelayUi();
      const stateEl = document.getElementById('remote-show-conn-state');
      if (stateEl) stateEl.textContent = nextState;
      const errEl = document.getElementById('remote-show-last-error');
      if (errEl) errEl.textContent = remoteShowLastError || 'None';
      if (typeof window.updateAiRelayDebugState === 'function') {
        const suffix = reason ? ` (${reason})` : '';
        window.updateAiRelayDebugState({ relay: `${nextState}${suffix}` });
      }
    }

    function parsePort(value, fallback) {
      const n = Number(String(value || '').trim());
      if (!Number.isInteger(n) || n < 1 || n > 65535) return String(fallback);
      return String(n);
    }

    function getHttpPort() {
      const inputVal = document.getElementById('remote-show-port')?.value;
      const pagePort = window.location.port || '';
      return parsePort(inputVal || pagePort, REMOTE_SHOW_DEFAULT_PORT);
    }

    function getRelayPort() {
      const inputVal = document.getElementById('remote-show-relay-port')?.value;
      return parsePort(inputVal, RELAY_DEFAULT_PORT);
    }

    function resolveNonLocalhostHostname() {
      const host = String(window.location.hostname || '').trim();
      if (!host || isLocalhostHost(host)) return '';
      return host;
    }

    // Addresses the SERVER actually has right now, fetched from /api/info (it enumerates
    // its network interfaces fresh on every request). This is the authoritative, up-to-date
    // source — window.location.hostname is only the one address the panel was reached on,
    // and remoteShowDetectedIp used to be cached once and go stale after a network change.
    let bspServerLanIps = [];
    // Interface choisie par l'opérateur quand le PC a plusieurs réseaux (Wifi + RJ45…).
    // Vide = automatique. Tous les liens (OBS/écran/téléphone/panneau) suivent ce choix,
    // pour qu'un écran câblé reçoive le lien de SON réseau et non celui du Wifi.
    let bspSelectedLanIp = '';
    let bspNetRefreshTimer = null; // polls /api/info while the Connect modal is open (network changes)
    let bspServerHttpPort = '';    // the server's real HTTP port, from /api/info
    let bspServerHttpsPort = '';   // HTTPS port, if the server serves TLS (else '')
    let bspServerWssPort = '';     // WSS relay port, paired with the HTTPS port
    // Affiche la version installée dans le panneau Updates. Source autoritaire = IPC Electron
    // (app.getVersion) ; repli = /api/info (mode navigateur/OBS). Silencieux si l'élément est
    // absent. Appelé au chargement et à l'ouverture des Settings pour rester à jour.
    async function bspRefreshAppVersion() {
      const el = document.getElementById('settings-app-version');
      if (!el) return;
      let v = '';
      try {
        if (typeof window !== 'undefined' && window.bspDesktop && typeof window.bspDesktop.info === 'function') {
          const info = await window.bspDesktop.info();
          if (info && info.version) v = String(info.version);
        }
      } catch (_) {}
      if (!v && window.location.protocol !== 'file:') {
        try {
          const r = await fetch('/api/info', { cache: 'no-store' });
          if (r.ok) { const j = await r.json(); if (j && j.appVersion && j.appVersion !== '?') v = String(j.appVersion); }
        } catch (_) {}
      }
      el.textContent = v ? ('v' + v) : '—';
    }

    async function bspRefreshServerLanIps() {
      if (window.location.protocol === 'file:') return; // no origin to fetch from
      try {
        const r = await fetch('/api/info', { cache: 'no-store' });
        if (!r.ok) return;
        const info = await r.json();
        const next = Array.isArray(info.lan) ? info.lan.filter(Boolean) : [];
        const nextHttpPort = info.httpPort ? String(info.httpPort) : '';
        let changed = JSON.stringify(next) !== JSON.stringify(bspServerLanIps) || nextHttpPort !== bspServerHttpPort;
        // Adopt the SERVER's pairing code (only same-machine callers receive it). The panel
        // must stamp links with the code the server actually enforces — otherwise the phone
        // and OBS get "code refusé" (4401) because the panel used its own local code.
        if (info.pairCode) {
          const norm = normalizePairCode(String(info.pairCode));
          const codeInput = document.getElementById('remote-show-pair-code');
          if (norm && codeInput && normalizePairCode(codeInput.value) !== norm) {
            codeInput.value = norm;
            remoteShowSessionId = `session_${norm.toLowerCase()}`;
            changed = true;
            if (typeof reconnectRelay === 'function') reconnectRelay();
          }
        }
        bspServerLanIps = next;
        // Drop a stale private-LAN IP kept from a previous network (the WebRTC-detected IP and
        // the auto-filled host field) so the shown links track the network the PC is on now.
        if (next.length) {
          const stalePrivate = (ip) => ip && isIpv4Address(ip) && next.indexOf(ip) === -1 &&
            (/^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip));
          if (stalePrivate(remoteShowDetectedIp)) remoteShowDetectedIp = '';
          const hostInput = document.getElementById('remote-show-host');
          if (hostInput && stalePrivate(String(hostInput.value || '').trim())) hostInput.value = '';
        }
        if (nextHttpPort) bspServerHttpPort = nextHttpPort;
        bspServerHttpsPort = info.httpsPort ? String(info.httpsPort) : '';
        bspServerWssPort = info.wssPort ? String(info.wssPort) : '';
        if (changed && typeof updateRemoteShowDetails === 'function') updateRemoteShowDetails();
      } catch (_) { /* server unreachable — keep existing resolution */ }
    }

    // Port for DISPLAY links (OBS, screens). Always plain http on the http port — never the
    // page's port, which is the HTTPS port (5443) when you drive from the https panel.
    function bspHttpPortForLinks() {
      return bspServerHttpPort || getHttpPort();
    }
    // Whether a secure (https/wss) link can be offered (server serves TLS).
    function bspHttpsAvailable() { return !!(bspServerHttpsPort && bspServerWssPort); }
    window.bspHttpPortForLinks = bspHttpPortForLinks;

    function resolveShareUrlHost() {
      const manualHost = String(document.getElementById('remote-show-host')?.value || '').trim();
      const pageHost = resolveNonLocalhostHostname(); // the IP/host the panel is reached on
      // Choix explicite d'interface (PC multi-réseaux) : il prime sur tout le reste tant
      // que le serveur l'expose encore.
      if (bspSelectedLanIp && bspServerLanIps.indexOf(bspSelectedLanIp) !== -1) return bspSelectedLanIp;
      // A manual host wins — UNLESS it is a private-LAN IP the server no longer exposes. That
      // means it was auto-filled on an old network (e.g. the iPhone hotspot 172.20.10.x) and
      // is now stale: ignore it so the links follow the network the PC is actually on. A real
      // hostname, or an IP the server still exposes, is always honoured.
      if (manualHost) {
        const stalePrivate = isIpv4Address(manualHost) && bspServerLanIps.length &&
          bspServerLanIps.indexOf(manualHost) === -1 &&
          (/^192\.168\./.test(manualHost) || /^10\./.test(manualHost) || /^172\.(1[6-9]|2\d|3[01])\./.test(manualHost));
        if (!stalePrivate) return manualHost;
      }
      // Prefer an address the server reports as currently available. When the panel is
      // reached on one of them (multi-NIC), keep THAT one; otherwise take the first.
      if (bspServerLanIps.length) {
        if (pageHost && bspServerLanIps.indexOf(pageHost) !== -1) return pageHost;
        return bspServerLanIps[0];
      }
      if (pageHost) return pageHost;
      if (remoteShowDetectedIp) return remoteShowDetectedIp;
      return '';
    }

    function resolveRelayHost() {
      const manualRelayHost = String(document.getElementById('remote-show-relay-host')?.value || '').trim();
      if (manualRelayHost) return manualRelayHost;
      const manualShareHost = String(document.getElementById('remote-show-host')?.value || '').trim();
      if (manualShareHost) return manualShareHost;
      // The relay is served by the SAME server as this panel, so it lives on the SAME host the
      // panel was loaded from — connect THERE. Using a WebRTC-detected public/LAN IP instead
      // sends the panel's own relay socket to an address it can't reach: on localhost:5510 it
      // tried ws://<public-ip>:5511 and nothing sent. The detected IP is only for SHARE links
      // handed to OTHER devices (resolveShareUrlHost), never for our own relay connection.
      const pageHost = String(window.location.hostname || '').trim();
      if (pageHost && window.location.protocol !== 'file:') return pageHost;
      if (remoteShowDetectedIp) return remoteShowDetectedIp;
      const nonLocal = resolveNonLocalhostHostname();
      if (nonLocal) return nonLocal;
      if (typeof hasDesktopBridgeRuntime === 'function' && hasDesktopBridgeRuntime()) {
        const desktopHost = String(localServerInfo?.preferredHost || '').trim();
        return desktopHost || '127.0.0.1';
      }
	      if (typeof getHostMode === 'function' && typeof HOST_MODE_OBS !== 'undefined' && getHostMode() === HOST_MODE_OBS) {
	        const obsHost = String(window.location.hostname || '').trim();
	        return obsHost || '127.0.0.1';
	      }
	      if (window.location.protocol === 'file:') return '127.0.0.1';
	      return '';
	    }

    function getRelayOverrideFromQuery() {
      let relay = '';
      let relayPort = '';
      try {
        const params = new URLSearchParams(window.location.search || '');
        relay = String(params.get('relay') || '').trim();
        relayPort = String(params.get('relayPort') || '').trim();
      } catch (_) {
        return { host: '', port: '' };
      }

      let host = '';
      let port = '';

      if (relay) {
        try {
          const parsed = new URL(relay);
          if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
            host = parsed.hostname || '';
            port = parsed.port || '';
          }
        } catch (_) {}
      }

      if (!port && relayPort) {
        const cleanPort = String(relayPort).replace(/[^0-9]/g, '');
        if (cleanPort) port = cleanPort;
      }

      return { host: host.trim(), port: port.trim() };
    }

    function applyRelayOverrideFromQuery() {
      const override = getRelayOverrideFromQuery();
      if (!override.host && !override.port) return false;
      if (override.host) {
        const hostInput = document.getElementById('remote-show-relay-host');
        if (hostInput) hostInput.value = override.host;
      }
      if (override.port) {
        const portInput = document.getElementById('remote-show-relay-port');
        if (portInput) portInput.value = override.port;
      }
      return true;
    }

    function openRemoteShowModal() {
      ensureRemoteShowCredentials();
      detectRemoteShowIp();
      bspRefreshServerLanIps(); // pull the server's current LAN addresses so links are fresh
      syncRemoteShowHostMode();
      updateRemoteShowDetails();
      connectRelay();
      openModal('remoteShowModal');
      // Keep the links live while the dialog is open: if the operator switches Wi-Fi (e.g.
      // from an iPhone hotspot to the router), the LAN IP changes and the shown addresses
      // must follow without reopening. Self-clears when the modal closes.
      if (bspNetRefreshTimer) clearInterval(bspNetRefreshTimer);
      bspNetRefreshTimer = setInterval(() => {
        const m = document.getElementById('remoteShowModal');
        if (!m || m.style.display !== 'flex') { clearInterval(bspNetRefreshTimer); bspNetRefreshTimer = null; return; }
        bspRefreshServerLanIps();
      }, 4000);
    }

    function handleRemoteShowInput() {
      ensureRemoteShowCredentials();
      updateRemoteShowDetails();
      reconnectRelay();
      saveToStorageDebounced();
    }

    function handleRemoteShowHostMode() {
      syncRemoteShowHostMode();
      updateRemoteShowDetails();
      reconnectRelay();
      saveToStorageDebounced();
    }

    function syncRemoteShowHostMode() {
      const useHostname = document.getElementById('remote-show-use-hostname')?.checked;
      const hostInput = document.getElementById('remote-show-host');
      if (hostInput) hostInput.disabled = !!useHostname;
      if (!useHostname && hostInput && !hostInput.value && remoteShowDetectedIp) {
        hostInput.value = remoteShowDetectedIp;
      }
      const portInput = document.getElementById('remote-show-port');
      if (portInput && !portInput.value) {
        portInput.value = getHttpPort();
      }
      const relayPortInput = document.getElementById('remote-show-relay-port');
      if (relayPortInput && !relayPortInput.value) {
        relayPortInput.value = getRelayPort();
      }
    }

    function buildRelayUrl() {
      const protocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
      const host = resolveRelayHost();
      const port = getRelayPort();
      if (!host || !port) return '';
      return `${protocol}//${host}:${port}`;
    }

    function isLocalhostHost(host) {
      return !host || host === 'localhost' || host === '127.0.0.1';
    }

    function isIpv4Address(value) {
      if (!value || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
      return value.split('.').every((part) => {
        const num = Number(part);
        return Number.isInteger(num) && num >= 0 && num <= 255;
      });
    }

    function updateRemoteShowDetectedUi() {
      const valueEl = document.getElementById('remote-show-detected-value');
      const useBtn = document.querySelector('#remote-show-detected button');
      if (!valueEl) return;
      if (remoteShowDetectedIp) {
        valueEl.textContent = remoteShowDetectedIp;
        if (useBtn) useBtn.disabled = false;
      } else if (remoteShowDetecting) {
        valueEl.textContent = 'Detecting...';
        if (useBtn) useBtn.disabled = true;
      } else {
        valueEl.textContent = 'Not detected';
        if (useBtn) useBtn.disabled = true;
      }
    }

    function detectRemoteShowIp() {
      if (remoteShowDetecting || remoteShowDetectedIp) {
        updateRemoteShowDetectedUi();
        return;
      }
      const host = window.location.hostname || '';
      if (host && !isLocalhostHost(host) && isIpv4Address(host)) {
        remoteShowDetectedIp = host;
        updateRemoteShowDetectedUi();
        updateRemoteShowDetails();
        connectRelay();
        return;
      }
      if (!window.RTCPeerConnection) {
        updateRemoteShowDetectedUi();
        return;
      }
      remoteShowDetecting = true;
      updateRemoteShowDetectedUi();
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('remote-show');
      const closePc = () => {
        remoteShowDetecting = false;
        try { pc.close(); } catch (e) {}
        updateRemoteShowDetectedUi();
        updateRemoteShowDetails();
      };
      pc.onicecandidate = (event) => {
        const candidate = event.candidate && event.candidate.candidate;
        if (!candidate) return;
        const match = candidate.match(/(?:\d{1,3}\.){3}\d{1,3}/);
        if (match && isIpv4Address(match[0])) {
          remoteShowDetectedIp = match[0];
          closePc();
          connectRelay();
        }
      };
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => {
        closePc();
      });
      setTimeout(() => {
        if (!remoteShowDetectedIp) closePc();
      }, 2500);
    }

    function applyDetectedRemoteShowIp() {
      if (!remoteShowDetectedIp) return;
      const useHostname = document.getElementById('remote-show-use-hostname');
      if (useHostname) useHostname.checked = false;
      const hostInput = document.getElementById('remote-show-host');
      if (hostInput) hostInput.value = remoteShowDetectedIp;
      syncRemoteShowHostMode();
      updateRemoteShowDetails();
      reconnectRelay();
      saveToStorageDebounced();
    }

    function buildRemoteShowUrl() {
      const isFile = window.location.protocol === 'file:';
      // On file:// (OBS dock) we can't read a scheme from the page, so derive it: https
      // when the relay is on wss (TLS server), else http. Non-file uses the page's own.
      const protocol = isFile ? `${bspNetworkScheme()}:` : (window.location.protocol || 'http:');
      let path = window.location.pathname || '/';
      if (isFile) {
        const parts = path.split('/');
        const file = parts[parts.length - 1] || '';
        path = file ? `/${file}` : '/';
      }
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      const host = resolveShareUrlHost();
      if (!host) return '';
      const port = getHttpPort();
      const portSegment = port ? `:${port}` : '';
      return `${protocol}//${host}${portSegment}${path}${search}${hash}`;
    }

    function buildRemoteShowQrPrimaryUrl(url) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(url)}`;
    }

    function buildRemoteShowQrFallbackUrl(url) {
      return `https://quickchart.io/qr?size=220&margin=0&text=${encodeURIComponent(url)}`;
    }

    function updateRemoteShowQr(url, qrImg, qrBox) {
      if (!qrImg || !qrBox) return;
      if (!url) {
        qrImg.removeAttribute('src');
        qrImg.removeAttribute('data-qr-fallback');
        qrImg.alt = 'RemoteShow QR';
        qrBox.classList.add('is-empty');
        qrBox.title = '';
        return;
      }

      const primary = buildRemoteShowQrPrimaryUrl(url);
      const fallback = buildRemoteShowQrFallbackUrl(url);
      qrImg.alt = 'RemoteShow QR';
      qrImg.setAttribute('referrerpolicy', 'no-referrer');
      qrImg.setAttribute('crossorigin', 'anonymous');
      qrImg.onload = () => {
        qrBox.classList.remove('is-empty');
        qrBox.title = url;
      };
      qrImg.onerror = () => {
        const hasFallback = qrImg.getAttribute('data-qr-fallback') === '1';
        if (!hasFallback) {
          qrImg.setAttribute('data-qr-fallback', '1');
          qrImg.src = fallback;
          return;
        }
        qrImg.removeAttribute('src');
        qrImg.removeAttribute('data-qr-fallback');
        qrBox.classList.add('is-empty');
        qrBox.title = 'Unable to load QR image. Copy URL instead.';
      };
      qrImg.setAttribute('data-qr-fallback', '0');
      qrImg.src = primary;
    }

    // Schéma des liens réseau : https si la page elle-même est servie en https, OU si le
    // relais est connecté en wss:// (le serveur tourne alors en TLS même quand le panneau
    // est ouvert en file:// depuis le dock OBS). Sinon http. Évite de proposer un lien
    // http:// alors que le serveur n'écoute qu'en HTTPS.
    function bspNetworkScheme() {
      if (window.location.protocol === 'https:') return 'https';
      try {
        if (typeof relaySocket !== 'undefined' && relaySocket &&
            typeof relaySocket.url === 'string' && relaySocket.url.indexOf('wss:') === 0) return 'https';
      } catch (_) {}
      return 'http';
    }

    // Liens du serveur réseau. Un seul format, code d'appairage inclus — copiés tels
    // quels, ils fonctionnent sans autre saisie.
    function bspNetworkLink(kind) {
      // Hôte de partage détecté d'abord ; sinon l'hôte auquel le relais est réellement
      // connecté (vérité terrain) — mais jamais localhost : un QR « 127.0.0.1 » scanné
      // par un téléphone ne mène nulle part.
      let host = resolveShareUrlHost();
      if (!host) {
        const rh = resolveRelayHost();
        if (rh && !isLocalhostHost(rh)) host = rh;
      }
      const pair = getRemoteShowPairCode();
      if (!host || !pair) return '';
      const httpBase = `http://${host}:${bspHttpPortForLinks()}`;
      // A secure link needs the HTTPS port AND its paired WSS relay port (an https page can
      // only open a wss socket). null when the server has no certificates.
      const secure = bspHttpsAvailable() ? `https://${host}:${bspServerHttpsPort}` : '';
      const wssSuffix = bspServerWssPort ? `&relayPort=${bspServerWssPort}` : '';

      // OBS / screens / phone → always plain HTTP on the http port. OBS's CEF can't accept
      // the mkcert certificate, and these devices work fine without a secure context.
      if (kind === 'obs') return `${httpBase}/?outputId=obs&pair=${pair}`;
      if (kind === 'phone') return `${httpBase}/phone?pair=${pair}`;
      // Panel = control → offered on BOTH; the shown link follows how the panel itself is
      // opened (https stays https, so screen detection keeps working on the control PC).
      if (kind === 'panel') {
        return (bspNetworkScheme() === 'https' && secure)
          ? `${secure}/panel?pair=${pair}${wssSuffix}`
          : `${httpBase}/panel?pair=${pair}`;
      }
      return '';
    }

    function bspCopyNetworkLink(kind) {
      const url = bspNetworkLink(kind);
      if (!url) return;
      const input = document.getElementById(kind === 'obs' ? 'bsp-net-obs-url' : 'bsp-net-panel-url');
      if (input) { input.focus(); input.select(); }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url);
        else document.execCommand('copy');
        showToast(t('net_link_copied'));
      } catch (_) {}
    }

    function copyRemoteShowRelayUrl() {
      const url = buildRelayUrl();
      if (!url) {
        showToast(t('remote_show_relay_url_unavailable'));
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast(t('remote_show_relay_url_copied'));
        }).catch(() => {
          fallbackCopyRemoteShowUrl(url, 'remote-show-relay-url', t('remote_show_relay_url_copied'));
        });
        return;
      }
      fallbackCopyRemoteShowUrl(url, 'remote-show-relay-url', t('remote_show_relay_url_copied'));
    }

    function getRemoteShowRetryLabel() {
      if (!relayReconnectTimer || !remoteShowRetryNextAt) return 'Idle';
      const remaining = Math.max(0, Math.ceil((remoteShowRetryNextAt - Date.now()) / 1000));
      return `Retry in ${remaining}s (attempt ${remoteShowRetryAttempt})`;
    }

    function updateRemoteShowStatusPanel() {
      const resolvedEl = document.getElementById('remote-show-resolved');
      const heartbeatEl = document.getElementById('remote-show-heartbeat');
      const retryEl = document.getElementById('remote-show-retry');
      const relayUrlInput = document.getElementById('remote-show-relay-url');
      const relayCopyBtn = document.getElementById('remote-show-copy-relay-btn');
      const shareHost = resolveShareUrlHost();
      const relayHost = resolveRelayHost();
      const httpPort = getHttpPort();
      const relayPort = getRelayPort();
      remoteShowResolved = { shareUrlHost: shareHost, relayHost, httpPort, relayPort };
      if (resolvedEl) {
        const sharePart = shareHost ? `${shareHost}:${httpPort}` : '-';
        const relayPart = relayHost ? `${relayHost}:${relayPort}` : '-';
        resolvedEl.textContent = `Share: ${sharePart} | Relay: ${relayPart}`;
      }
      const relayUrlText = buildRelayUrl();
      if (relayUrlInput) relayUrlInput.value = relayUrlText;
      if (relayCopyBtn) relayCopyBtn.disabled = !relayUrlText;
      if (heartbeatEl) {
        heartbeatEl.textContent = remoteShowLastHeartbeatAt
          ? new Date(remoteShowLastHeartbeatAt).toLocaleTimeString()
          : 'Never';
      }
      if (retryEl) retryEl.textContent = getRemoteShowRetryLabel();
    }

    function updateRelayUi() {
      const el = document.getElementById('remote-show-relay-value');
      const wrap = document.getElementById('remote-show-relay-status');
      if (!el) return;
      const labels = {
        idle: 'Idle',
        resolving: 'Resolving',
        connecting: 'Connecting...',
        connected: 'Connected',
        degraded: 'Degraded',
        error: 'Error'
      };
      el.textContent = labels[remoteShowConnectionState] || 'Idle';
      if (wrap) wrap.title = relayUrl || '';
      updateRemoteShowStatusPanel();
    }

    function startRemoteShowUiTicker() {
      if (remoteShowUiTickTimer) return;
      remoteShowUiTickTimer = setInterval(() => {
        updateRemoteShowStatusPanel();
      }, 1000);
    }

    function stopRemoteShowUiTicker() {
      if (!remoteShowUiTickTimer) return;
      clearInterval(remoteShowUiTickTimer);
      remoteShowUiTickTimer = null;
    }

    function disconnectRelay(opts = {}) {
      const markIdle = !!opts.markIdle;
      const reason = opts.reason || '';
      if (relayReconnectTimer) {
        clearTimeout(relayReconnectTimer);
        relayReconnectTimer = null;
      }
      if (remoteShowHeartbeatTimer) {
        clearInterval(remoteShowHeartbeatTimer);
        remoteShowHeartbeatTimer = null;
      }
      remoteShowPendingPingAt = 0;
      if (relaySocket) {
        try { relaySocket.onopen = null; relaySocket.onclose = null; relaySocket.onerror = null; relaySocket.onmessage = null; } catch (_) {}
        try { relaySocket.close(); } catch (e) {}
      }
      relaySocket = null;
      relayUrl = '';
      if (markIdle) {
        setRemoteShowConnectionState('idle', reason);
        stopRemoteShowUiTicker();
      }
      updateRelayUi();
    }

    function scheduleRelayReconnect(reason = '') {
      if (relayReconnectTimer) return;
      remoteShowRetryAttempt += 1;
      const baseDelay = Math.min(1000 * Math.pow(2, Math.max(0, remoteShowRetryAttempt - 1)), 30000);
      const jitterFactor = 0.85 + (Math.random() * 0.3);
      const delay = Math.round(baseDelay * jitterFactor);
      remoteShowRetryNextAt = Date.now() + delay;
      setRemoteShowConnectionState('degraded', reason || 'Retrying relay connection');
      remoteShowLog('reconnect_scheduled', `${delay}ms`);
      relayReconnectTimer = setTimeout(() => {
        relayReconnectTimer = null;
        connectRelay();
      }, delay);
      updateRelayUi();
    }

    function relayNormalizeInbound(raw) {
      if (!raw || typeof raw !== 'object') return null;
      let payload = raw;
      let envelope = null;
      if (raw.type === 'RS_ENVELOPE') {
        envelope = raw;
        const ver = Number(raw.version || 0);
        if (!Number.isFinite(ver) || ver < 1) {
          remoteShowLog('envelope_rejected', 'Invalid protocol version');
          return null;
        }
        if (!raw.payload || typeof raw.payload !== 'object') return null;
        const pairCode = getRemoteShowPairCode();
        const token = normalizePairCode(raw.token || '');
        // Keep relay interoperable across devices even when local stored pair codes differ.
        // We still log mismatches for diagnostics, but do not hard-reject the payload.
        if (pairCode && token && pairCode !== token) {
          remoteShowLog('envelope_pair_mismatch', `local=${pairCode} remote=${token}`);
        }
        if (raw.sessionId && raw.sessionId !== remoteShowSessionId) {
          remoteShowLog('envelope_session_mismatch', `local=${remoteShowSessionId} remote=${raw.sessionId}`);
        }
        if (raw.senderId && raw.senderId === relayClientId) return null;
        payload = raw.payload;
      }
      if (!payload || typeof payload !== 'object') return null;
      if (typeof payload.type !== 'string' || !payload.type) return null;
      const ts = Number((envelope && envelope.ts) || payload.ts || 0);
      const typeKey = payload.type;
      const lastTs = Number(remoteShowLastSeenTsByType[typeKey] || 0);
      if (ts && lastTs && ts < lastTs) {
        remoteShowLog('stale_rejected', `${typeKey}@${ts} < ${lastTs}`);
        return null;
      }
      if (ts) remoteShowLastSeenTsByType[typeKey] = ts;
      payload.__remoteMeta = {
        viaRelay: true,
        senderId: envelope ? envelope.senderId : '',
        sessionId: envelope ? envelope.sessionId : '',
        ts
      };
      return payload;
    }

    function relaySend(msg) {
      if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) return false;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return false;
      const envelope = {
        type: 'RS_ENVELOPE',
        version: REMOTE_SHOW_PROTOCOL_VERSION,
        senderId: relayClientId,
        sessionId: remoteShowSessionId,
        token: getRemoteShowPairCode(),
        ts: Date.now(),
        payload: msg
      };
      try {
        relaySocket.send(JSON.stringify(envelope));
        return true;
      } catch (e) {
        remoteShowLog('send_error', e && e.message ? e.message : 'send failed');
        return false;
      }
    }

    function sendRemoteShowHeartbeat() {
      if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (remoteShowPendingPingAt && (now - remoteShowPendingPingAt > remoteShowHeartbeatTimeoutMs)) {
        remoteShowLog('heartbeat_timeout', `${now - remoteShowPendingPingAt}ms`);
        setRemoteShowConnectionState('degraded', 'Heartbeat timeout');
        try { relaySocket.close(); } catch (_) {}
        return;
      }
      remoteShowPendingPingAt = now;
      relaySend({ type: 'PING', ts: now });
    }

    function startRemoteShowHeartbeat() {
      if (remoteShowHeartbeatTimer) clearInterval(remoteShowHeartbeatTimer);
      remoteShowHeartbeatTimer = setInterval(sendRemoteShowHeartbeat, remoteShowHeartbeatIntervalMs);
      sendRemoteShowHeartbeat();
    }

    function reconnectRelay() {
      remoteShowRetryAttempt = 0;
      remoteShowRetryNextAt = 0;
      disconnectRelay();
      connectRelay();
    }

    function shouldKeepRelayConnected(opts = {}) {
      const forcedByUrl = applyRelayOverrideFromQuery();
      const forceConnect = !!opts.force;
      const enabled = document.getElementById('remote-show-toggle')?.checked;
      const obsDockAuto =
        typeof getHostMode === 'function' &&
        typeof HOST_MODE_OBS !== 'undefined' &&
        getHostMode() === HOST_MODE_OBS &&
        window.location.protocol !== 'file:';
	      const desktopAuto = typeof hasDesktopBridgeRuntime === 'function' && hasDesktopBridgeRuntime();
	      const localFileAuto = window.location.protocol === 'file:';
	      return !!(enabled || forcedByUrl || forceConnect || obsDockAuto || desktopAuto || localFileAuto);
	    }

    function connectRelay(opts = {}) {
      if (!shouldKeepRelayConnected(opts)) {
        disconnectRelay({ markIdle: true, reason: 'RemoteShow disabled' });
        return;
      }
      ensureRemoteShowCredentials();
      setRemoteShowConnectionState('resolving');
      const host = resolveRelayHost();
      const relayPort = getRelayPort();
      if (!host) {
        setRemoteShowConnectionState('error', 'Relay host is missing. Set Host/IP or wait for LAN detection.');
        updateRelayUi();
        return;
      }
      if (!relayPort) {
        setRemoteShowConnectionState('error', 'Relay port is missing.');
        updateRelayUi();
        return;
      }
      const url = buildRelayUrl();
      if (!url) {
        setRemoteShowConnectionState('error', 'Relay URL could not be built.');
        updateRelayUi();
        return;
      }
      if (relaySocket && relayUrl === url && (relaySocket.readyState === WebSocket.OPEN || relaySocket.readyState === WebSocket.CONNECTING)) {
        updateRelayUi();
        return;
      }
      disconnectRelay();
      relayUrl = url;
      setRemoteShowConnectionState('connecting');
      updateRelayUi();
      remoteShowLog('connect_attempt', url);
      try {
        relaySocket = new WebSocket(url);
      } catch (e) {
        setRemoteShowConnectionState('error', e && e.message ? e.message : 'Relay socket init failed');
        scheduleRelayReconnect('Relay socket init failed');
        return;
      }
      startRemoteShowUiTicker();
      relaySocket.onopen = () => {
        remoteShowRetryAttempt = 0;
        remoteShowRetryNextAt = 0;
        remoteShowPendingPingAt = 0;
        setRemoteShowConnectionState('connected');
        remoteShowLastHeartbeatAt = Date.now();
        remoteShowLog('connected', relayUrl);
        requestRelayState();
        flushRelayStateQueue();
        startRemoteShowHeartbeat();
        relaySend({ type: 'HELLO', role: 'panel', ts: Date.now() });
        // Le serveur BSP est joignable : synchronise la banque d'images/vidéos pour que
        // les payloads réseau puissent référencer /media/<id> au lieu de data URLs.
        if (typeof bspSyncMediaBankToServer === 'function') {
          setTimeout(() => bspSyncMediaBankToServer(), 800);
        }
        // Pousse l'état au téléphone dès que le panneau (re)joint le relais : un téléphone
        // déjà connecté se remplit immédiatement au lieu d'attendre sa prochaine relance.
        if (typeof bspPhoneScheduleSyncBroadcast === 'function') {
          bspPhoneSyncLastHash = ''; // forcer l'envoi même si l'état n'a pas changé
          bspPhoneScheduleSyncBroadcast();
        }
        if (typeof window.bspReplayDisplaySyncState === 'function') {
          window.bspReplayDisplaySyncState('relay open');
          setTimeout(() => window.bspReplayDisplaySyncState && window.bspReplayDisplaySyncState('relay open follow-up'), 350);
          setTimeout(() => window.bspReplayDisplaySyncState && window.bspReplayDisplaySyncState('relay open settle'), 1200);
        }
        if (typeof window.bspPublishAiMode === 'function') window.bspPublishAiMode();
      };
      relaySocket.onclose = (event) => {
        remoteShowLog('closed', `${relayUrl || 'relay'} (${event ? event.code : '?'})`);
        if (remoteShowHeartbeatTimer) {
          clearInterval(remoteShowHeartbeatTimer);
          remoteShowHeartbeatTimer = null;
        }
        // 4401 : le serveur (appairage strict) a refusé notre code. Se reconnecter
        // reproduirait le rejet en boucle — on s'arrête et on le dit à l'opérateur.
        if (event && event.code === 4401) {
          setRemoteShowConnectionState('error', 'Pairing code rejected by server — enter the code shown in the server window');
          return;
        }
        if (shouldKeepRelayConnected()) {
          setRemoteShowConnectionState('degraded', 'Relay connection closed');
          scheduleRelayReconnect('Relay connection closed');
        } else {
          setRemoteShowConnectionState('idle');
        }
      };
      relaySocket.onerror = () => {
        remoteShowLog('socket_error', relayUrl || 'relay');
        setRemoteShowConnectionState('degraded', 'WebSocket error');
      };
      relaySocket.onmessage = (event) => {
        let data = null;
        try { data = JSON.parse(event.data); } catch (e) { return; }
        const payload = relayNormalizeInbound(data);
        if (!payload) return;
        remoteShowLastHeartbeatAt = Date.now();
        if (payload.type === 'PONG') {
          remoteShowPendingPingAt = 0;
          setRemoteShowConnectionState('connected');
          updateRelayUi();
          return;
        }
        if (payload.type === 'PING') {
          relaySend({ type: 'PONG', ts: Date.now() });
          return;
        }
        // Commandes et requêtes du téléphone de contrôle : traitées à part, elles ne
        // sont pas des messages de synchronisation d'affichage.
        if (typeof payload.type === 'string' && payload.type.startsWith('PHONE_') &&
            typeof bspHandlePhoneMessage === 'function') {
          bspHandlePhoneMessage(payload);
          return;
        }
        handleSyncMessage(payload);
      };
    }

    // Peuple le sélecteur d'interface réseau. Caché quand il n'y a qu'une seule IP (cas
    // courant) ; visible dès que le PC expose plusieurs réseaux, pour choisir lequel les
    // liens doivent utiliser.
    function bspRenderNetworkIfacePicker() {
      const wrap = document.getElementById('bsp-net-iface-row');
      const sel = document.getElementById('bsp-net-iface');
      if (!wrap || !sel) return;
      const ips = bspServerLanIps.slice();
      if (ips.length <= 1) {
        wrap.style.display = 'none';
        sel.innerHTML = '';
        return;
      }
      // Si le choix courant a disparu (réseau débranché), on repasse en auto.
      if (bspSelectedLanIp && ips.indexOf(bspSelectedLanIp) === -1) bspSelectedLanIp = '';
      const current = bspSelectedLanIp || resolveShareUrlHost();
      sel.innerHTML = ips.map((ip) =>
        `<option value="${ip}"${ip === current ? ' selected' : ''}>${ip}</option>`
      ).join('');
      wrap.style.display = '';
    }

    window.bspSetNetworkIface = function (ip) {
      bspSelectedLanIp = String(ip || '').trim();
      if (typeof updateRemoteShowDetails === 'function') updateRemoteShowDetails();
    };

    function updateRemoteShowDetails() {
      updateRemoteShowDetectedUi();
      updateRelayUi();
      bspRenderNetworkIfacePicker();
      // Les trois liens du serveur réseau ; le QR est réservé au téléphone (seul
      // appareil qu'on appaire en scannant).
      const url = bspNetworkLink('phone');
      const urlInput = document.getElementById('remote-show-url');
      const qrImg = document.getElementById('remote-show-qr');
      const qrBox = document.getElementById('remote-show-qr-box');
      const copyBtn = document.getElementById('remote-show-copy-btn');
      if (urlInput) urlInput.value = url;
      if (copyBtn) copyBtn.disabled = !url;
      updateRemoteShowQr(url, qrImg, qrBox);
      const obsInput = document.getElementById('bsp-net-obs-url');
      if (obsInput) obsInput.value = bspNetworkLink('obs');
      const panelInput = document.getElementById('bsp-net-panel-url');
      if (panelInput) panelInput.value = bspNetworkLink('panel');
      updateRemoteShowStatusPanel();
      const warning = document.getElementById('remote-show-warning');
      if (warning) {
        let msg = '';
        const useHostname = document.getElementById('remote-show-use-hostname')?.checked;
        const hostname = window.location.hostname || '';
        const usingDetected = useHostname && remoteShowDetectedIp && isLocalhostHost(hostname);
        const shareHost = resolveShareUrlHost();
        const isHotspot = /^172\.20\.10\./.test(shareHost || '');
        if (window.location.protocol === 'file:') {
          msg = 'RemoteShow needs the control panel served over HTTP (not file://).';
        } else if (!url) {
          msg = 'Cannot build share URL. Set Host/IP manually or wait for LAN IP detection.';
        } else if (isHotspot) {
          msg = "⚠️ Adresse de partage de connexion iPhone (172.20.10.x) : les autres appareils ne peuvent pas joindre ce PC (le partage isole les appareils). Connectez le PC à un Wi-Fi/routeur normal pour que le téléphone et OBS distant fonctionnent.";
        } else if (!buildRelayUrl()) {
          msg = 'Cannot build relay URL. Set Relay Host/IP and Relay Port.';
        } else if (usingDetected) {
          msg = 'Localhost only works on this computer. Using detected LAN IP for the link.';
        } else if (useHostname && isLocalhostHost(hostname)) {
          msg = 'Localhost only works on this computer. Use your LAN IP for other devices.';
        } else if (remoteShowConnectionState === 'error') {
          msg = 'Relay is not connected. Check host/IP and relay port.';
        } else if (remoteShowConnectionState === 'degraded') {
          msg = 'Connection degraded. Waiting to reconnect automatically.';
        }
        warning.textContent = msg;
        warning.style.display = msg ? 'block' : 'none';
      }
    }

    function copyRemoteShowUrl() {
      const url = bspNetworkLink('phone');
      if (!url) {
        showToast(t('remote_show_url_unavailable'));
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast(t('remote_show_url_copied'));
        }).catch(() => {
          fallbackCopyRemoteShowUrl(url, 'remote-show-url', t('remote_show_url_copied'));
        });
        return;
      }
      fallbackCopyRemoteShowUrl(url, 'remote-show-url', t('remote_show_url_copied'));
    }

    function testRemoteShowConnection() {
      if (!document.getElementById('remote-show-toggle')?.checked) {
        showToast(t('remote_show_enable_first'));
        return;
      }
      if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) {
        reconnectRelay();
        showToast(t('remote_show_testing_reconnect'));
        return;
      }
      relaySend({ type: 'STATE_REQUEST', ts: Date.now(), sender: 'control', clientId: relayClientId, stateUpdatedAt: appStateUpdatedAt || 0 });
      sendRemoteShowHeartbeat();
      showToast(t('remote_show_connection_test_sent'));
    }

    function fallbackCopyRemoteShowUrl(url, inputId = 'remote-show-url', successMessage = 'RemoteShow URL copied') {
      const input = document.getElementById(inputId);
      if (input) {
        input.focus();
        input.select();
        try {
          document.execCommand('copy');
          showToast(successMessage);
        } catch (e) {
          showToast(t('common_copy_failed'));
        }
        return;
      }
      window.prompt('RemoteShow URL', url);
    }
