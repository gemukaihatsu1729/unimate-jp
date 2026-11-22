export interface SlideCallbacks {
  onNitroTrigger: () => void;
  onPauseToggle: () => void;
  onAnyInput: () => void;
}

const DEADZONE_PX = 10;
const MAX_RADIUS_PX = 58;

export class SlideInputManager {
  public inputX = 0;
  public inputY = 0;
  public strength = 0;
  public isTouchSliding = false;

  private activePointerId: number | null = null;
  private anchorX = 0;
  private anchorY = 0;
  private keys = new Set<string>();

  private zoneEl: HTMLElement;
  private indicatorEl: HTMLElement;
  private knobEl: HTMLElement;
  private arrowEl: HTMLElement;

  constructor(private callbacks: SlideCallbacks) {
    this.zoneEl = document.getElementById('slide-zone')!;
    this.indicatorEl = document.getElementById('slide-indicator')!;
    this.knobEl = document.getElementById('slide-knob')!;
    this.arrowEl = document.getElementById('slide-arrow')!;
    this.bindEvents();
  }

  private shouldIgnoreTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return target.closest('button, a, .modal-backdrop:not(.hidden)') !== null;
  }

  private bindEvents(): void {
    this.zoneEl.addEventListener('pointerdown', (ev) => {
      this.callbacks.onAnyInput();
      if (this.activePointerId !== null) return;
      if (this.shouldIgnoreTarget(ev.target)) return;

      this.activePointerId = ev.pointerId;
      this.anchorX = ev.clientX;
      this.anchorY = ev.clientY;
      this.isTouchSliding = true;

      try {
        this.zoneEl.setPointerCapture(ev.pointerId);
      } catch (_) {}

      this.updateSlide(ev.clientX, ev.clientY);
    });

    this.zoneEl.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== this.activePointerId) return;
      this.updateSlide(ev.clientX, ev.clientY);
    });

    const releasePointer = (ev: PointerEvent): void => {
      if (ev.pointerId !== this.activePointerId) return;
      this.clearTouch();
    };
    this.zoneEl.addEventListener('pointerup', releasePointer);
    this.zoneEl.addEventListener('pointercancel', releasePointer);

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.clearTouch();
    });

    window.addEventListener('keydown', (ev) => {
      this.callbacks.onAnyInput();
      const code = ev.code;
      if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
        if (!ev.repeat) this.callbacks.onNitroTrigger();
        return;
      }
      if (code === 'KeyP' || code === 'Escape') {
        if (!ev.repeat) this.callbacks.onPauseToggle();
        return;
      }
      this.keys.add(code);
      this.syncKeyboardVector();
    });

    window.addEventListener('keyup', (ev) => {
      this.keys.delete(ev.code);
      this.syncKeyboardVector();
    });
  }

  private updateSlide(curX: number, curY: number): void {
    let dx = curX - this.anchorX;
    let dy = curY - this.anchorY;
    let dist = Math.hypot(dx, dy);

    // Auto-following floating origin so quick reversals never require dragging back across the screen!
    if (dist > MAX_RADIUS_PX) {
      const pull = dist - MAX_RADIUS_PX;
      const nx = dx / dist;
      const ny = dy / dist;
      this.anchorX += nx * pull;
      this.anchorY += ny * pull;
      dx = curX - this.anchorX;
      dy = curY - this.anchorY;
      dist = MAX_RADIUS_PX;
    }

    if (dist <= DEADZONE_PX) {
      this.inputX = 0;
      this.inputY = 0;
      this.strength = 0;
    } else {
      const norm = (dist - DEADZONE_PX) / (MAX_RADIUS_PX - DEADZONE_PX);
      const clamped = Math.min(1, norm);
      this.inputX = (dx / dist) * clamped;
      this.inputY = (dy / dist) * clamped;
      this.strength = clamped;
    }

    this.renderIndicator(dx, dy, dist);
  }

  private renderIndicator(dx: number, dy: number, dist: number): void {
    this.indicatorEl.classList.add('active');
    this.indicatorEl.style.left = `${this.anchorX}px`;
    this.indicatorEl.style.top = `${this.anchorY}px`;

    const clampDist = Math.min(MAX_RADIUS_PX, dist);
    const kx = dist > 1 ? (dx / dist) * clampDist : 0;
    const ky = dist > 1 ? (dy / dist) * clampDist : 0;
    this.knobEl.style.transform = `translate3d(${kx}px, ${ky}px, 0)`;

    if (dist > DEADZONE_PX) {
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      this.arrowEl.style.opacity = '1';
      this.arrowEl.style.transform = `rotate(${angleDeg}deg)`;
    } else {
      this.arrowEl.style.opacity = '0.25';
    }
  }

  private syncKeyboardVector(): void {
    if (this.activePointerId !== null) return;
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;

    const len = Math.hypot(kx, ky);
    if (len > 0) {
      this.inputX = kx / len;
      this.inputY = ky / len;
      this.strength = 1;
    } else {
      this.inputX = 0;
      this.inputY = 0;
      this.strength = 0;
    }
  }

  private clearTouch(): void {
    this.activePointerId = null;
    this.isTouchSliding = false;
    this.indicatorEl.classList.remove('active');
    this.knobEl.style.transform = 'translate3d(0, 0, 0)';
    this.syncKeyboardVector();
  }

  public reset(): void {
    this.keys.clear();
    this.clearTouch();
    this.inputX = 0;
    this.inputY = 0;
    this.strength = 0;
  }
}
