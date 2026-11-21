export interface TouchState {
  moveX: number;
  moveY: number;
  cameraDeltaYaw: number;
  attackHeld: boolean;
  attackPressed: boolean;
  strongPressed: boolean;
  dodgePressed: boolean;
  musouPressed: boolean;
  tapScreenPos: { x: number; y: number } | null;
}

export class TouchInputManager {
  private moveX = 0;
  private moveY = 0;
  private cameraDeltaYaw = 0;

  private attackHeld = false;
  private attackQueued = false;
  private strongQueued = false;
  private dodgeQueued = false;
  private musouQueued = false;
  private tapPos: { x: number; y: number } | null = null;

  private joyPointerId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private readonly joyMaxRadius = 46;

  private swipePointerId: number | null = null;
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeLastX = 0;
  private swipeMoved = false;

  private joystickZone: HTMLElement;
  private joystickBase: HTMLElement;
  private joystickKnob: HTMLElement;
  private swipeZone: HTMLElement;

  private attackPointerId: number | null = null;
  private attackEl: HTMLElement | null = null;

  constructor(private onAnyTouch?: () => void) {
    this.joystickZone = document.getElementById('joystick-zone')!;
    this.joystickBase = document.getElementById('joystick-base')!;
    this.joystickKnob = document.getElementById('joystick-knob')!;
    this.swipeZone = document.getElementById('camera-swipe-zone')!;
    this.attackEl = document.getElementById('btn-attack');

    this.bindJoystick();
    this.bindSwipeAndTap();
    this.bindAttackButton();
    this.bindActionBtn('btn-strong', () => { this.strongQueued = true; });
    this.bindActionBtn('btn-dodge', () => { this.dodgeQueued = true; });
    this.bindActionBtn('btn-musou', () => { this.musouQueued = true; });
    this.bindGlobalSafetyResets();
  }

  private resetStick = (): void => {
    if (this.joyPointerId !== null) {
      try {
        if (this.joystickZone.hasPointerCapture(this.joyPointerId)) {
          this.joystickZone.releasePointerCapture(this.joyPointerId);
        }
      } catch (_) {}
    }
    this.joyPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.joystickKnob.style.transform = 'translate(0px, 0px)';
  };

  private bindJoystick(): void {
    const updateStick = (clientX: number, clientY: number) => {
      const dx = clientX - this.joyOriginX;
      const dy = clientY - this.joyOriginY;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, this.joyMaxRadius);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;

      this.joystickKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

      if (clamped / this.joyMaxRadius < 0.12) {
        this.moveX = 0;
        this.moveY = 0;
      } else {
        this.moveX = kx / this.joyMaxRadius;
        this.moveY = -(ky / this.joyMaxRadius); // Up on phone = forward (+1)
      }
    };

    this.joystickZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnyTouch?.();
      if (this.joyPointerId !== null && this.joyPointerId !== e.pointerId) {
        this.resetStick();
      }
      this.joyPointerId = e.pointerId;
      try { this.joystickZone.setPointerCapture(e.pointerId); } catch (_) {}

