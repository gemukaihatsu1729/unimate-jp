export interface ControlVector {
  thrustX: number;
  thrustY: number;
  winch: boolean;
}

export class InputManager {
  private readonly touchZone: HTMLElement;
  private readonly stickBase: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly winchBtn: HTMLButtonElement;

  private readonly keys = new Set<string>();
  private stickPointerId: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private stickDx = 0;
  private stickDy = 0;
  private readonly maxRadius = 54;
  private readonly followSlack = 14;

  private winchPointerIds = new Set<number>();
  private onFirstGesture?: () => void;

  constructor(
    touchZone: HTMLElement,
    stickBase: HTMLElement,
    stickKnob: HTMLElement,
    winchBtn: HTMLButtonElement,
    onFirstGesture?: () => void
  ) {
    this.touchZone = touchZone;
    this.stickBase = stickBase;
    this.stickKnob = stickKnob;
    this.winchBtn = winchBtn;
    this.onFirstGesture = onFirstGesture;
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.resetAll);

    this.touchZone.addEventListener('pointerdown', this.handleStickDown);
    window.addEventListener('pointermove', this.handleStickMove);
    window.addEventListener('pointerup', this.handleStickUp);
    window.addEventListener('pointercancel', this.handleStickUp);

    this.winchBtn.addEventListener('pointerdown', this.handleWinchDown);
    window.addEventListener('pointerup', this.handleWinchUp);
    window.addEventListener('pointercancel', this.handleWinchUp);
  }

  private triggerGesture(): void {
    if (this.onFirstGesture) {
      this.onFirstGesture();
    }
  }

  private handleKeyDown = (ev: KeyboardEvent): void => {
    this.triggerGesture();
    this.keys.add(ev.code);
    if (
      ev.code === 'Space' ||
      ev.code === 'ArrowUp' ||
      ev.code === 'ArrowDown' ||
      ev.code === 'ArrowLeft' ||
      ev.code === 'ArrowRight'
    ) {
      ev.preventDefault();
    }
  };

  private handleKeyUp = (ev: KeyboardEvent): void => {
    this.keys.delete(ev.code);
  };

  private handleStickDown = (ev: PointerEvent): void => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    this.triggerGesture();
    if (this.stickPointerId !== null) return;

    this.stickPointerId = ev.pointerId;
    try {
      this.touchZone.setPointerCapture(ev.pointerId);
    } catch {
      // Ignore synthetic events where pointer capture is unavailable
    }

    this.stickOriginX = ev.clientX;
    this.stickOriginY = ev.clientY;
    this.stickDx = 0;
    this.stickDy = 0;

    this.stickBase.style.left = `${ev.clientX}px`;
    this.stickBase.style.top = `${ev.clientY}px`;
    this.stickBase.style.bottom = 'auto';
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
    this.stickBase.classList.add('active');
  };

  private handleStickMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.stickPointerId) return;
    let dx = ev.clientX - this.stickOriginX;
    let dy = ev.clientY - this.stickOriginY;
    const dist = Math.hypot(dx, dy);

    // Dynamic follow-origin keeps quick reverse swipes responsive on touchscreens
    if (dist > this.maxRadius + this.followSlack) {
      const pull = dist - (this.maxRadius + this.followSlack);
      const nx = dx / dist;
      const ny = dy / dist;
      this.stickOriginX += nx * pull;
      this.stickOriginY += ny * pull;
      this.stickBase.style.left = `${this.stickOriginX}px`;
      this.stickBase.style.top = `${this.stickOriginY}px`;
      dx = ev.clientX - this.stickOriginX;
      dy = ev.clientY - this.stickOriginY;
    }

    const clampedDist = Math.hypot(dx, dy);
    if (clampedDist > this.maxRadius) {
      const scale = this.maxRadius / clampedDist;
      this.stickDx = dx * scale;
      this.stickDy = dy * scale;
    } else {
      this.stickDx = dx;
      this.stickDy = dy;
    }
    this.stickKnob.style.transform = `translate(calc(-50% + ${this.stickDx}px), calc(-50% + ${this.stickDy}px))`;
  };

  private handleStickUp = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.stickPointerId) return;
    try {
      if (this.touchZone.hasPointerCapture(ev.pointerId)) {
        this.touchZone.releasePointerCapture(ev.pointerId);
      }
    } catch {
      // Ignore
    }
    this.stickPointerId = null;
    this.stickDx = 0;
    this.stickDy = 0;
    this.stickBase.classList.remove('active');
    this.stickBase.style.left = '';
    this.stickBase.style.top = '';
    this.stickBase.style.bottom = '';
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
  };

  private handleWinchDown = (ev: PointerEvent): void => {
    ev.stopPropagation();
    this.triggerGesture();
    this.winchPointerIds.add(ev.pointerId);
    try {
      this.winchBtn.setPointerCapture(ev.pointerId);
    } catch {
      // Ignore
    }
    this.winchBtn.classList.add('pressed');
  };

  private handleWinchUp = (ev: PointerEvent): void => {
    if (this.winchPointerIds.delete(ev.pointerId)) {
      try {
        if (this.winchBtn.hasPointerCapture(ev.pointerId)) {
          this.winchBtn.releasePointerCapture(ev.pointerId);
        }
      } catch {
        // Ignore
      }
      if (this.winchPointerIds.size === 0) {
        this.winchBtn.classList.remove('pressed');
      }
    }
  };

  resetAll = (): void => {
    this.keys.clear();
    this.stickPointerId = null;
    this.stickDx = 0;
    this.stickDy = 0;
    this.stickBase.classList.remove('active');
    this.stickBase.style.left = '';
    this.stickBase.style.top = '';
    this.stickBase.style.bottom = '';
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
    this.winchPointerIds.clear();
    this.winchBtn.classList.remove('pressed');
  };

  readControl(): ControlVector {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;

    if (kx !== 0 && ky !== 0) {
      const inv = 1 / Math.SQRT2;
      kx *= inv;
      ky *= inv;
    }

    const rawX = this.stickDx / this.maxRadius;
    const rawY = this.stickDy / this.maxRadius;
    const rawMag = Math.hypot(rawX, rawY);
    let sx = 0;
    let sy = 0;
    if (rawMag > 0.06) {
      const shaped = Math.pow(Math.min(1, (rawMag - 0.06) / 0.94), 1.18);
      sx = (rawX / rawMag) * shaped;
      sy = (rawY / rawMag) * shaped;
    }

    const winchKey =
      this.keys.has('Space') ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight');

    return {
      thrustX: rawMag > 0.06 ? sx : kx,
      thrustY: rawMag > 0.06 ? sy : ky,
      winch: winchKey || this.winchPointerIds.size > 0
    };
  }
}
