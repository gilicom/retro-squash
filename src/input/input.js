/**
 * @module input/input
 * Unified input for mouse, keyboard and touch.
 *
 * Desktop: the player runs to wherever the mouse points on the floor; arrow
 * keys / WASD also move. Left click or Space = serve / smash, right click or
 * L = lob, K = drop, P or Escape = pause.
 *
 * Touch: a tap on the court sends the player to that spot (or serves when
 * it is their serve). Pressing and dragging aims the next shot: the drag
 * direction, from the first touch to the finger, becomes the direction the
 * ball is hit in, and an arrow on the floor shows it while the finger is
 * down. The on-screen buttons choose the shot type (smash, lob, drop).
 *
 * The class only collects intent; the game decides what the intent means.
 */

/** Movement (px) under which a touch counts as a tap rather than an aim drag. */
export const TAP_PX = 14;

/** True while a text field has the focus (keys then belong to the field, e.g. the nickname form). */
function isTyping(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export class Input {
  /**
   * @param {HTMLElement} surface element receiving pointer events (the canvas)
   * @param {(sx:number, sy:number) => {x:number,z:number}|null} toFloor screen -> court mapper
   */
  constructor(surface, toFloor) {
    this.surface = surface;
    this.toFloor = toFloor;
    /** Absolute desired court position (mouse), or null. */
    this.pointerTarget = null;
    /** Court position tapped on a touch screen, or null; consumed by the game. */
    this.tapTarget = null;
    /** Aim drag in progress: direction in court metres (not normalised), or null. */
    this.aimLive = null;
    /** Held keys. */
    this.keys = new Set();
    /** Queued one-shot actions: 'primary' | 'lob' | 'drop' | 'smash' | 'pause' | 'tap' | {aim:{dx,dz}}. */
    this.actions = [];
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;

    this._pointers = new Map();
    this._bind();
  }

  _bind() {
    const s = this.surface;
    s.style.touchAction = 'none';
    s.addEventListener('contextmenu', (e) => e.preventDefault());

    s.addEventListener('pointerdown', (e) => {
      s.setPointerCapture?.(e.pointerId);
      const floor = this.toFloor(e.clientX, e.clientY);
      this._pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0, floor0: floor, floor, type: e.pointerType, aiming: false });
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.actions.push('primary');
        else if (e.button === 2) this.actions.push('lob');
        else if (e.button === 1) this.actions.push('drop');
      }
    });

    s.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.isTouch = false;
        this.pointerTarget = this.toFloor(e.clientX, e.clientY);
        return;
      }
      this.isTouch = true;
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
      p.floor = this.toFloor(e.clientX, e.clientY);
      // Only the first (oldest) touch aims; a second finger is for the buttons.
      if (p.moved >= TAP_PX && this._oldest() === p && p.floor0 && p.floor) {
        p.aiming = true;
        this.aimLive = { dx: p.floor.x - p.floor0.x, dz: p.floor.z - p.floor0.z };
      }
    });

    const up = (e) => {
      const p = this._pointers.get(e.pointerId);
      this._pointers.delete(e.pointerId);
      if (!p || e.pointerType === 'mouse') return;
      this.isTouch = true;
      if (p.aiming) {
        const aim = this.aimLive;
        this.aimLive = null;
        if (aim && e.type === 'pointerup' && Math.hypot(aim.dx, aim.dz) > 0.05) this.actions.push({ aim });
      } else if (e.type === 'pointerup') {
        this.tapTarget = p.floor0;
        this.actions.push('tap');
      }
    };
    s.addEventListener('pointerup', up);
    s.addEventListener('pointercancel', up);

    // Physical key codes (e.code) are used so WASD works on any keyboard
    // layout: with a Hebrew layout e.key for the W key is a Hebrew letter.
    window.addEventListener('keydown', (e) => {
      if (e.repeat || isTyping(e.target)) return;
      const c = e.code;
      this.keys.add(c);
      if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') { this.actions.push('primary'); e.preventDefault(); }
      else if (c === 'KeyL' || c === 'ShiftLeft' || c === 'ShiftRight') this.actions.push('lob');
      else if (c === 'KeyK' || c === 'ControlLeft' || c === 'ControlRight') this.actions.push('drop');
      else if (c === 'KeyP' || c === 'Escape') this.actions.push('pause');
      if (c.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.aimLive = null; this._pointers.clear(); });
  }

  _oldest() {
    let best = null;
    for (const p of this._pointers.values()) if (!best || p.t < best.t) best = p;
    return best;
  }

  /** Called by on-screen buttons. */
  pushAction(action) {
    this.actions.push(action);
  }

  /** Keyboard movement vector in [-1,1] for x and z (z positive = toward the camera). */
  keyboardAxis() {
    const k = this.keys;
    let x = 0, z = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) z -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) z += 1;
    return { x, z };
  }

  /** Take and clear the tapped court position. */
  takeTap() {
    const t = this.tapTarget;
    this.tapTarget = null;
    return t;
  }

  /** Take and clear queued actions. */
  takeActions() {
    const a = this.actions;
    this.actions = [];
    return a;
  }
}