      const rect = this.joystickBase.getBoundingClientRect();
      this.joyOriginX = rect.left + rect.width / 2;
      this.joyOriginY = rect.top + rect.height / 2;
      updateStick(e.clientX, e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
        this.resetStick();
        return;
      }
      updateStick(e.clientX, e.clientY);
    }, { passive: true });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointerId) return;
      this.resetStick();
    };
    window.addEventListener('pointerup', end, { passive: true });
    window.addEventListener('pointercancel', end, { passive: true });
    this.joystickZone.addEventListener('lostpointercapture', end);
  }

  private bindSwipeAndTap(): void {
    this.swipeZone.addEventListener('pointerdown', (e) => {
      if (this.swipePointerId !== null) return;
      e.preventDefault();
      this.onAnyTouch?.();
      this.swipePointerId = e.pointerId;
      this.swipeStartX = e.clientX;
      this.swipeStartY = e.clientY;
      this.swipeLastX = e.clientX;
      this.swipeMoved = false;
      try { this.swipeZone.setPointerCapture(e.pointerId); } catch (_) {}
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.swipePointerId) return;
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
        this.swipePointerId = null;
        return;
      }
      const totalMove = Math.hypot(e.clientX - this.swipeStartX, e.clientY - this.swipeStartY);
      if (totalMove > 22) this.swipeMoved = true;

      const dx = e.clientX - this.swipeLastX;
      this.swipeLastX = e.clientX;
      if (this.swipeMoved) {
        this.cameraDeltaYaw -= dx * 0.0055;
      }
    }, { passive: true });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.swipePointerId) return;
      if (!this.swipeMoved && e.type === 'pointerup') {
        this.tapPos = { x: e.clientX, y: e.clientY };
      }
      this.swipePointerId = null;
    };
    window.addEventListener('pointerup', end, { passive: true });
    window.addEventListener('pointercancel', end, { passive: true });
    this.swipeZone.addEventListener('lostpointercapture', end);
  }

  private bindAttackButton(): void {
    const el = this.attackEl;
    if (!el) return;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnyTouch?.();
      this.attackPointerId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.classList.add('pressed');
      this.attackHeld = true;
      this.attackQueued = true;
    });

    const release = (e: PointerEvent) => {
      if (this.attackPointerId !== null && e.pointerId !== this.attackPointerId) return;
      this.attackPointerId = null;
      this.attackHeld = false;
      el.classList.remove('pressed');
    };
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });
    el.addEventListener('lostpointercapture', release);
  }

  private bindGlobalSafetyResets(): void {
    // Mobile multi-touch safety net: if touch events show no finger remains on the joystick,
    // immediately release the virtual stick so it can never get stuck tilted.
    const checkRemainingTouches = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        this.resetStick();
        this.swipePointerId = null;
        this.attackPointerId = null;
        this.attackHeld = false;
        this.attackEl?.classList.remove('pressed');
        return;
      }
      if (this.joyPointerId !== null) {
        let hasJoystickTouch = false;
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          const target = t.target as Node | null;
          if (target && this.joystickZone.contains(target)) {
            hasJoystickTouch = true;
            break;
          }
        }
        if (!hasJoystickTouch) {
          this.resetStick();
        }
      }
    };

    window.addEventListener('touchend', checkRemainingTouches, { passive: true });
    window.addEventListener('touchcancel', checkRemainingTouches, { passive: true });
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('contextmenu', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  private bindActionBtn(id: string, onPress: () => void): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnyTouch?.();
      el.classList.add('pressed');
      onPress();
    });
    const clear = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', clear);
    el.addEventListener('pointercancel', clear);
    el.addEventListener('pointerleave', clear);
  }

  consume(): TouchState {
    const state: TouchState = {
      moveX: this.moveX,
      moveY: this.moveY,
      cameraDeltaYaw: this.cameraDeltaYaw,
      attackHeld: this.attackHeld,
      attackPressed: this.attackQueued,
      strongPressed: this.strongQueued,
      dodgePressed: this.dodgeQueued,
      musouPressed: this.musouQueued,
      tapScreenPos: this.tapPos
    };
    this.cameraDeltaYaw = 0;
    this.attackQueued = false;
    this.strongQueued = false;
    this.dodgeQueued = false;
    this.musouQueued = false;
    this.tapPos = null;
    return state;
  }

  reset(): void {
    this.resetStick();
    this.swipePointerId = null;
    this.attackPointerId = null;
    this.cameraDeltaYaw = 0;
    this.attackHeld = false;
    this.attackEl?.classList.remove('pressed');
    this.attackQueued = false;
    this.strongQueued = false;
    this.dodgeQueued = false;
    this.musouQueued = false;
    this.tapPos = null;
  }
}
