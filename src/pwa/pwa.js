/**
 * @module pwa/pwa
 * Installable-app plumbing: service-worker registration and updates, the
 * browser's install prompt (or the iOS "add to Home Screen" hint), a screen
 * wake lock for the duration of a match, and fullscreen on touch devices.
 *
 * Everything here is optional and degrades silently: on a desktop browser
 * without any of these APIs the game simply runs as a web page.
 */

/** True when the page runs as an installed app (home-screen icon). */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || navigator.standalone === true;
}

/** iOS Safari has no install prompt; the user adds to the Home Screen by hand. */
export function isIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export class Pwa {
  /**
   * @param {{onInstallable?: (can: boolean, manual: boolean) => void, onUpdate?: () => void}} [cb]
   *   onInstallable(can, manual): an install button can be shown; `manual`
   *   means there is no prompt and the button should show instructions (iOS).
   *   onUpdate(): a new version is installed and waiting.
   */
  constructor(cb = {}) {
    this.cb = cb;
    this.deferredPrompt = null;
    this.registration = null;
    this.waiting = null;
    this.wakeLock = null;
    this.wantWakeLock = false;
    this._bindInstall();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.wantWakeLock) this._requestWakeLock();
    });
  }

  // --------------------------------------------------------- service worker

  /** Register the worker (production builds only; the dev server has none). */
  async register(url) {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register(url, { scope: './' });
      this.registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) this._updateReady(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) this._updateReady(sw);
        });
      });
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      // Look for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch (err) {
      console.warn('service worker registration failed', err);
    }
  }

  _updateReady(sw) {
    this.waiting = sw;
    this.cb.onUpdate?.();
  }

  /** Activate the waiting worker; the page reloads on controllerchange. */
  applyUpdate() {
    this.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }

  // ---------------------------------------------------------------- install

  _bindInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (!isStandalone()) this.cb.onInstallable?.(true, false);
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.cb.onInstallable?.(false, false);
    });
    if (isIOS() && !isStandalone()) queueMicrotask(() => this.cb.onInstallable?.(true, true));
  }

  /** True when a native install prompt can be shown. */
  get canPrompt() {
    return !!this.deferredPrompt;
  }

  /**
   * Show the install prompt.
   * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
   */
  async promptInstall() {
    const p = this.deferredPrompt;
    if (!p) return 'unavailable';
    this.deferredPrompt = null;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome !== 'accepted') this.cb.onInstallable?.(true, false);
    return outcome;
  }

  // -------------------------------------------------------------- wake lock

  /** Keep the screen on while a match is being played. */
  keepAwake(on) {
    this.wantWakeLock = on;
    if (on) this._requestWakeLock(); else this._releaseWakeLock();
  }

  async _requestWakeLock() {
    if (!('wakeLock' in navigator) || this.wakeLock || document.hidden) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch { /* low battery, denied, or not supported */ }
  }

  _releaseWakeLock() {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  // ------------------------------------------------------------- fullscreen

  /** On touch devices running in a browser tab, go fullscreen for the match. */
  enterFullscreen(el = document.documentElement) {
    if (isStandalone() || !window.matchMedia('(pointer: coarse)').matches) return;
    if (document.fullscreenElement) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try { const r = req.call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ }
  }
}
