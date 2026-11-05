/** Unified input: touch (joystick + look drag + buttons) and desktop (WASD + mouse). */

export class Input {
  moveX = 0;
  moveY = 0;
  lookDX = 0;
  lookDY = 0;
  firing = false;
  jumpPressed = false;
  reloadPressed = false;
  crouching = false;
  sprinting = false;

  private keys = new Set<string>();
  private stickId = -1;
  private stickOrigin = { x: 0, y: 0 };
  private lookId = -1;
  private lookLast = { x: 0, y: 0 };
  private stickEl = document.getElementById('stick') as HTMLElement;
  private knobEl = document.getElementById('knob') as HTMLElement;
  private enabled = false;
  private maxStick = 52;

  constructor(
    private canvas: HTMLCanvasElement,
    private onPause: () => void,
  ) {
    this.bindTouch();
    this.bindButtons();
    this.bindKeyboard();
    this.bindMouse();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) {
      this.moveX = this.moveY = 0;
      this.firing = false;
      this.crouching = false;
      this.stickId = -1;
      this.lookId = -1;
      this.stickEl.style.display = 'none';
    }
  }

  consumeLook(): { x: number; y: number } {
    const out = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  consumeJump(): boolean {
    const j = this.jumpPressed;
    this.jumpPressed = false;
    return j;
  }

  consumeReload(): boolean {
    const r = this.reloadPressed;
    this.reloadPressed = false;
    return r;
  }

  private bindTouch(): void {
    const el = this.canvas;
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.enabled) return;
        if (e.pointerType === 'mouse' && !('ontouchstart' in window)) return;
        const leftHalf = e.clientX < window.innerWidth * 0.45;
        if (leftHalf && this.stickId === -1) {
          this.stickId = e.pointerId;
          this.stickOrigin = { x: e.clientX, y: e.clientY };
          this.stickEl.style.display = 'block';
          this.stickEl.style.left = `${e.clientX}px`;
          this.stickEl.style.top = `${e.clientY}px`;
          this.knobEl.style.transform = 'translate(0px,0px)';
        } else if (this.lookId === -1) {
          this.lookId = e.pointerId;
          this.lookLast = { x: e.clientX, y: e.clientY };
        }
        el.setPointerCapture?.(e.pointerId);
      },
      { passive: true },
    );

    el.addEventListener(
      'pointermove',
      (e) => {
        if (!this.enabled) return;
        if (e.pointerId === this.stickId) {
          let dx = e.clientX - this.stickOrigin.x;
          let dy = e.clientY - this.stickOrigin.y;
          const d = Math.hypot(dx, dy);
          if (d > this.maxStick) {
            dx = (dx / d) * this.maxStick;
            dy = (dy / d) * this.maxStick;
          }
          this.knobEl.style.transform = `translate(${dx}px,${dy}px)`;
          this.moveX = dx / this.maxStick;
          this.moveY = -dy / this.maxStick;
        } else if (e.pointerId === this.lookId) {
          this.lookDX += e.clientX - this.lookLast.x;
          this.lookDY += e.clientY - this.lookLast.y;
          this.lookLast = { x: e.clientX, y: e.clientY };
        }
      },
      { passive: true },
    );

    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = -1;
        this.moveX = this.moveY = 0;
        this.stickEl.style.display = 'none';
      }
      if (e.pointerId === this.lookId) this.lookId = -1;
    };
    el.addEventListener('pointerup', end, { passive: true });
    el.addEventListener('pointercancel', end, { passive: true });
  }

  private bindButtons(): void {
    const hold = (id: string, onDown: () => void, onUp?: () => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('on');
        onDown();
      });
      const up = (e: Event) => {
        e.preventDefault();
        el.classList.remove('on');
        onUp?.();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };

    hold('btn-fire', () => (this.firing = true), () => (this.firing = false));
    hold('btn-jump', () => (this.jumpPressed = true));
    hold('btn-reload', () => (this.reloadPressed = true));
    hold(
      'btn-crouch',
      () => (this.crouching = true),
      () => (this.crouching = false),
    );

    document.getElementById('btn-pause')?.addEventListener('click', () => this.onPause());
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const k = e.code;
      this.keys.add(k);
      if (k === 'Space') {
        this.jumpPressed = true;
        e.preventDefault();
      }
      if (k === 'KeyR') this.reloadPressed = true;
      if (k === 'KeyC' || k === 'ControlLeft') this.crouching = true;
      if (k === 'Escape') this.onPause();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyC' || e.code === 'ControlLeft') this.crouching = false;
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  private bindMouse(): void {
    this.canvas.addEventListener('click', () => {
      if (!this.enabled) return;
      if ('ontouchstart' in window) return;
      if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.enabled) return;
      if ('ontouchstart' in window) return;
      this.firing = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
  }

  /** Called once per frame before movement: folds keyboard into the analogue values. */
  sample(): void {
    const k = this.keys;
    let kx = 0;
    let ky = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) ky += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) ky -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) kx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) kx -= 1;
    if (kx || ky) {
      const d = Math.hypot(kx, ky);
      this.moveX = kx / d;
      this.moveY = ky / d;
    } else if (this.stickId === -1) {
      this.moveX = 0;
      this.moveY = 0;
    }
    this.sprinting = k.has('ShiftLeft') || k.has('ShiftRight');
  }
}
