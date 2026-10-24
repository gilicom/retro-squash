/**
 * @module input/input
 * Unified input for mouse, keyboard and touch.
 *
 * Desktop: the player runs to wherever the mouse points on the floor; arrow
 * keys / WASD also move. Left click or Space = serve / smash, right click or
 * L = lob, K = drop, P or Escape = pause.
 *
 * Touch: dragging anywhere moves the player relative to the drag (the
 * finger does not need to cover the player). A quick tap = serve / smash.
 * On-screen buttons provide lob and drop.
 *
 * The class only collects intent; the game decides what the intent means.
 */
export class Input {
  /**
   * @param {HTMLElement} surface element receiving pointer events (the canvas)
   * @param {(sx:number, sy:number) => {x:number,z:number}|null} toFloor screen -> court mapper
   */
  constructor(surface, toFloor) {
    this.surface = surface;
    this.toFloor = toFloor;
    /** Absolute desired court position (mouse) or null. */
    this.pointerTarget = null;
    /** Accumulated relative movement (touch), in court metres. */
    this.drag = { x: 0, z: 0 };
    /** Held keys. */
    this.keys = new Set();
    /** Queued one-shot actions: 'primary' | 'lob' | 'drop' | 'pause'. */
    this.actions = [];
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    /** Sensitivity multiplier for touch drags. */
    this.touchGain = 1.6;

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
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, floor, type: e.pointerType, button: e.button });
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
      const floor = this.toFloor(e.clientX, e.clientY);
      if (floor && p.floor) {
        this.drag.x += (floor.x - p.floor.x) * this.touchGain;
        this.drag.z += (floor.z - p.floor.z) * this.touchGain;
      }
      p.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY; p.floor = floor;
    });

    const up = (e) => {
      const p = this._pointers.get(e.pointerId);
      this._pointers.delete(e.pointerId);
      if (!p || e.pointerType === 'mouse') return;
      const dt = performance.now() - p.t;
      if (dt < 260 && p.moved < 12) this.actions.push('primary');
    };
    s.addEventListener('pointerup', up);
    s.addEventListener('pointercancel', up);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ' || k === 'enter') { this.actions.push('primary'); e.preventDefault(); }
      else if (k === 'l' || k === 'shift') this.actions.push('lob');
      else if (k === 'k' || k === 'control') this.actions.push('drop');
      else if (k === 'p' || k === 'escape') this.actions.push('pause');
      if (k.startsWith('arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Called by on-screen buttons. */
  pushAction(action) {
    this.actions.push(action);
  }

  /** Keyboard movement vector in [-1,1] for x and z (z positive = toward the camera). */
  keyboardAxis() {
    const k = this.keys;
    let x = 0, z = 0;
    if (k.has('arrowleft') || k.has('a')) x -= 1;
    if (k.has('arrowright') || k.has('d')) x += 1;
    if (k.has('arrowup') || k.has('w')) z -= 1;
    if (k.has('arrowdown') || k.has('s')) z += 1;
    return { x, z };
  }

  /** Take and clear the accumulated touch drag. */
  takeDrag() {
    const d = { ...this.drag };
    this.drag.x = 0; this.drag.z = 0;
    return d;
  }

  /** Take and clear queued actions. */
  takeActions() {
    const a = this.actions;
    this.actions = [];
    return a;
  }
}
