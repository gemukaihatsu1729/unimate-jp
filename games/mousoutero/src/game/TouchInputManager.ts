export interface TouchInputState {
  moveX: number; // -1..1 (right positive)
  moveY: number; // -1..1 (up/forward positive)
  sprinting: boolean;
  cameraDeltaYaw: number;
  attackPressed: boolean;
  specialPressed: boolean;
  dodgePressed: boolean;
  contextPressed: boolean;
  awakenPressed: boolean;
}

export class TouchInputManager {
  private moveX = 0;
  private moveY = 0;
  private sprinting = false;
  private cameraDeltaYaw = 0;

  private attackQueued = false;
  private specialQueued = false;
  private dodgeQueued = false;
  private contextQueued = false;
  private awakenQueued = false;

  private joyPointerId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private readonly joyMaxRadius = 46;

  private swipePointerId: number | null = null;
  private swipeLastX = 0;

  private joystickZone: HTMLElement;
  private joystickBase: HTMLElement;
  private joystickKnob: HTMLElement;
  private swipeZone: HTMLElement;

  constructor(private onAnyTouch?: () => void) {
    this.joystickZone = document.getElementById('joystick-zone')!;
    this.joystickBase = document.getElementById('joystick-base')!;
    this.joystickKnob = document.getElementById('joystick-knob')!;
    this.swipeZone = document.getElementById('camera-swipe-zone')!;

    this.bindJoystick();
    this.bindCameraSwipe();
    this.bindButton('btn-attack', () => {
      this.attackQueued = true;
    });
    this.bindButton('btn-special', () => {
      this.specialQueued = true;
    });
    this.bindButton('btn-dodge', () => {
      this.dodgeQueued = true;
    });
    this.bindButton('btn-context', () => {
      this.contextQueued = true;
    });
    this.bindButton('btn-awaken', () => {
      this.awakenQueued = true;
    });
  }

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

      const norm = clamped / this.joyMaxRadius;
      if (norm < 0.12) {
        this.moveX = 0;
        this.moveY = 0;
        this.sprinting = false;
      } else {
        this.moveX = (kx / this.joyMaxRadius);
        this.moveY = -(ky / this.joyMaxRadius); // screen up = forward (+1)
        this.sprinting = norm > 0.82;
      }
    };

    const resetStick = () => {
      this.joyPointerId = null;
      this.moveX = 0;
      this.moveY = 0;
      this.sprinting = false;
      this.joystickKnob.style.transform = 'translate(0px, 0px)';
    };

    this.joystickZone.addEventListener('pointerdown', (e) => {
      if (this.joyPointerId !== null) return;
      e.preventDefault();
      this.onAnyTouch?.();
      this.joyPointerId = e.pointerId;
      this.joystickZone.setPointerCapture(e.pointerId);

      const rect = this.joystickBase.getBoundingClientRect();
      this.joyOriginX = rect.left + rect.width / 2;
      this.joyOriginY = rect.top + rect.height / 2;
      updateStick(e.clientX, e.clientY);
    });

    this.joystickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      e.preventDefault();
      updateStick(e.clientX, e.clientY);
    });

    const onEnd = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointerId) return;
      e.preventDefault();
      resetStick();
    };
    this.joystickZone.addEventListener('pointerup', onEnd);
    this.joystickZone.addEventListener('pointercancel', onEnd);
  }

  private bindCameraSwipe(): void {
    this.swipeZone.addEventListener('pointerdown', (e) => {
      if (this.swipePointerId !== null) return;
      e.preventDefault();
      this.onAnyTouch?.();
      this.swipePointerId = e.pointerId;
      this.swipeLastX = e.clientX;
      this.swipeZone.setPointerCapture(e.pointerId);
    });

    this.swipeZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.swipePointerId) return;
      e.preventDefault();
      const dx = e.clientX - this.swipeLastX;
      this.swipeLastX = e.clientX;
      this.cameraDeltaYaw -= dx * 0.0065;
    });

    const onEnd = (e: PointerEvent) => {
      if (e.pointerId !== this.swipePointerId) return;
      this.swipePointerId = null;
    };
    this.swipeZone.addEventListener('pointerup', onEnd);
    this.swipeZone.addEventListener('pointercancel', onEnd);
  }

  private bindButton(id: string, onPress: () => void): void {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnyTouch?.();
      el.classList.add('pressed');
      onPress();
    });

    const clearPressed = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', clearPressed);
    el.addEventListener('pointercancel', clearPressed);
    el.addEventListener('pointerleave', clearPressed);
  }

  consumeState(): TouchInputState {
    const state: TouchInputState = {
      moveX: this.moveX,
      moveY: this.moveY,
      sprinting: this.sprinting,
      cameraDeltaYaw: this.cameraDeltaYaw,
      attackPressed: this.attackQueued,
      specialPressed: this.specialQueued,
      dodgePressed: this.dodgeQueued,
      contextPressed: this.contextQueued,
      awakenPressed: this.awakenQueued
    };

    this.cameraDeltaYaw = 0;
    this.attackQueued = false;
    this.specialQueued = false;
    this.dodgeQueued = false;
    this.contextQueued = false;
    this.awakenQueued = false;

    return state;
  }

  reset(): void {
    this.joyPointerId = null;
    this.swipePointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.sprinting = false;
    this.cameraDeltaYaw = 0;
    this.attackQueued = false;
    this.specialQueued = false;
    this.dodgeQueued = false;
    this.contextQueued = false;
    this.awakenQueued = false;
    this.joystickKnob.style.transform = 'translate(0px, 0px)';
  }
}
